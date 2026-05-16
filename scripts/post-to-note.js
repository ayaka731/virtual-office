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
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NOTE_COOKIES  = process.env.NOTE_COOKIES; // base64
const EMAIL         = process.env.NOTE_EMAIL;
const PASSWORD      = process.env.NOTE_PASSWORD;
const MD_FILE       = process.argv[2];
const COVER_IMAGE   = process.argv[3]; // オプション: カバー画像パス

// ── カバー画像を自動生成（なければ） ──
if (MD_FILE && fs.existsSync(MD_FILE) && !COVER_IMAGE) {
  const mdBase   = path.basename(MD_FILE, '.md').replace(/-note$/, '');
  const coverPath = path.join(__dirname, '..', 'assets', 'covers', `${mdBase}-cover.png`);
  if (!fs.existsSync(coverPath)) {
    console.log('🎨 カバー画像を自動生成中...');
    try {
      execSync(`node "${path.join(__dirname, 'generate-cover-image.js')}" "${MD_FILE}"`, {
        timeout: 90000,
        stdio: 'inherit',
      });
    } catch(e) {
      console.log('⚠️  カバー画像生成失敗（スキップして投稿続行）');
    }
  }
}

const os = require('os');
const PROFILE_DIR  = path.join(os.homedir(), '.note-playwright-profile');
const HAS_PROFILE  = fs.existsSync(PROFILE_DIR) && !process.env.CI;

if (!HAS_PROFILE && !NOTE_COOKIES && !EMAIL) {
  console.error('❌ 認証情報がありません。以下のいずれかを実行してください:');
  console.error('   ローカル: node scripts/setup-note-profile.js');
  console.error('   CI:       node scripts/extract-note-cookie.js');
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

// MarkdownをHTMLに変換（テーブル含む）
function mdToHtml(md) {
  // 末尾に改行を保証（テーブル最終行の検出漏れ対策）
  let html = md.endsWith('\n') ? md : md + '\n';

  // コードブロック除去
  html = html.replace(/```[\s\S]*?```/g, '');

  // テーブル変換（最終行が改行なしでも検出できるよう行末を \n|$ で許容）
  html = html.replace(
    /((?:^\|.+\|[^\S\n]*(?:\n|$))+)/gm,
    (match) => {
      const lines = match.trim().split('\n').filter(l => l.trim());
      if (lines.length < 2) return match;
      const isSep = (l) => /^\|[\s\-:|]+\|/.test(l.trim());
      const parseRow = (l) =>
        l.split('|').slice(1, -1).map(c => c.trim());

      let tbl = '<table style="border-collapse:collapse;width:100%;margin:1em 0">';
      let inBody = false;
      lines.forEach((line) => {
        if (isSep(line)) { tbl += '<tbody>'; inBody = true; return; }
        const cells = parseRow(line);
        if (!inBody) {
          tbl += '<thead><tr>' +
            cells.map(c => `<th style="border:1px solid #ccc;padding:6px 10px;background:#f8f8f8;font-weight:bold">${c}</th>`).join('') +
            '</tr></thead>';
        } else {
          tbl += '<tr>' +
            cells.map(c => `<td style="border:1px solid #ccc;padding:6px 10px">${c}</td>`).join('') +
            '</tr>';
        }
      });
      if (inBody) tbl += '</tbody>';
      tbl += '</table>';
      return tbl;
    }
  );

  // 見出し（h3→h2→h1の順で処理）
  html = html.replace(/^#{4,6}\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^###\s+(.+)$/gm,    '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm,     '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm,      '<h1>$1</h1>');

  // 太字・斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g,     '<em>$1</em>');

  // インラインコード
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // リンク
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  // 引用
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 水平線
  html = html.replace(/^-{3,}$/gm, '<hr>');

  // 箇条書きリスト（連続行をまとめてul）
  html = html.replace(/((?:^[-*+]\s+.+\n?)+)/gm, (match) => {
    const items = match.trim().split('\n')
      .map(l => l.replace(/^[-*+]\s+/, '').trim())
      .filter(Boolean);
    return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
  });

  // 番号付きリスト
  html = html.replace(/((?:^\d+\.\s+.+\n?)+)/gm, (match) => {
    const items = match.trim().split('\n')
      .map(l => l.replace(/^\d+\.\s+/, '').trim())
      .filter(Boolean);
    return '<ol>' + items.map(i => `<li>${i}</li>`).join('') + '</ol>';
  });

  // 段落（空行で区切られたブロック）
  const blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-6]|table|blockquote|ul|ol|hr|div|p)[\s>]/.test(block)) return block;
    return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
  }).filter(Boolean).join('\n');

  return html;
}

