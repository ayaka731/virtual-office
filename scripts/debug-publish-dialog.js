#!/usr/bin/env node
/**
 * 公開ダイアログのボタン名を調査するデバッグスクリプト
 * 既存の下書きURLを開いて「公開に進む」をクリックし、ダイアログを確認する
 */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PROFILE_DIR = path.join(os.homedir(), '.note-playwright-profile');
const logsDir = path.join(__dirname, '..', 'logs');

// 直前に保存した下書き記事のURL
// post-to-note.jsで保存されたURLをここに指定
const DRAFT_URL = process.argv[2] || 'https://editor.note.com/notes/n9bd8978a9457/edit/';

(async () => {
  console.log('🔍 下書きURLを開いて公開ダイアログを調査:', DRAFT_URL);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  // 既存下書きを開く
  await page.goto(DRAFT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: path.join(logsDir, 'debug-draft-opened.png'), fullPage: false });
  console.log('📸 下書きを開いた状態');

  // 「公開に進む」クリック
  const publishBtn = page.locator('button:has-text("公開に進む")').first();
  if (await publishBtn.isVisible({ timeout: 10000 })) {
    await publishBtn.click();
    console.log('✅ 「公開に進む」クリック');
  } else {
    console.log('❌ 「公開に進む」ボタンが見つかりません');
    await context.close();
    process.exit(1);
  }

  // ダイアログが出るまで待機
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(logsDir, 'debug-after-publish-btn.png'), fullPage: false });
  console.log('📸 クリック後の状態');

  // さらに待機してから再スキャン
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(logsDir, 'debug-after-publish-btn2.png'), fullPage: false });

  // ページ上の全ボタンテキストを表示
  const allBtns = page.locator('button, [role="button"]');
  const count = await allBtns.count();
  console.log(`\n=== 全ボタン (${count}件) ===`);
  for (let i = 0; i < count; i++) {
    try {
      const txt = (await allBtns.nth(i).textContent() || '').trim();
      const vis = await allBtns.nth(i).isVisible().catch(() => false);
      if (txt) console.log(`[${i}] ${vis ? '👁' : '🙈'} "${txt}"`);
    } catch(e) {}
  }

  // モーダル・サイドパネルの確認
  const panelSelectors = [
    '[role="dialog"]',
    '[class*="publish"]',
    '[class*="Publish"]',
    '[class*="modal"]',
    '[class*="Modal"]',
    '[class*="setting"]',
    '[class*="Setting"]',
    '[class*="panel"]',
    '[class*="Panel"]',
    '[class*="drawer"]',
    '[class*="Drawer"]',
  ];

  console.log('\n=== パネル/ダイアログ探索 ===');
  for (const sel of panelSelectors) {
    try {
      const els = page.locator(sel);
      const cnt = await els.count();
      for (let i = 0; i < Math.min(cnt, 3); i++) {
        const vis = await els.nth(i).isVisible().catch(() => false);
        if (vis) {
          const html = await els.nth(i).innerHTML().catch(() => '');
          console.log(`\n[${sel}] (${i}番目, 表示中):`);
          // ボタンテキストだけを抽出
          const btns = await page.evaluate((selector, index) => {
            const allEls = document.querySelectorAll(selector);
            if (!allEls[index]) return [];
            return Array.from(allEls[index].querySelectorAll('button, [role="button"]')).map(b => b.textContent.trim()).filter(t => t);
          }, sel, i);
          if (btns.length) console.log('  ボタン:', JSON.stringify(btns));
        }
      }
    } catch(e) {}
  }

  await context.close();
  console.log('\n✅ 調査完了。logs/debug-after-publish-btn.png を確認してください。');
})().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });
