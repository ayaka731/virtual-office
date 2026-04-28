#!/usr/bin/env node
/**
 * noteログインページのHTML構造を調査するデバッグスクリプト
 * 使い方: node scripts/debug-login.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logsDir, { recursive: true });

async function debugLogin() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    console.log('🌐 https://note.com/login にアクセス中...');
    await page.goto('https://note.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // スクリーンショット保存
    const ssPath = path.join(logsDir, 'debug-login.png');
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log(`📸 スクリーンショット保存: ${ssPath}`);

    // HTML保存
    const html = await page.content();
    const htmlPath = path.join(logsDir, 'login-page.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`📄 HTML保存: ${htmlPath} (${html.length} bytes)`);

    // ページタイトル
    console.log('📋 ページタイトル:', await page.title());
    console.log('🔗 現在のURL:', page.url());

    // ボタン・リンクの一覧を出力
    console.log('\n--- ボタン一覧 ---');
    const buttons = await page.$$eval('button', els =>
      els.map(el => ({
        text: el.innerText.trim(),
        type: el.type,
        class: el.className,
        id: el.id,
      }))
    );
    buttons.forEach(b => console.log(JSON.stringify(b)));

    console.log('\n--- リンク一覧 ---');
    const links = await page.$$eval('a', els =>
      els.map(el => ({
        text: el.innerText.trim().substring(0, 60),
        href: el.href,
        class: el.className,
      })).filter(l => l.text)
    );
    links.forEach(l => console.log(JSON.stringify(l)));

    console.log('\n--- input一覧 ---');
    const inputs = await page.$$eval('input', els =>
      els.map(el => ({
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        class: el.className,
      }))
    );
    inputs.forEach(i => console.log(JSON.stringify(i)));

    // "メール"を含む要素を探す
    console.log('\n--- メール関連要素 ---');
    const emailElements = await page.$$eval('*', els =>
      els
        .filter(el => el.innerText && el.innerText.includes('メール') && el.children.length === 0)
        .map(el => ({
          tag: el.tagName,
          text: el.innerText.trim(),
          class: el.className,
          id: el.id,
        }))
        .slice(0, 20)
    );
    emailElements.forEach(e => console.log(JSON.stringify(e)));

    // data属性を持つ要素
    console.log('\n--- data-testid等の属性を持つ要素 ---');
    const dataElements = await page.$$eval('[data-testid], [data-type], [data-name]', els =>
      els.map(el => ({
        tag: el.tagName,
        text: el.innerText.trim().substring(0, 50),
        testid: el.getAttribute('data-testid'),
        type: el.getAttribute('data-type'),
        name: el.getAttribute('data-name'),
        class: el.className,
      }))
    );
    dataElements.forEach(e => console.log(JSON.stringify(e)));

    console.log('\n✅ デバッグ完了');
    console.log(`HTML: ${htmlPath}`);
    console.log(`スクリーンショット: ${ssPath}`);

  } catch (err) {
    console.error('❌ エラー:', err.message);
    // エラー時もスクリーンショット試行
    try {
      await page.screenshot({ path: path.join(logsDir, 'debug-error.png'), fullPage: true });
    } catch(e) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

debugLogin();
