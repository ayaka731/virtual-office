#!/usr/bin/env node
/**
 * 既存のnote記事を編集・更新するスクリプト
 * 使い方: node scripts/edit-note-article.js <編集URL> <mdファイルパス>
 * 例: node edit-note-article.js "https://editor.note.com/notes/nXXX/edit/" "../output/drafts/2026-05-03/G1-001-note.md"
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROFILE_DIR = path.join(os.homedir(), '.note-playwright-profile');
const EDIT_URL = process.argv[2];
const MD_FILE  = process.argv[3];

if (!EDIT_URL || !MD_FILE) {
  console.error('使い方: node edit-note-article.js <編集URL> <mdファイル>');
  process.exit(1);
}

const LOGS_DIR = path.join(__dirname, '..', 'logs');
fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── Markdown パーサー（post-to-note.jsと同じ） ──
function parseMarkdown(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  let title = '', bodyLines = [], titleFound = false;
  for (const line of lines) {
    if (line.trim().startsWith('<!--') || line.trim().startsWith('-->')) continue;
    if (!titleFound && line.startsWith('# ')) { title = line.replace(/^#\s+/, '').trim(); titleFound = true; continue; }
    bodyLines.push(line);
  }
  const body = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, body };
}

// ── MarkdownをHTMLに変換 ──
function mdToHtml(md) {
  let html = md.endsWith('\n') ? md : md + '\n';
  html = html.replace(/```[\s\S]*?```/g, '');

  // テーブル
  html = html.replace(/((?:^\|.+\|[^\S\n]*(?:\n|$))+)/gm, (match) => {
    const lines = match.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return match;
    const isSep = (l) => /^\|[\s\-:|]+\|/.test(l.trim());
    const parseRow = (l) => l.split('|').slice(1, -1).map(c => c.trim());
    let tbl = '<table style="border-collapse:collapse;width:100%;margin:1em 0">';
    let inBody = false;
    lines.forEach((line) => {
      if (isSep(line)) { tbl += '<tbody>'; inBody = true; return; }
      const cells = parseRow(line);
      if (!inBody) {
        tbl += '<thead><tr>' + cells.map(c => `<th style="border:1px solid #ccc;padding:6px 10px;background:#f8f8f8;font-weight:bold">${c}</th>`).join('') + '</tr></thead>';
      } else {
        tbl += '<tr>' + cells.map(c => `<td style="border:1px solid #ccc;padding:6px 10px">${c}</td>`).join('') + '</tr>';
      }
    });
    if (inBody) tbl += '</tbody>';
    tbl += '</table>';
    return tbl;
  });

  html = html.replace(/^#{4,6}\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm,   '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g,     '<em>$1</em>');
  html = html.replace(/`(.+?)`/g,       '<code>$1</code>');
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/^>\s+(.+)$/gm,   '<blockquote>$1</blockquote>');
  html = html.replace(/^-{3,}$/gm,      '<hr>');

  html = html.replace(/((?:^[-*+]\s+.+\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map(l => l.replace(/^[-*+]\s+/, '').trim()).filter(Boolean);
    return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
  });

  const blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-6]|table|blockquote|ul|ol|hr|div|p)[\s>]/.test(block)) return block;
    return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
  }).filter(Boolean).join('\n');

  return html;
}

async function ss(page, name) {
  const p = path.join(LOGS_DIR, `edit-${name}.png`);
  try { await page.screenshot({ path: p, fullPage: false }); console.log(`📸 ${p}`); } catch(e) {}
}

(async () => {
  const { title, body } = parseMarkdown(MD_FILE);
  const htmlBody = mdToHtml(body);
  console.log('📄 編集対象:', title);
  console.log('🔗 編集URL:', EDIT_URL);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const page = await context.newPage();

  // 編集ページを開く
  await page.goto(EDIT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await ss(page, '01-opened');

  // エディタが表示されるまで待機
  await page.waitForSelector('.ProseMirror, [contenteditable]', { state: 'visible', timeout: 30000 });
  console.log('✅ エディタ確認');

  // ── タイトル更新 ──
  const titleEl = page.locator('textarea[placeholder="記事タイトル"]').first();
  if (await titleEl.isVisible({ timeout: 5000 })) {
    await titleEl.click();
    await page.fill('textarea[placeholder="記事タイトル"]', title);
    console.log('✅ タイトル更新:', title);
  }

  // ── 本文をすべて選択して削除 ──
  const bodyEl = page.locator('.ProseMirror, [contenteditable]').first();
  await bodyEl.click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Meta+a'); // 全選択
  await page.waitForTimeout(200);
  await page.keyboard.press('Backspace'); // 削除
  await page.waitForTimeout(500);
  console.log('✅ 既存本文を削除');

  // ── HTMLペーストで本文を再入力 (ProseMirror直接dispatch) ──
  console.log('📋 本文をHTMLペースト中...');
  const bodyEl2 = page.locator('.ProseMirror').first();
  await bodyEl2.click();
  await page.waitForTimeout(300);

  const pasteOk2 = await page.evaluate((html) => {
    const el = document.querySelector('.ProseMirror');
    if (!el) return false;
    el.focus();
    try {
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      dt.setData('text/plain', html.replace(/<[^>]+>/g, ''));
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
      el.dispatchEvent(ev);
      return true;
    } catch(e) {
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

  if (!pasteOk2) {
    // fallback: clipboard API + Meta+v
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
  }
  await page.waitForTimeout(2000);
  console.log('✅ 本文ペースト完了');
  await ss(page, '02-content-pasted');

  // ── 下書き保存（公開済みの場合は更新） ──
  await page.waitForTimeout(1000);

  // 「保存」または「更新」ボタンを探す
  const saveBtnSelectors = [
    'button:has-text("下書き保存")',
    'button:has-text("更新")',
    'button:has-text("保存")',
  ];
  let saved = false;
  for (const sel of saveBtnSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click();
        await page.waitForTimeout(2000);
        saved = true;
        console.log('✅ 保存:', sel);
        break;
      }
    } catch(e) {}
  }
  if (!saved) {
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(2000);
    console.log('✅ Cmd+S で保存');
  }

  // ── 公開に進む（publish） ──
  console.log('🚀 公開に進む...');
  const publishBtn = page.locator('button:has-text("公開に進む")').first();
  if (await publishBtn.isVisible({ timeout: 5000 })) {
    await publishBtn.click();
    await page.waitForTimeout(4000);
    await ss(page, '03-publish-dialog');

    const finalPublished = await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button')) {
        const t = btn.textContent.trim();
        if ((t === '公開する' || t === '投稿する' || t === '更新する') && btn.offsetParent !== null) {
          btn.click();
          return t;
        }
      }
      return null;
    });

    if (finalPublished) {
      console.log('✅ 「' + finalPublished + '」クリック');
      await page.waitForTimeout(3000);
    } else {
      console.log('⚠️  公開ボタンが見つかりません（下書き保存のまま）');
    }
  }

  await ss(page, '04-final');
  console.log('\n🔗 最終URL:', page.url());
  console.log('🎉 編集完了！');

  await context.close();
})().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });
