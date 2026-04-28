#!/usr/bin/env node
/**
 * note自動投稿スクリプト
 * 使い方: NOTE_EMAIL=xxx NOTE_PASSWORD=yyy node post-to-note.js <mdファイルパス>
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EMAIL    = process.env.NOTE_EMAIL;
const PASSWORD = process.env.NOTE_PASSWORD;
const MD_FILE  = process.argv[2];

if (!EMAIL && !PASSWORD) {
  console.error('❌ 環境変数 NOTE_EMAIL と NOTE_PASSWORD が設定されていません');
  console.error('   GitHub Secrets に NOTE_EMAIL / NOTE_PASSWORD を登録してください');
  process.exit(1);
}
if (!EMAIL) {
  console.error('❌ 環境変数 NOTE_EMAIL が設定されていません');
  process.exit(1);
}
if (!PASSWORD) {
  console.error('❌ 環境変数 NOTE_PASSWORD が設定されていません');
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
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
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
    // ── 1. ログイン ──
    console.log('🔐 noteにログイン中...');
    await page.goto('https://note.com/login', { waitUntil: 'networkidle', timeout: 30000 });
    await saveScreenshot('01-login-page');

    // メールアドレスでログインのボタン/リンクをクリック（選択画面が表示される場合）
    const emailLoginSelectors = [
      'button:has-text("メールアドレスでログイン")',
      'a:has-text("メールアドレスでログイン")',
      'button:has-text("メールアドレス")',
      'a:has-text("メールアドレス")',
      'button:has-text("メール")',
      'a:has-text("メール")',
      '[data-type="email"]',
      'button:has-text("mail")',
      'a:has-text("mail")',
    ];

    for (const sel of emailLoginSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          console.log(`✅ メールログインボタン発見: ${sel}`);
          await el.click();
          await page.waitForTimeout(1500);
          await saveScreenshot('02-after-email-button');
          break;
        }
      } catch (e) {}
    }

    // メールアドレス入力欄が表示されるまで待つ
    console.log('⏳ メール入力欄を待機中...');
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 30000 });
    await saveScreenshot('03-email-input-visible');

    // メールアドレス入力
    await page.fill('input[type="email"], input[name="email"]', EMAIL);
    console.log('✅ メールアドレス入力完了');
    await saveScreenshot('04-email-filled');

    // パスワード入力
    await page.fill('input[type="password"]', PASSWORD);
    console.log('✅ パスワード入力完了');
    await saveScreenshot('05-password-filled');

    // ログインボタンクリック
    await page.click('button[type="submit"]');
    console.log('✅ ログインボタンクリック');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
    await saveScreenshot('06-after-login');

    // ログイン確認
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      await saveScreenshot('login-failed');
      console.error('❌ ログイン失敗: メールアドレスまたはパスワードが正しくありません');
      console.error('   現在のURL:', currentUrl);
      console.error('   GitHub Secrets の NOTE_EMAIL / NOTE_PASSWORD の値を確認してください');
      throw new Error('ログイン失敗: 認証情報を確認してください（スクリーンショット保存済み）');
    }
    console.log('✅ ログイン成功');

    // ── 2. 新規記事ページへ ──
    console.log('📝 新規記事を作成中...');
    await page.goto('https://note.com/notes/new', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // ── 3. タイトル入力 ──
    // noteのタイトル入力欄（contenteditable or textarea）
    const titleSelectors = [
      'textarea[placeholder*="タイトル"]',
      'input[placeholder*="タイトル"]',
      '[data-placeholder*="タイトル"]',
      '.title-input',
      '[class*="title"] [contenteditable]',
    ];

    let titleFilled = false;
    for (const sel of titleSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          await el.fill(title);
          titleFilled = true;
          console.log('✅ タイトル入力完了');
          break;
        }
      } catch(e) {}
    }

    if (!titleFilled) {
      // フォールバック: 最初のcontenteditable
      await page.locator('[contenteditable="true"]').first().click();
      await page.keyboard.type(title, { delay: 20 });
      console.log('✅ タイトル入力完了（フォールバック）');
    }

    await page.waitForTimeout(500);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    // ── 4. 本文入力 ──
    // 本文エリアをクリック（タイトル以外のcontenteditable）
    const bodySelectors = [
      '[data-placeholder*="本文"]',
      '[placeholder*="本文"]',
      '.note-editor [contenteditable="true"]:not(:first-child)',
      '[class*="body"] [contenteditable]',
    ];

    let bodyFilled = false;
    for (const sel of bodySelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          bodyFilled = true;
          break;
        }
      } catch(e) {}
    }

    if (!bodyFilled) {
      // フォールバック: 2番目のcontenteditable
      const editables = page.locator('[contenteditable="true"]');
      const count = await editables.count();
      if (count > 1) {
        await editables.nth(1).click();
      } else {
        await editables.first().click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
      }
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
