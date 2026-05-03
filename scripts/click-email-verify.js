const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const PROFILE_DIR = path.join(os.homedir(), '.note-playwright-profile');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto('https://note.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // 投稿ボタンをクリックしてモーダルを出す
  const postBtn = page.locator('a[href="/notes/new"], button:has-text("投稿"), a:has-text("投稿")').first();
  if (await postBtn.isVisible({ timeout: 5000 })) {
    await postBtn.click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: '../logs/modal-check.png', fullPage: false });

  // モーダル内のボタンを探す
  const allBtns = page.locator('button, a');
  const count = await allBtns.count();
  for (let i = 0; i < count; i++) {
    const txt = (await allBtns.nth(i).textContent() || '').trim();
    if (txt) console.log(`[${i}] ${txt}`);
  }

  // 「メールを確認」か「送信」系ボタンをクリック
  const target = page.locator('button:has-text("メール"), a:has-text("メール")').first();
  if (await target.isVisible({ timeout: 3000 }).catch(() => false)) {
    const txt = await target.textContent();
    console.log('クリック:', txt.trim());
    await target.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '../logs/after-email-confirm.png', fullPage: false });
    console.log('✅ クリック完了 → logs/after-email-confirm.png を確認してください');
  } else {
    console.log('⚠️ メール関連ボタンが見つかりません');
  }

  await page.waitForTimeout(5000);
  await context.close();
})().catch(e => { console.error(e.message); process.exit(1); });
