/**
 * 全note記事からアフィリエイトPR文言（※で始まる行）を削除し、
 * #PRハッシュタグを追加するスクリプト
 *
 * 使い方: node scripts/remove-pr-from-notes.js
 */

'use strict';
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PROFILE_DIR = path.join(os.homedir(), '.note-playwright-profile');

if (!fs.existsSync(PROFILE_DIR)) {
  console.error('❌ noteプロファイルがありません。先に setup-note-profile.js を実行してください');
  process.exit(1);
}

// 処理対象のnote記事ID一覧
const NOTE_IDS = [
  // G1記事
  'n01ee3a4ceccc',
  'n82cd19a6e6e7',
  'n71626e534fe2',
  'n450c1b5c900d',
  'n20946565969b',
  'nc6940adab983',
  'n9df64ef5f51f',
  'na682355ac59f',
  'nacd4891ed129',
  'nfb498933d7f1',
  'n048ba3ed95e5',
  'nc62e73a131cf',
  'n11b0ab1e2143',
  'n07b8ce29166c',
  'na0964ac63eb1', // G1-020
  'n6ad487c84355', // G1-022
  // G2記事
  'nf0392b6997f3',
  'nb9a73963504d',
  'n82daf55166f4',
  'n92233b51b6d6',
  'n8afde1f074f3',
  'nb8e5185552c2',
  'n4f57688720c1',
];

const logsDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logsDir, { recursive: true });

const results = [];

async function dismissAIModal(page) {
  for (let i = 0; i < 4; i++) {
    const dismissed = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cancel = btns.find(b => b.textContent.trim() === 'キャンセル' && b.offsetParent !== null);
      if (cancel) { cancel.click(); return 'cancel'; }
      const agree = btns.find(b => b.textContent.includes('同意') && b.offsetParent !== null);
      if (agree) { agree.click(); return 'agree'; }
      return null;
    });
    if (dismissed) {
      await page.waitForTimeout(800);
      return;
    }
    await page.waitForTimeout(400);
  }
}

// ProseMirrorエディタで ※ 行をすべて削除（キーボード操作）
async function removeAsterisqueLines(page) {
  const prose = page.locator('.ProseMirror').first();
  await prose.click();
  await page.waitForTimeout(300);

  // 末尾に移動してから ※ 行を上から探す方式だと複雑なので
  // Ctrl+End で末尾へ → ※ 段落を後ろから削除
  // ただし note エディタは Ctrl+Home/End が効かない場合もあるので
  // まず先頭へ移動
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(300);

  let removedCount = 0;

  // 最大200行試行（記事が長くても対応できるよう余裕を持たせる）
  for (let attempt = 0; attempt < 200; attempt++) {
    // 現在カーソル位置の段落テキストを取得
    const lineText = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return '__END__';

      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

      // 段落要素（ProseMirrorの直下のブロック）まで遡る
      const prose = document.querySelector('.ProseMirror');
      if (!prose) return '__END__';

      while (node && node.parentElement !== prose) {
        node = node.parentElement;
        if (!node) break;
      }
      return node ? node.textContent.trim() : '__END__';
    });

    if (lineText === '__END__' || lineText === null) break;

    if (lineText.startsWith('※') || lineText.startsWith('＊') || lineText.startsWith('*本記事')) {
      // 行頭に移動
      await page.keyboard.press('Home');
      await page.waitForTimeout(80);
      // 行末まで選択（次の行の行頭まで含めて選択 → 改行ごと削除）
      await page.keyboard.press('Shift+End');
      await page.waitForTimeout(50);
      // 改行も含めて削除するため Shift+Delete の後に BackSpace
      await page.keyboard.press('Delete'); // 選択範囲削除
      await page.waitForTimeout(100);
      // 空行が残った場合は BackSpace で削除
      const afterText = await page.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return '';
        let node = sel.getRangeAt(0).startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        const prose = document.querySelector('.ProseMirror');
        while (node && node.parentElement !== prose) node = node.parentElement;
        return node ? node.textContent.trim() : '';
      });
      if (afterText === '') {
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);
      }

      removedCount++;
      console.log(`   削除: "${lineText.slice(0, 60)}"`);
      // 削除後は同じ位置に次の行が来るので continue（ArrowDownしない）
      continue;
    }

    // ※行でなければ次の行へ
    // 現在の行数を記録して ArrowDown 後に変化を確認
    const beforePos = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      return { offset: range.startOffset, nodeText: range.startContainer.textContent?.slice(0, 20) };
    });

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);

    const afterPos = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      return { offset: range.startOffset, nodeText: range.startContainer.textContent?.slice(0, 20) };
    });

    // カーソルが動かなくなったら末尾に到達
    if (beforePos && afterPos &&
        beforePos.offset === afterPos.offset &&
        beforePos.nodeText === afterPos.nodeText) {
      console.log(`   末尾に到達（${attempt + 1}行スキャン済み）`);
      break;
    }
  }

  return removedCount;
}

