#!/usr/bin/env node
/**
 * note.com プロフィールページを自動設定するスクリプト
 * - プロフィールアイコン画像をアップロード
 * - ヘッダー画像をアップロード
 * - ニックネームを設定
 * - 自己紹介文を設定（140文字以内）
 * - SNSリンクを設定
 *
 * 使い方: node scripts/setup-note-profile-page.js
 */

const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PROFILE_DIR = path.join(os.homedir(), '.note-playwright-profile');
const ASSETS_DIR  = path.join(__dirname, '..', 'assets');
const PROFILE_IMG = path.join(ASSETS_DIR, 'profile', 'profile-chibi.png');
const HEADER_IMG  = path.join(ASSETS_DIR, 'profile', 'header-chibi.png');
const LOGS_DIR    = path.join(__dirname, '..', 'logs');

// 140文字以内の自己紹介
const PROFILE_CONFIG = {
  nickname: '瑠璃',  // 既存のまま（変更しない）
  bio: '💜月収100万の夜。顔出しゼロ・スマホ1台から始めた私の全記録。チャットレディのリアルを知りたいなら、ここが最後の答え。稼ぎ方・やばい客・本当のリスク全部書く。※AFあり',
  instagram: 'https://www.instagram.com/ruri_yorushoku/',
};

fs.mkdirSync(LOGS_DIR, { recursive: true });

async function ss(page, name) {
  const p = path.join(LOGS_DIR, `ps-${name}.png`);
  try { await page.screenshot({ path: p, fullPage: false }); console.log(`📸 ${p}`); } catch(e) {}
}

(async () => {
  console.log('🌐 ブラウザ起動...');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  // ログイン確認
  await page.goto('https://note.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  if (page.url().includes('/login')) {
    console.error('❌ セッション切れ。node scripts/setup-note-profile.js を再実行してください');
    await context.close(); process.exit(1);
  }

  // プロフィール設定ページへ
  await page.goto('https://note.com/settings/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await ss(page, '01-loaded');

  // ── ヘッダー画像アップロード ──
  if (fs.existsSync(HEADER_IMG)) {
    console.log('🖼  ヘッダー画像をアップロード中...');
    try {
      const headerInput = page.locator('input#headerImage');
      await headerInput.setInputFiles(HEADER_IMG);
      await page.waitForTimeout(4000);
      await ss(page, '02-header-uploaded');

      // クロッパーの確認ボタン（force:true でオーバーレイ無視）
      for (const label of ['この画像を使う', '保存', '完了', '適用']) {
        const clicked = await page.evaluate((txt) => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.trim().includes(txt) && b.offsetParent !== null);
          if (btn) { btn.click(); return true; }
          return false;
        }, label);
        if (clicked) {
          console.log(`✅ クロッパー「${label}」クリック`);
          await page.waitForTimeout(3000);
          break;
        }
      }
      // さらに選択モーダルの「設定」ボタンがあれば force クリック
      const setBtn = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '設定');
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (setBtn) { await page.waitForTimeout(2000); }

      console.log('✅ ヘッダー画像アップロード完了');
    } catch(e) {
      console.log('⚠️  ヘッダー画像アップロード失敗:', e.message);
    }
    await ss(page, '03-after-header');
  }

  // ── プロフィールアイコンアップロード ──
  if (fs.existsSync(PROFILE_IMG)) {
    console.log('👤 プロフィールアイコンをアップロード中...');
    try {
      // アイコンエリアをクリックしてファイルダイアログを開く
      const iconArea = page.locator('[class*="userIcon"], [class*="ProfileIcon"], [class*="avatar"]').first();
      if (await iconArea.isVisible({ timeout: 3000 })) {
        await iconArea.click();
        await page.waitForTimeout(1000);
      }

      // 表示されたファイルインプットに直接セット（hidden以外）
      const allInputs = page.locator('input[type="file"]');
      const cnt = await allInputs.count();
      console.log(`  ファイルインプット数: ${cnt}`);
      for (let i = 0; i < cnt; i++) {
        const inp = allInputs.nth(i);
        const id = await inp.getAttribute('id');
        const accept = await inp.getAttribute('accept') || '';
        if (id !== 'headerImage' && accept.includes('image')) {
          await inp.setInputFiles(PROFILE_IMG);
          await page.waitForTimeout(3000);
          // クロッパー保存
          for (const sel of ['button:has-text("この画像を使う")', 'button:has-text("保存")', 'button:has-text("完了")', 'button:has-text("適用")']) {
            try {
              const btn = page.locator(sel).first();
              if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); await page.waitForTimeout(2000); break; }
            } catch(e) {}
          }
          console.log('✅ プロフィールアイコンアップロード完了');
          break;
        }
      }
    } catch(e) {
      console.log('⚠️  アイコンアップロード失敗:', e.message);
    }
    await ss(page, '04-after-icon');
  }

  // ── 自己紹介文設定 ──
  console.log('📝 自己紹介文を設定中...');
  const bioText = PROFILE_CONFIG.bio;
  console.log(`  文字数: ${bioText.length}/140`);
  try {
    const bioEl = page.locator('textarea[name="editBiography"]');
    await bioEl.waitFor({ state: 'visible', timeout: 5000 });
    await bioEl.click();
    await page.keyboard.press('Control+a');
    await bioEl.fill(bioText);
    console.log('✅ 自己紹介文設定完了');
  } catch(e) {
    console.log('⚠️  自己紹介文設定失敗:', e.message);
  }

  // ── Instagram リンク設定 ──
  console.log('🔗 Instagramリンクを設定中...');
  try {
    const igEl = page.locator('input[name="instagramLink"]');
    if (await igEl.isVisible({ timeout: 3000 })) {
      await igEl.fill(PROFILE_CONFIG.instagram);
      console.log('✅ Instagramリンク設定完了');
    }
  } catch(e) {}

  await ss(page, '05-before-save');

  // ── 保存 ──
  console.log('💾 保存中...');
  try {
    const saveBtn = page.locator('button:has-text("保存")').last();
    await saveBtn.waitFor({ state: 'visible', timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(3000);
    console.log('✅ 保存完了');
  } catch(e) {
    console.log('⚠️  保存ボタンが見つかりません:', e.message);
  }

  await ss(page, '06-after-save');
  console.log('\n🎉 プロフィール設定完了！');
  console.log('   https://note.com/yorushoku_500 で確認してください');

  await context.close();
})().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });
