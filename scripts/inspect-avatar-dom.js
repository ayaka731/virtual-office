'use strict';
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PROFILE_DIR = path.join(os.homedir(), '.note-playwright-profile');
const LOGS_DIR = path.join(__dirname, '..', 'logs');

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false, slowMo: 50,
    args: ['--no-sandbox'],
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  await page.goto('https://note.com/settings/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // アバター円の周辺HTML構造を確認
  const domInfo = await page.evaluate(() => {
    // 座標 (220, 370) 付近の要素
    const el = document.elementFromPoint(220, 370);
    if (!el) return 'nothing at 220,370';

    const getInfo = (e) => ({
      tag: e.tagName,
      id: e.id,
      classes: e.className,
      type: e.type,
      outerHTML: e.outerHTML.slice(0, 300),
    });

    // 要素とその親を取得
    const chain = [];
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
      chain.push(getInfo(cur));
      cur = cur.parentElement;
    }
    return chain;
  });

  console.log(JSON.stringify(domInfo, null, 2));

  // クリックしてみる
  console.log('\n→ 座標クリック実行...');
  await page.mouse.click(220, 370);
  await page.waitForTimeout(2000);

  // クリック後のDOM変化（新しいinputが現れたか）
  const afterInputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input[type="file"]')).map(i => ({
      id: i.id, name: i.name, accept: i.accept, hidden: i.type === 'hidden'
    }))
  );
  console.log('クリック後 file inputs:', JSON.stringify(afterInputs));

  await page.screenshot({ path: `${LOGS_DIR}/avatar-inspect.png` });
  await ctx.close();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
