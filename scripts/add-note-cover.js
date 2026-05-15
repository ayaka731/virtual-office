/**
 * 既存note記事にカバー画像を追加するスクリプト
 *
 * 使い方: node add-note-cover.js <noteのID> <カバー画像パス>
 * 例:     node add-note-cover.js n40243742256b ../assets/covers/G1-005-cover.png
 */

'use strict';
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const NOTE_ID      = process.argv[2];
const COVER_IMAGE  = process.argv[3];
const PROFILE_DIR  = path.join(os.homedir(), '.note-playwright-profile');

if (!NOTE_ID || !COVER_IMAGE) {
  console.error('使い方: node add-note-cover.js <noteのID> <カバー画像パス>');
  process.exit(1);
}
const coverPath = path.resolve(COVER_IMAGE);
if (!fs.existsSync(coverPath)) {
  console.error('❌ カバー画像が見つかりません:', coverPath);
  process.exit(1);
}
if (!fs.existsSync(PROFILE_DIR)) {
  console.error('❌ noteプロファイルがありません');
  process.exit(1);
}

const EDIT_URL = `https://editor.note.com/notes/${NOTE_ID}/edit/`;

async function main() {
  console.log(`📝 記事編集: ${EDIT_URL}`);
  console.log(`🖼  カバー画像: ${path.basename(coverPath)}`);

  const logsDir = path.join(__dirname, '..', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    slowMo: 80,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  async function ss(name) {
    const p = path.join(logsDir, `${name}.png`);
    await page.screenshot({ path: p }).catch(() => {});
    console.log(`📸 ${p}`);
  }

  // ボタンをJS経由でクリック（オーバーレイ対策）
  async function jsClick(labelText) {
    return page.evaluate((label) => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === label);
      if (btn) { btn.click(); return true; }
      return false;
    }, labelText);
  }

  try {
    await page.goto(EDIT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await ss('edit-01-opened');

    if (page.url().includes('/login')) {
      throw new Error('セッション切れ。setup-note-profile.js を再実行してください');
    }

    // エディタ（contenteditable）が表示されるまで待つ
    await page.waitForSelector('[contenteditable]', { state: 'visible', timeout: 30000 });
    await ss('edit-02-editor');

    // ── カバー画像が既にあるかチェック ──
    const hasCover = await page.evaluate(() => {
      // カバー画像エリアに img 要素があるかで判定
      const imgs = document.querySelectorAll('img[src*="note.mu"], img[src*="assets.st-hatena"], img[src*="images.unsplash"], img[src*="blob:"], img[src*="note.com"]');
      // エディタ上部のカバー候補（ヒーローエリア）
      const hero = document.querySelector('[class*="HeroImage"], [class*="CoverImage"], [class*="hero"], [class*="cover"]');
      if (hero && hero.querySelector('img')) return true;
      // data-cover 属性
      if (document.querySelector('[data-cover] img')) return true;
      // エディタの最初のimgがカバーエリアにある
      const firstImg = document.querySelector('.ProseMirror img, [data-node-type="image"] img');
      return false; // ProseMirrorのimgはカバーではない
    });

    // より確実な方法：カバーアイコンの代わりに画像が表示されているか
    const coverAreaHasImage = await page.evaluate(() => {
      // エディタ上部のカバーエリア（note固有のクラス）
      const allImgs = Array.from(document.querySelectorAll('img'));
      // src が blob: or data: で始まらず、かつ ProseMirror の外にある img
      const coverImg = allImgs.find(img => {
        const src = img.src || '';
        const inProse = img.closest('.ProseMirror');
        return !inProse && src && !src.startsWith('data:image/svg');
      });
      return !!coverImg;
    });

    console.log(`   カバー画像検出: ${coverAreaHasImage ? 'あり（スキップ）' : 'なし（アップロード）'}`);

    // ── カバー画像アップロード（既存あり・なし両対応） ──
    {
      console.log('🖼  カバー画像をアップロード中...');

      // 既存カバーがある場合：カバー画像上をホバー → ツールバーの変更/削除ボタンを探す
      if (coverAreaHasImage) {
        console.log('   既存カバーを処理中...');

        // カバー画像のbounding rectを取得してホバー
        const coverRect = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          const coverImg = imgs.find(img => !img.closest('.ProseMirror') && img.src && !img.src.startsWith('data:image/svg'));
          if (!coverImg) return null;
          const r = coverImg.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, left: r.left, right: r.right };
        });

        if (coverRect) {
          console.log(`   カバー位置: right=${Math.round(coverRect.right)}, top=${Math.round(coverRect.top)}`);
          // ホバーで×ボタンを出現させてからクリック
          await page.mouse.move(coverRect.x, coverRect.y);
          await page.waitForTimeout(600);
          // ×ボタンはカバー右上 (right-30, top+30)
          const closeX = coverRect.right - 30;
          const closeY = coverRect.top + 30;
          await page.mouse.click(closeX, closeY);
          await page.waitForTimeout(2500);
          console.log(`✅ カバー×クリック (${Math.round(closeX)}, ${Math.round(closeY)})`);
        }
      }

      // input[type="file"] が既にあればそれを使う
      const fileInputs = page.locator('input[type="file"]');
      const inputCount = await fileInputs.count().catch(() => 0);

      if (inputCount > 0) {
        await fileInputs.first().setInputFiles(coverPath);
        await page.waitForTimeout(3000);
        console.log('✅ カバー画像セット完了（直接input）');
      } else {
        // カバーアイコンをクリック（エディタ上部中央 ~520, 124）
        await page.mouse.click(520, 124);
        await page.waitForTimeout(1000);
        await ss('edit-03-cover-menu');

        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, li, [role="menuitem"]'));
            const uploadBtn = btns.find(b => b.textContent.includes('画像をアップロード'));
            if (uploadBtn) { uploadBtn.click(); return 'menu'; }
            const inp = document.querySelector('input[type="file"]');
            if (inp) { inp.click(); return 'input'; }
            return null;
          }),
        ]);
        await fileChooser.setFiles(coverPath);
        await page.waitForTimeout(3000);
        console.log('✅ カバー画像セット完了（メニュー経由）');
      }

      // クロッパーがあれば force:true でクリック
      const cropModalVisible = await page.locator('.CropModal__overlay, .ReactModal__Overlay').isVisible({ timeout: 2000 }).catch(() => false);
      if (cropModalVisible) {
        console.log('   クロッパー検出 → force クリックで保存');
        await page.locator('button:has-text("保存")').last().click({ force: true, timeout: 5000 }).catch(async () => {
          // 座標クリックにフォールバック
          const rect = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '保存');
            if (!btn) return null;
            const r = btn.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          });
          if (rect) await page.mouse.click(rect.x, rect.y);
        });
        console.log('✅ クロッパー保存');
        await page.waitForTimeout(3000);
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    await ss('edit-04-cover-ready');

    // ── タイトルが確実に入力済みか確認（Reactの水和を待つ） ──
    console.log('⏳ エディタの内容読み込みを確認中...');
    await page.waitForFunction(() => {
      const title = document.querySelector('textarea[placeholder="記事タイトル"]');
      return title && title.value && title.value.trim().length > 0;
    }, {}, { timeout: 15000 }).catch(async () => {
      // タイトルが空なら既存データを確認
      const titleVal = await page.evaluate(() => {
        const t = document.querySelector('textarea[placeholder="記事タイトル"]');
        return t ? t.value : 'not found';
      });
      console.log(`  タイトル値: "${titleVal}"`);
    });

    // ── 一時保存 ──
    console.log('💾 一時保存中...');
    const tmpSaved = await jsClick('一時保存');
    if (tmpSaved) {
      console.log('✅ 「一時保存」クリック');
    } else {
      await page.keyboard.press('Meta+s');
      console.log('✅ Cmd+S');
    }
    await page.waitForTimeout(3000);
    await ss('edit-05-after-save');

    // ── 「タイトル、本文を入力してください」ダイアログが出たら閉じる ──
    const validationDialog = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const closeBtn = btns.find(b => b.textContent.trim() === '閉じる');
      if (closeBtn && closeBtn.offsetParent !== null) { closeBtn.click(); return true; }
      return false;
    });
    if (validationDialog) {
      console.log('⚠️  バリデーションダイアログを閉じました');
      await page.waitForTimeout(1000);
    }

    // ── 公開に進む ──
    console.log('🚀 公開処理...');
    await jsClick('公開に進む');
    await page.waitForTimeout(3000);
    await ss('edit-06-publish-dialog');

    // 公開設定パネル内のボタンを探す
    const publishResult = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const visible = buttons.filter(b => b.offsetParent !== null);
      const labels = visible.map(b => b.textContent.trim()).filter(t => t);

      for (const kw of ['保存する', '公開する', '投稿する', '更新する']) {
        const btn = visible.find(b => b.textContent.trim() === kw);
        if (btn) { btn.click(); return `clicked:${kw}`; }
      }
      return `not_found:${JSON.stringify(labels)}`;
    });

    console.log(`📋 公開結果: ${publishResult}`);
    await page.waitForTimeout(3000);
    await ss('edit-07-done');

    console.log('\n🎉 完了！');
    console.log(`🔗 記事: https://note.com/yorushoku_500/n/${NOTE_ID}`);

  } catch (err) {
    await ss('edit-error').catch(() => {});
    console.error('❌ エラー:', err.message);
    process.exit(1);
  } finally {
    await context.close();
  }
}

main();
