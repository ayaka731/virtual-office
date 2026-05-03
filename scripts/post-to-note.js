#!/usr/bin/env node
/**
 * note自動投稿スクリプト
 * 認証方法（優先順）:
 *   1. NOTE_COOKIES (base64エンコードされたCookieJSON) ← reCAPTCHA回避のため推奨
 *   2. NOTE_EMAIL + NOTE_PASSWORD (フォームログイン ← reCAPTCHAが出る場合がある)
 *
 * Cookie取得: node scripts/extract-note-cookie.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const NOTE_COOKIES = process.env.NOTE_COOKIES; // base64
const EMAIL        = process.env.NOTE_EMAIL;
const PASSWORD     = process.env.NOTE_PASSWORD;
const MD_FILE      = process.argv[2];

if (!NOTE_COOKIES && !EMAIL) {
  console.error('❌ NOTE_COOKIES または NOTE_EMAIL が設定されていません');
  console.error('   Cookie方式: node scripts/extract-note-cookie.js を実行してください');
  process.exit(1);
}
if (!MD_FILE) {
  console.error('❌ 記事ファイルパスが指定されていません');
  console.error('   使い方: node post-to-note.js <mdファイルパス>');
  console.error('   例: node post-to-note.js ../output/drafts/2026-04-28/G1-001-note.md');
  process.exit(1);
}
if (!fs.existsSync(MD_FILE)) {
  console.error('❌ 記事ファイルが見つかりません:', MD_FILE);
  console.error('   絶対パスまたは実行ディレクトリからの相対パスを確認してください');
  const dir = path.dirname(MD_FILE);
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    console.error('   ディレクトリ内のファイル一覧:', files.join(', ') || '(空)');
  } else {
    console.error('   ディレクトリ自体が存在しません:', dir);
  }
  process.exit(1);
}

// Markdownからタイトルと本文を分離
function parseMarkdown(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  let title = '';
  let bodyLines = [];
  let titleFound = false;

  for (const line of lines) {
    // コメント行スキップ（<!-- --> 形式）
    if (line.trim().startsWith('<!--') || line.trim().startsWith('-->')) continue;
    if (!titleFound && line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '').trim();
      titleFound = true;
      continue;
    }
    bodyLines.push(line);
  }

  // 本文: 連続する空行を1行にまとめ、先頭空行を除去
  const body = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, body };
}

// Markdown記法を平文に変換（noteエディタ用）
function mdToPlain(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')          // 見出し
    .replace(/\*\*(.+?)\*\*/g, '$1')      // 太字
    .replace(/\*(.+?)\*/g, '$1')          // 斜体
    .replace(/`(.+?)`/g, '$1')            // インラインコード
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')   // リンク
    .replace(/^[-*+]\s+/gm, '・')         // リスト
    .replace(/^>\s+/gm, '')               // 引用
    .replace(/^-{3,}$/gm, '')             // 区切り線
    .replace(/```[\s\S]*?```/g, '')       // コードブロック
    .trim();
}