// 公開設定パネルでハッシュタグ欄に #PR を追加
async function addPRHashtag(page) {
  // ハッシュタグ入力欄を複数の方法で探す
  const selectors = [
    'input[placeholder*="ハッシュタグ"]',
    'input[placeholder*="タグを追加"]',
    'input[placeholder*="タグ"]',
    '[class*="hashtag" i] input',
    '[class*="Hashtag"] input',
    '[class*="tag" i] input:not([type="hidden"])',
  ];

  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() === 0) continue;

      const currentValue = await el.inputValue().catch(() => '');
      if (currentValue.toUpperCase().includes('PR')) {
        console.log('   #PR は既に設定済み');
        return true;
      }

      await el.click();
      await page.waitForTimeout(300);
      await el.type('PR', { delay: 50 });
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);

      // タグが追加されたか確認（タグバッジが出現するか入力欄がクリアされるか）
      const afterValue = await el.inputValue().catch(() => '');
      console.log(`   ハッシュタグ入力後: "${afterValue}" (selector: ${sel})`);
      return true;
    } catch (e) {
      // 次のセレクタを試す
    }
  }

  // 最終手段: ページ内の全inputを列挙してログ
  const allInputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map(i => ({
      placeholder: i.placeholder,
      className: i.className.slice(0, 50),
      value: i.value.slice(0, 30),
      type: i.type,
    }))
  );
  console.log('   利用可能なinput:', JSON.stringify(allInputs));
  return false;
}

async function processArticle(page, noteId, index, total) {
  const editUrl = `https://editor.note.com/notes/${noteId}/edit/`;
  console.log(`\n[${ index + 1}/${total}] 処理中: ${noteId}`);

  async function ss(name) {
    const p = path.join(logsDir, `remove-pr-${noteId}-${name}.png`);
    await page.screenshot({ path: p }).catch(() => {});
  }

  try {
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    if (page.url().includes('/login')) {
      throw new Error('セッション切れ');
    }

    await page.waitForSelector('[contenteditable]', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1500);
    await dismissAIModal(page);
    await ss('01-opened');

    // ── ※行を削除 ──
    console.log('   ※PR文言を削除中...');
    const removed = await removeAsterisqueLines(page);
    console.log(`   ※行削除数: ${removed}件`);
    await ss('02-after-remove');

    // AIモーダルが再出現した場合に備えて再度閉じる
    await dismissAIModal(page);

    // ── 一時保存 ──
    console.log('   一時保存中...');
    const tmpSaved = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '一時保存' && b.offsetParent !== null);
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!tmpSaved) await page.keyboard.press('Meta+s');
    await page.waitForTimeout(2500);

    // バリデーションダイアログが出た場合は閉じる
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '閉じる' && b.offsetParent !== null);
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    // ── 公開設定パネルを開く ──
    console.log('   公開設定パネルを開く...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '公開に進む' && b.offsetParent !== null);
      if (btn) btn.click();
    });
    await page.waitForTimeout(3500);
    await ss('03-publish-panel');

    // ── #PR ハッシュタグを追加 ──
    console.log('   #PRハッシュタグを追加中...');
    const hashtagAdded = await addPRHashtag(page);
    await ss('04-hashtag');

    // ── 更新する ──
    console.log('   記事を更新中...');
    const updateResult = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('button'))
        .filter(b => b.offsetParent !== null);
      for (const kw of ['更新する', '保存する', '公開する', '投稿する']) {
        const btn = visible.find(b => b.textContent.trim() === kw);
        if (btn) { btn.click(); return `clicked:${kw}`; }
      }
      return `not_found:${JSON.stringify(visible.map(b => b.textContent.trim()).filter(t => t).slice(0, 10))}`;
    });

    console.log(`   更新結果: ${updateResult}`);
    await page.waitForTimeout(3000);
    await ss('05-done');

    const ok = updateResult.startsWith('clicked:');
    results.push({ noteId, status: ok ? 'OK' : 'WARNING', removed, hashtagAdded, detail: updateResult });
    console.log(`   ✅ 完了`);

  } catch (err) {
    await ss('error').catch(() => {});
    console.error(`   ❌ エラー: ${err.message}`);
    results.push({ noteId, status: 'ERROR', removed: 0, hashtagAdded: false, detail: err.message });
  }
}

async function main() {
  console.log('🚀 PR文言削除・#PR追加スクリプト開始');
  console.log(`📝 対象: ${NOTE_IDS.length}記事\n`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    slowMo: 60,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
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
    console.error('❌ ログインが必要です');
    await context.close();
    process.exit(1);
  }
  console.log('✅ ログイン確認OK\n');

  for (let i = 0; i < NOTE_IDS.length; i++) {
    await processArticle(page, NOTE_IDS[i], i, NOTE_IDS.length);

    if (i < NOTE_IDS.length - 1) {
      console.log('   ⏳ 次の記事まで5秒待機...');
      await page.waitForTimeout(5000);
    }
  }

  await context.close();

  // サマリー
  console.log('\n' + '='.repeat(60));
  console.log('📊 処理結果サマリー');
  console.log('='.repeat(60));
  const ok  = results.filter(r => r.status === 'OK').length;
  const wrn = results.filter(r => r.status === 'WARNING').length;
  const err = results.filter(r => r.status === 'ERROR').length;
  console.log(`✅ 成功: ${ok}件 | ⚠️ 警告: ${wrn}件 | ❌ エラー: ${err}件`);

  if (wrn > 0 || err > 0) {
    console.log('\n要確認:');
    results.filter(r => r.status !== 'OK').forEach(r =>
      console.log(`  ${r.noteId}: [${r.status}] ${r.detail}`)
    );
  }

  const resultPath = path.join(logsDir, 'remove-pr-results.json');
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 詳細ログ: ${resultPath}`);
  console.log('\n🎉 全処理完了！');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
