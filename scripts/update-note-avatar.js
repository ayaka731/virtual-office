'use strict';
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PROFILE_DIR = path.join(os.homedir(), '.note-playwright-profile');
const PROFILE_IMG = path.join(__dirname, '..', 'assets', 'profile', 'profile-chibi.png');
const LOGS_DIR    = path.join(__dirname, '..', 'logs');
fs.mkdirSync(LOGS_DIR, { recursive: true });

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false, slowMo: 80,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const ss = async (n) => { await page.screenshot({ path: `${LOGS_DIR}/icon-${n}.png` }).catch(() => {}); };

  await page.goto('https://note.com/settings/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await ss('01-loaded');

  // DOMのfile inputを全確認
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input[type="file"]'))
      .map(i => ({ id: i.id, name: i.name, accept: i.accept }))
  );
  console.log('file inputs:', JSON.stringify(inputs));

  // アバターボタンをクリック → DOM に新しい input[type="file"] が現れる
  console.log('👤 アバターボタンをクリック中...');
  // ボタンを JS 経由でクリック（座標 220,370 付近）
  await page.evaluate(() => {
    const btn = document.querySelector('button#\\:rh\\:')
      || Array.from(document.querySelectorAll('button')).find(b => {
        const svg = b.querySelector('svg[aria-label*="プロフィール画像"]');
        return !!svg;
      });
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);

  // クリック後に現れる input[type="file"]（headerImage 以外）を待つ
  const avatarInput = page.locator('input[type="file"]:not(#headerImage)').first();
  await avatarInput.waitFor({ state: 'attached', timeout: 5000 });
  console.log('✅ アバター用 input 取得');
  await avatarInput.setInputFiles(PROFILE_IMG);
  await page.waitForTimeout(3000);
  await ss('02-after-upload');

  await page.waitForTimeout(2000);
  await ss('03-modal');

  // ── ステップ1: クロッパー「この画像を使う」（もしあれば） ──
  const cropConfirm = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === 'この画像を使う' && b.offsetParent !== null);
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (cropConfirm) {
    console.log('✅ クロッパー「この画像を使う」クリック');
    await page.waitForTimeout(2000);
    await ss('03b-after-crop');
  }

  // ── ステップ2: 写真選択モーダルの「設定」ボタン（force: true でオーバーレイ無視） ──
  const setBtn = page.locator('button:has-text("設定")').last();
  if (await setBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await setBtn.click({ force: true });
    console.log('✅ モーダル「設定」クリック（force）');
    await page.waitForTimeout(2000);
  }
  await ss('04-after-modal');

  // プロフィール設定全体の保存ボタン
  const formSaved = await page.evaluate(() => {
    // フォームの一番下にある「保存」ボタン（キャンセルの隣）
    const buttons = Array.from(document.querySelectorAll('button'));
    const visible = buttons.filter(b => b.textContent.trim() === '保存' && b.offsetParent !== null);
    // 最後の「保存」ボタンが通常フォーム用
    if (visible.length > 0) { visible[visible.length - 1].click(); return true; }
    return false;
  });
  console.log(formSaved ? '✅ プロフィール保存クリック' : '⚠️ 保存ボタンが見つかりません');
  await page.waitForTimeout(3000);
  await ss('04-saved');

  console.log('\n🎉 アイコン更新完了！');
  console.log('   https://note.com/yorushoku_500 で確認してください');
  await ctx.close();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
