#!/usr/bin/env node
/**
 * noteログイン済みブラウザプロファイルをローカルに保存するスクリプト
 * 初回一度だけ実行すればOK（プロファイルが ~/.note-playwright-profile/ に保存される）
 *
 * 使い方: node scripts/setup-note-profile.js
 */

const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

const PROFILE_DIR = path.join(os.homedir(), '.note-playwright-profile');

(async () => {
  console.log('🌐 ブラウザを起動します（ログインしてください）...');
  console.log(`📁 プロファイル保存先: ${PROFILE_DIR}`);

  // launchPersistentContext でプロファイルを永続化
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
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
  console.log('   ログイン完了を自動検知します（最大5分待機）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ログイン完了を自動検知
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    const url = page.url();
    if (!url.includes('/login')) {
      console.log('\n✅ ログイン検知:', url);
      break;
    }
    process.stdout.write('.');
  }

  if (page.url().includes('/login')) {
    console.error('\n❌ タイムアウト');
    await context.close();
    process.exit(1);
  }

  // note.com のトップページに遷移してセッションを安定させる
  await page.goto('https://note.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  await context.close();
  console.log(`\n🎉 完了！プロファイル保存済み: ${PROFILE_DIR}`);
  console.log('   次回から post-to-note.js がこのプロファイルを使って投稿します');
})().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });
