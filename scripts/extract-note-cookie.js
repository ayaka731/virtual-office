#!/usr/bin/env node
/**
 * noteのセッションCookieを抽出するスクリプト
 * 使い方: node scripts/extract-note-cookie.js
 *
 * ブラウザが起動するので、手動でログイン（reCAPTCHA含む）完了後
 * Enterキーを押すとCookieを抽出してGitHub Secretsに設定するコマンドを表示します
 */

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');

async function extractCookie() {
  console.log('🌐 ブラウザを起動します（画面が表示されます）...');

  const browser = await chromium.launch({
    headless: false, // 手動操作のため表示モード
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();
  await page.goto('https://note.com/login', { waitUntil: 'domcontentloaded' });

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 ブラウザでnote.comにログインしてください');
  console.log('   reCAPTCHAにチェックを入れてからログインボタンを押してください');
  console.log('   ログイン完了（ダッシュボードが表示）したらここでEnterを押してください');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Enterキー待機
  await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('✅ ログイン完了したらEnterを押してください: ', () => {
      rl.close();
      resolve();
    });
  });

  // 現在のURLを確認
  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    console.error('❌ まだログインページにいます。先にログインを完了してください。');
    await browser.close();
    process.exit(1);
  }

  console.log('✅ ログイン確認:', currentUrl);

  // Cookieを取得
  const cookies = await context.cookies();
  const noteCookies = cookies.filter(c => c.domain.includes('note.com'));

  if (noteCookies.length === 0) {
    console.error('❌ note.comのCookieが見つかりません');
    await browser.close();
    process.exit(1);
  }

  console.log(`🍪 Cookie取得: ${noteCookies.length}件`);

  const cookieJson = JSON.stringify(noteCookies);
  const cookieB64 = Buffer.from(cookieJson).toString('base64');

  await browser.close();

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 GitHub SecretにCookieを保存します...');

  // gh CLIで自動設定
  const ghPath = process.env.GH_PATH || `${process.env.HOME}/bin/gh`;
  try {
    execSync(`printf '%s' '${cookieB64}' | ${ghPath} secret set NOTE_COOKIES -R ayaka731/virtual-office`, { stdio: 'inherit' });
    console.log('✅ NOTE_COOKIES をGitHub Secretsに保存しました');
  } catch (e) {
    console.log('⚠️  自動保存失敗。手動で以下を実行してください:');
    console.log(`printf '${cookieB64}' | ~/bin/gh secret set NOTE_COOKIES`);
  }

  console.log('');
  console.log('🎉 完了！GitHub Actionsでのnote自動投稿が使えるようになります。');
  console.log('   Cookieが切れた場合（数週間〜数ヶ月後）は再度このスクリプトを実行してください。');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

extractCookie().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