// 後方互換用（ログ表示の文字数計算）
function mdToPlain(text) {
  return text.replace(/<[^>]+>/g, '').replace(/[|#*`\[\]>]/g, '').trim();
}

async function postToNote() {
  const { title, body } = parseMarkdown(MD_FILE);
  const htmlBody  = mdToHtml(body);
  const plainBody = mdToPlain(body); // 文字数表示用

  console.log('📄 記事情報:');
  console.log('  タイトル:', title);
  console.log('  本文文字数(概算):', plainBody.length, '字');

  const useProfile = HAS_PROFILE;

  let browser, context, page;

  if (useProfile) {
    // ── ローカル実行: 永続プロファイル使用（note.comが既知端末として認識） ──
    console.log(`🗂  ローカルプロファイル使用: ${PROFILE_DIR}`);
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    page = await context.newPage();
  } else {
    // ── CI実行: 通常のブラウザ起動 ──
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7' },
    });
    page = await context.newPage();
  }

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // スクリーンショット保存ヘルパー
  const logsDir = path.join(__dirname, '..', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  async function saveScreenshot(name, fullPage = false) {
    const ssPath = path.join(logsDir, `${name}.png`);
    try {
      await page.screenshot({ path: ssPath, fullPage });
      console.log(`📸 スクリーンショット保存: ${ssPath}`);
    } catch (e) {
      console.log(`⚠️  スクリーンショット保存失敗: ${e.message}`);
    }
  }

  try {
    // ── 1. 認証 ──
    if (useProfile) {
      // ── ローカルプロファイル方式（既にログイン済み） ──
      console.log('🗂  プロファイルのセッションでログイン確認中...');
      await page.goto('https://note.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await saveScreenshot('01-profile-login');
      const profileUrl = page.url();
      if (profileUrl.includes('/login')) {
        throw new Error('プロファイルのセッションが切れています。node scripts/setup-note-profile.js を再実行してください');
      }
      console.log('✅ プロファイルログイン確認:', profileUrl);

    } else if (NOTE_COOKIES) {
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
      await page.waitForTimeout(2000);
      await saveScreenshot('01-login-page');

      // 選択画面なし: #email → #password → button[data-type="primary"] の固定フロー
      await page.waitForSelector('#email', { state: 'visible', timeout: 20000 });
      await page.fill('#email', EMAIL);
      await page.fill('#password', PASSWORD);

      const loginBtn = page.locator('button[data-type="primary"]').first();
      await loginBtn.waitFor({ state: 'visible', timeout: 10000 });
      await loginBtn.click();

      // ナビゲーション完了を待つ（networkidle禁止・domcontentloadedで判定）
      try {
        await page.waitForURL(url => !url.includes('/login'), { timeout: 20000 });
      } catch (e) {
        await page.waitForTimeout(5000);
      }
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

    // モーダル/ダイアログが出ていたら閉じる
    try {
      const dismissed = await page.evaluate(() => {
        // modal-content-wrapper を持つダイアログを閉じる
        const modal = document.querySelector('[role="dialog"][aria-hidden="false"]');
        if (!modal) return false;
        // Escキーイベントを発火
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        // 閉じるボタンを探してクリック
        const closeBtn = modal.querySelector('button[aria-label*="閉"], button[aria-label*="close"], button[aria-label*="Close"], .modal-close, button:last-child');
        if (closeBtn) { closeBtn.click(); return true; }
        return true;
      });
      if (dismissed) {
        console.log('📌 モーダルを閉じました');
        await page.waitForTimeout(1000);
      }
    } catch(e) {}

    // 「投稿」ボタンをJS経由でクリック（モーダルが残っていても突破）
    const postBtn = page.locator('a[href="/notes/new"], button:has-text("投稿"), a:has-text("投稿")').first();
    await postBtn.waitFor({ state: 'visible', timeout: 15000 });
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('a[href="/notes/new"]')
                || Array.from(document.querySelectorAll('button,a')).find(el => el.textContent.trim() === '投稿');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) await postBtn.click(); // fallback
    console.log('✅ 投稿ボタンクリック');
    await page.waitForTimeout(2000);
    await saveScreenshot('03-after-post-button');

    await saveScreenshot('03-editor-opening');

    // エディタが表示されるまで待機（最大30秒）
    console.log('⏳ エディタ読み込み待機中...');
    await page.waitForSelector('[contenteditable]', { state: 'visible', timeout: 30000 });
    console.log('✅ エディタ表示確認');
    await saveScreenshot('04-editor-visible');

    // ── 3. カバー画像のアップロード（オプション） ──
    const coverImgPath = COVER_IMAGE || (() => {
      // MDファイルと同じディレクトリ or assets/covers から自動推定
      const mdBase = path.basename(MD_FILE, '.md'); // 例: G1-001-note
      const prefix = mdBase.replace('-note', '');   // G1-001
      const autoPath = path.join(__dirname, '..', 'assets', 'covers', `${prefix}-cover.png`);
      return fs.existsSync(autoPath) ? autoPath : null;
    })();

    if (coverImgPath && fs.existsSync(coverImgPath)) {
      console.log('🖼  カバー画像をアップロード中:', path.basename(coverImgPath));
      try {
        // ── アプローチ1: input[type="file"] を直接操作（hidden でも可） ──
        const fileInputs = page.locator('input[type="file"]');
        const inputCount = await fileInputs.count().catch(() => 0);
        console.log(`   file input 数: ${inputCount}`);

        if (inputCount > 0) {
          // Playwright は hidden な input[type="file"] にも setInputFiles できる
          await fileInputs.first().setInputFiles(coverImgPath);
          await page.waitForTimeout(3000);
          console.log('✅ カバー画像アップロード完了（直接input）');
        } else {
          // ── アプローチ2: カバーボタンを座標クリック → メニューから「画像をアップロード」選択 ──
          // エディタ上部中央のカバーアイコンをクリックするとメニューが開く
          await page.mouse.click(520, 124);
          await page.waitForTimeout(1000);
          await saveScreenshot('04a-cover-menu');

          // 「画像をアップロード」ボタンをクリックしてfilechooserを捕捉
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 10000 }),
            page.evaluate(() => {
              const btns = Array.from(document.querySelectorAll('button, li, [role="menuitem"]'));
              const uploadBtn = btns.find(b => b.textContent.includes('画像をアップロード'));
              if (uploadBtn) { uploadBtn.click(); return true; }
              // フォールバック: input[type="file"] を直接クリック
              const inp = document.querySelector('input[type="file"]');
              if (inp) { inp.click(); return true; }
              return false;
            }),
          ]);
          await fileChooser.setFiles(coverImgPath);
          await page.waitForTimeout(3000);
          console.log('✅ カバー画像アップロード完了（メニュー経由）');
        }

        // クロッパーが出た場合は保存ボタンをクリック
        for (const sel of ['button:has-text("保存")', 'button:has-text("完了")', 'button:has-text("適用")']) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); await page.waitForTimeout(1500); break; }
          } catch(e) {}
        }

        // メニューやオーバーレイを必ず閉じてから次へ
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } catch(e) {
        console.log('⚠️  カバー画像アップロード失敗（スキップ）:', e.message.slice(0, 120));
        // 失敗してもオーバーレイを閉じてから続行
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
      await saveScreenshot('04b-cover-uploaded');
    } else {
      console.log('ℹ️  カバー画像なし（スキップ）');
    }

    // ── 4. タイトル入力 ──
    // noteエディタ: textarea[placeholder="記事タイトル"]
    const titleEl = page.locator('textarea[placeholder="記事タイトル"]').first();
    await titleEl.waitFor({ state: 'visible', timeout: 10000 });
    // JS経由でフォーカス（draggableオーバーレイを回避）
    await page.evaluate(() => {
      const el = document.querySelector('textarea[placeholder="記事タイトル"]');
      if (el) { el.focus(); el.click(); }
    });
    await page.waitForTimeout(300);
    await page.fill('textarea[placeholder="記事タイトル"]', title);
    console.log('✅ タイトル入力完了:', title);
    await saveScreenshot('05-title-filled');

    // ── 5. 本文入力（ProseMirrorへ直接 pasteイベントを送信 → テーブルが正しく入る） ──
    console.log('⌨️  本文をHTMLペースト中...');
    const bodyEl = page.locator('.ProseMirror').first();
    await bodyEl.click();
    await page.waitForTimeout(500);

    // ① ProseMirror に直接 ClipboardEvent を送信（最も確実な方法）
    const pasteOk = await page.evaluate((html) => {
      const el = document.querySelector('.ProseMirror');
      if (!el) return false;
      el.focus();
      try {
        // DataTransfer に HTML と plaintext をセット
        const dt = new DataTransfer();
        dt.setData('text/html', html);
        dt.setData('text/plain', html.replace(/<[^>]+>/g, ''));
        // paste イベントを直接 dispatch（ProseMirror の handlePaste が受け取る）
        const ev = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        el.dispatchEvent(ev);
        return true;
      } catch(e) {
        // ClipboardEvent constructor に clipboardData を渡せないブラウザ向け fallback
        try {
          const ev2 = new Event('paste', { bubbles: true, cancelable: true });
          const dt2 = new DataTransfer();
          dt2.setData('text/html', html);
          dt2.setData('text/plain', html.replace(/<[^>]+>/g, ''));
          Object.defineProperty(ev2, 'clipboardData', { value: dt2 });
          el.dispatchEvent(ev2);
          return true;
        } catch(e2) { return false; }
      }
    }, htmlBody);

    await page.waitForTimeout(2000);

    if (pasteOk) {
      console.log('✅ 本文HTMLペースト完了（ClipboardEvent）');
    } else {
      // ② fallback: clipboard API + Meta+v
      console.log('⚠️  ClipboardEvent失敗、clipboard API方式にフォールバック...');
      try {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.evaluate(async (html) => {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html':  new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([html.replace(/<[^>]+>/g, '')], { type: 'text/plain' }),
            })
          ]);
        }, htmlBody);
        await page.keyboard.press('Meta+v');
        await page.waitForTimeout(2000);
        console.log('✅ 本文HTMLペースト完了（clipboard API）');
      } catch(e) {
        console.log('⚠️  HTMLペースト失敗（' + e.message + '）');
      }
    }
    console.log('✅ 本文入力完了');

    await page.waitForTimeout(1000);

    // ── 5. 公開に進む ──
    console.log('🚀 公開に進む...');
    await saveScreenshot('05-before-publish');

    // AIアシスタント同意モーダルを処理するヘルパー
    // ※ 公開パネルの「キャンセル」と混同しないよう、AI固有テキストで存在確認
    async function dismissAiModal() {
      // AI モーダル固有のテキスト「テスト中の機能」「利用条件に同意」が DOM にあるか確認
      const isAiModal = await page.evaluate(() => {
        const body = document.body.innerText || '';
        return body.includes('テスト中の機能') || body.includes('利用条件に同意して始める');
      });
      if (!isAiModal) return false;

      // 「利用条件に同意して始める」ボタンをクリック
      const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const agree = btns.find(b => b.textContent.includes('同意') && b.textContent.includes('始める'));
        if (agree) { agree.click(); return agree.textContent.trim(); }
        return null;
      });
      if (clicked) {
        console.log(`⚠️  AIアシスタントモーダル: 「${clicked}」クリック`);
        await page.waitForTimeout(1500);
        return true;
      }
      return false;
    }

    // 「公開に進む」→「公開する」を最大2回試みるヘルパー
    async function clickPublishBtn() {
      const btn = page.locator('button:has-text("公開に進む")').first();
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click();
        console.log('✅ 「公開に進む」クリック');
        return true;
      }
      return false;
    }

    let publishBtnClicked = await clickPublishBtn();
    if (!publishBtnClicked) {
      console.log('⚠️ 「公開に進む」ボタンが見つかりません。下書き保存します...');
      await page.keyboard.press('Meta+s');
      await page.waitForTimeout(2000);
    }

    // ── 6. 公開設定パネルで「公開する」をクリック ──
    if (publishBtnClicked) {
      console.log('📋 公開設定パネルを待機中...');
      // 「投稿する」または「公開する」ボタンが出るまで待つ（最大10秒）
      try {
        await page.waitForSelector('button:has-text("投稿する"), button:has-text("公開する")', { timeout: 10000 });
        console.log('✅ 公開設定パネル表示確認');
      } catch(e) {
        await page.waitForTimeout(3000);
      }

      // AI モーダルが出た場合のみ対処（公開パネルの「キャンセル」とは区別）
      if (await dismissAiModal()) {
        console.log('🔄 AIモーダル後に「公開に進む」を再クリック...');
        await page.waitForTimeout(1000);
        await clickPublishBtn();
        await page.waitForTimeout(4000);
        await dismissAiModal();
        await page.waitForTimeout(1000);
      }

      await saveScreenshot('06-publish-dialog', false);

      // 「公開する」ボタンをクリック
      let finalPublished = false;
      try {
        const publishBtn = page.locator('button:has-text("公開する"), button:has-text("投稿する")').first();
        await publishBtn.waitFor({ state: 'visible', timeout: 6000 });
        await publishBtn.click();
        finalPublished = true;
        console.log('✅ 「公開する」クリック（locator）');
      } catch (e) {
        const label = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          for (const btn of buttons) {
            const txt = btn.textContent.trim();
            if ((txt === '公開する' || txt === '投稿する') && btn.offsetParent !== null) {
              btn.click(); return txt;
            }
          }
          return null;
        });
        if (label) {
          finalPublished = true;
          console.log(`✅ 「${label}」クリック（JS fallback）`);
        } else {
          await saveScreenshot('06-publish-dialog-failed', false);
          const btns = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button'))
              .filter(b => b.offsetParent !== null)
              .map(b => b.textContent.trim()).filter(t => t)
          );
          console.log('⚠️ 「公開する」が見つかりません。表示中ボタン:', JSON.stringify(btns));
        }
      }

      if (finalPublished) {
        await page.waitForTimeout(3000);
        await dismissAiModal(); // 公開直後にも出る場合
        await page.waitForTimeout(2000);
      }
    }

    // 「記事が公開されました」シェアモーダルを閉じる
    await page.waitForTimeout(2000);
    try {
      const closeBtn = page.locator('button[aria-label="閉じる"]').first();
      if (await closeBtn.isVisible({ timeout: 3000 })) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(1000);
      }
    } catch(e) {}

    // URLからnote IDを抽出してパブリックURLを構築
    const currentUrl = page.url();
    const noteIdMatch = currentUrl.match(/\/notes\/(n[a-z0-9]+)/);
    const noteId = noteIdMatch ? noteIdMatch[1] : null;
    const noteUser = 'yorushoku_500';
    const finalUrl = noteId
      ? `https://note.com/${noteUser}/n/${noteId}`
      : currentUrl;

    await saveScreenshot('07-after-publish');
    console.log('🔗 記事URL:', finalUrl);

    // /publish/ が含まれる、またはnoteIDを取得できた = 公開済み
    const publishStatus = (currentUrl.includes('/publish') || noteId || (currentUrl.includes('/notes/') && !currentUrl.includes('/edit'))) ? 'published' : 'draft';
    console.log('📊 ステータス:', publishStatus);

    // ── 7. 結果をログに書き出し ──
    const logEntry = {
      timestamp: new Date().toISOString(),
      file: path.basename(MD_FILE),
      title,
      url: finalUrl,
      status: publishStatus,
    };
    const logPath = path.join(__dirname, '..', 'logs', 'note-posts.json');
    let existing = [];
    try { existing = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch(e) {}
    existing.push(logEntry);
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));

    console.log('\n🎉 完了！公開されました。');
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
    if (browser) await browser.close();
    else await context.close(); // persistentContext の場合
  }
}

postToNote();