async function postToNote() {
  const { title, body } = parseMarkdown(MD_FILE);
  const plainBody = mdToPlain(body);

  console.log('📄 記事情報:');
  console.log('  タイトル:', title);
  console.log('  本文文字数:', plainBody.length, '字');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  // webdriver フラグを隠す
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  // スクリーンショット保存ヘルパー
  const logsDir = path.join(__dirname, '..', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  async function saveScreenshot(name) {
    const ssPath = path.join(logsDir, `${name}.png`);
    try {
      await page.screenshot({ path: ssPath, fullPage: true });
      console.log(`📸 スクリーンショット保存: ${ssPath}`);
    } catch (e) {
      console.log(`⚠️  スクリーンショット保存失敗: ${e.message}`);
    }
  }

  try {
    // ── 1. 認証 ──
    if (NOTE_COOKIES) {
      // ── Cookie方式（reCAPTCHA回避・推奨） ──
      console.log('🍪 Cookieでログイン中...');
      const cookies = JSON.parse(Buffer.from(NOTE_COOKIES, 'base64').toString('utf8'));
      await context.addCookies(cookies);
      console.log(`✅ Cookie設定完了 (${cookies.length}件)`);

      // ログイン確認のためダッシュボードへ
      await page.goto('https://note.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      await saveScreenshot('01-after-cookie-login');

      const urlAfterCookie = page.url();
      if (urlAfterCookie.includes('/login')) {
        console.error('❌ Cookie期限切れ: ローカルで node scripts/extract-note-cookie.js を再実行してください');
        throw new Error('Cookie期限切れ。extract-note-cookie.jsを再実行してGitHub Secretsを更新してください');
      }
      console.log('✅ Cookieログイン成功:', urlAfterCookie);

    } else {
      // ── メール/パスワード方式（フォールバック） ──
      console.log('🔐 メール/パスワードでログイン中...');
      await page.goto('https://note.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      await saveScreenshot('01-login-page');

      await page.waitForSelector('#email', { state: 'visible', timeout: 20000 });
      await page.click('#email');
      await page.fill('#email', EMAIL);
      await page.click('#password');
      await page.fill('#password', PASSWORD);

      const loginBtn = page.locator('button[data-type="primary"], button.a-button:has-text("ログイン")').first();
      await loginBtn.waitFor({ state: 'visible', timeout: 10000 });
      await loginBtn.click();
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        page.waitForTimeout(10000),
      ]);
      await saveScreenshot('02-after-login');

      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        await saveScreenshot('login-failed');
        throw new Error('ログイン失敗: reCAPTCHAが表示された可能性があります。node scripts/extract-note-cookie.js でCookie方式に切り替えてください');
      }
      console.log('✅ ログイン成功');
    }

    // ── 2. 新規記事ページへ（ホームの「投稿」ボタン経由） ──
    console.log('📝 新規記事を作成中...');
    // 直接 /notes/new へ行くとスピナーで止まるため、ホームの「投稿」ボタン経由で開く
    await page.goto('https://note.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await saveScreenshot('02-homepage');

    // 「投稿」ボタンをクリック
    const postBtn = page.locator('a[href="/notes/new"], button:has-text("投稿"), a:has-text("投稿")').first();
    await postBtn.waitFor({ state: 'visible', timeout: 15000 });
    await postBtn.click();
    console.log('✅ 投稿ボタンクリック');
    await page.waitForTimeout(2000);
    await saveScreenshot('03-after-post-button');

    // モーダルや選択肢が出た場合「テキスト」を選択
    const textOption = page.locator('text=テキスト, a[href*="/notes/new"]').first();
    try {
      if (await textOption.isVisible({ timeout: 3000 })) {
        await textOption.click();
        await page.waitForTimeout(2000);
      }
    } catch(e) {}

    await saveScreenshot('04-editor-opening');

    // エディタが表示されるまで待機（最大60秒）
    console.log('⏳ エディタ読み込み待機中...');
    await page.waitForSelector('[contenteditable="true"]', { state: 'visible', timeout: 60000 });
    console.log('✅ エディタ表示確認');
    await saveScreenshot('05-editor-visible');

    // ── 3. タイトル入力 ──
    const editables = page.locator('[contenteditable="true"]');
    const editableCount = await editables.count();
    console.log(`📝 contenteditable要素数: ${editableCount}`);

    // 1つ目のcontenteditable = タイトル
    const titleEl = editables.first();
    await titleEl.click();
    await page.waitForTimeout(300);
    // fillではなくtypeで入力（contenteditable対応）
    await titleEl.pressSequentially(title, { delay: 10 });
    console.log('✅ タイトル入力完了');
    await saveScreenshot('title-filled');

    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // ── 4. 本文入力 ──
    // タイトル入力後にフォーカスが本文に移る、または2つ目のcontenteditable
    let bodyEl;
    if (editableCount > 1) {
      bodyEl = editables.nth(1);
      await bodyEl.click();
    } else {
      // タイトル末尾でEnter後そのまま本文エリアへ
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(300);

    // 本文をチャンクに分けて入力（長文対策）
    console.log('⌨️  本文入力中... (' + plainBody.length + '字)');
    const CHUNK = 500;
    for (let i = 0; i < plainBody.length; i += CHUNK) {
      await page.keyboard.type(plainBody.slice(i, i + CHUNK), { delay: 5 });
      await page.waitForTimeout(100);
    }
    console.log('✅ 本文入力完了');

    await page.waitForTimeout(1000);

    // ── 5. 下書き保存 ──
    console.log('💾 下書き保存中...');
    const saveSelectors = [
      'button:has-text("下書き保存")',
      'button:has-text("保存")',
      '[aria-label*="保存"]',
      '[class*="save"]',
    ];

    let saved = false;
    for (const sel of saveSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 3000 })) {
          await btn.click();
          await page.waitForTimeout(2000);
          saved = true;
          console.log('✅ 下書き保存完了');
          break;
        }
      } catch(e) {}
    }

    if (!saved) {
      // Cmd+S でフォールバック保存
      await page.keyboard.press('Meta+s');
      await page.waitForTimeout(2000);
      console.log('✅ 下書き保存完了（Cmd+S）');
    }

    // 保存後のURLを記録
    await page.waitForTimeout(1500);
    const finalUrl = page.url();
    console.log('🔗 記事URL:', finalUrl);

    // ── 6. 結果をログに書き出し ──
    const logEntry = {
      timestamp: new Date().toISOString(),
      file: path.basename(MD_FILE),
      title,
      url: finalUrl,
      status: 'draft',
    };
    const logPath = path.join(__dirname, '..', 'logs', 'note-posts.json');
    let existing = [];
    try { existing = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch(e) {}
    existing.push(logEntry);
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));

    console.log('\n🎉 完了！下書き保存されました。');
    console.log(JSON.stringify(logEntry, null, 2));

  } catch (err) {
    // スクリーンショットを保存してデバッグ用に
    try {
      await saveScreenshot('error-screenshot');
    } catch (ssErr) {
      console.error('⚠️  スクリーンショット保存失敗:', ssErr.message);
    }
    console.error('❌ エラー:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

postToNote();
