/**
 * X（Twitter）ログインプロファイル作成スクリプト
 *
 * 1. 通常のChromeを開く（XはPlaywrightを検出するので普通のChromeで）
 * 2. ユーザーがX.comにログイン
 * 3. ChromeのCookieをPlaywrightプロファイルに移植
 *
 * 使い方: node scripts/setup-x-profile.js
 */

'use strict';
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

const PROFILE_DIR  = path.join(os.homedir(), '.x-playwright-profile');
const CHROME_PATH  = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_DATA  = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');

// ── browser_cookie3 でChromeのX Cookieを取得 ────────────────────
function decryptChromeCookies() {
  const pyPath = '/tmp/x_cookie_extract.py';
  fs.writeFileSync(pyPath, `
import json, sys
try:
    import browser_cookie3
except ImportError:
    import subprocess
    subprocess.run(['pip3','install','browser-cookie3','--quiet'], timeout=60)
    import browser_cookie3

results = []
try:
    for c in browser_cookie3.chrome(domain_name='.x.com'):
        if c.name in ('auth_token','ct0','twid','kdt','guest_id') and c.value:
            results.append({'domain':'.x.com','name':c.name,'path':c.path or '/','value':c.value,'secure':bool(c.secure),'httpOnly':False,'expires':int(c.expires) if c.expires else -1,'sameSite':'None'})
    for c in browser_cookie3.chrome(domain_name='.twitter.com'):
        if c.name in ('auth_token','ct0') and c.value:
            results.append({'domain':'.twitter.com','name':c.name,'path':c.path or '/','value':c.value,'secure':bool(c.secure),'httpOnly':False,'expires':int(c.expires) if c.expires else -1,'sameSite':'None'})
except Exception as e:
    print(json.dumps({'error': str(e)}))
    sys.exit(1)
print(json.dumps(results))
`);
  try {
    const out = execSync(`python3 "${pyPath}"`, { timeout: 30000 }).toString().trim();
    fs.unlinkSync(pyPath);
    const parsed = JSON.parse(out);
    if (parsed.error) { console.log('  Cookie取得エラー:', parsed.error); return null; }
    return parsed.length > 0 ? parsed : null;
  } catch(e) {
    try { fs.unlinkSync(pyPath); } catch(_) {}
    console.log('  Cookie取得失敗:', e.message.slice(0, 80));
    return null;
  }
}

// ── CookieをPlaywrightプロファイルに注入して保存 ──────────────────
async function injectAndSave(cookies) {
  console.log(`\n🍪 ${cookies.length}件のCookieをPlaywrightプロファイルに注入中...`);
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROME_PATH,
    headless: true,   // ここはheadlessでOK（cookie注入のみ）
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.context().addCookies(cookies);

  // Cookie保存のためのダミーアクション
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  const url = page.url();
  await browser.close();

  if (url.includes('/home')) {
    console.log('✅ ログイン成功！プロファイル保存完了。');
    return true;
  } else {
    console.log(`⚠️  ログイン確認できず（URL: ${url}）`);
    return false;
  }
}

async function main() {
  console.log('🐦 X ログインプロファイル作成\n');

  // ── ステップ1: 通常のChromeでXを開く ──
  console.log('【ステップ1】通常のChromeでXを開きます...');
  spawnSync('open', ['-a', 'Google Chrome', 'https://x.com/login'], { timeout: 5000 });
  console.log('  Chromeが開きました。\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('【ステップ2】Chromeの画面でXにログインしてください');
  console.log('   ・ユーザー名・パスワードを入力してログイン');
  console.log('   ・ホーム画面（タイムライン）が出たらOK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Chromeのcookieにauth_tokenが現れるまで自動で待つ ──
  console.log('⏳ Xへのログインを検出中... (ログインすると自動で次に進みます)');
  const cookieDb = path.join(CHROME_DATA, 'Default', 'Cookies');
  let waited = 0;
  while (waited < 300) {  // 最大5分
    if (fs.existsSync(cookieDb)) {
      const c = decryptChromeCookies();
      if (c && c.find(x => x.name === 'auth_token' && x.value)) {
        console.log('\n✅ ログイン検出！');
        break;
      }
    }
    await new Promise(r => setTimeout(r, 3000));
    waited += 3;
    process.stdout.write('.');
  }
  if (waited >= 300) {
    console.log('\n⚠️  タイムアウト。再度実行してください。');
    process.exit(1);
  }

  // ── ステップ2: CookieをChromeから取り出す ──
  console.log('\n【ステップ3】ChromeのCookieを取得中...');
  console.log('  (Chromeが起動中の場合は一時的にコピーします)');

  const cookies = decryptChromeCookies();

  if (!cookies) {
    console.log('\n❌ ChromeのCookieが取得できませんでした。');
    console.log('   考えられる原因:');
    console.log('   ・Chromeのプロファイルがまだ作成されていない（Chromeを一度起動してください）');
    console.log('   ・X.comへのログインが完了していない');
    console.log('   Chromeで x.com にログインしてから再度実行してください。');
    return;
  }

  const authToken = cookies.find(c => c.name === 'auth_token');
  if (!authToken) {
    console.log('❌ auth_token が見つかりません。Xにログインできているか確認してください。');
    return;
  }

  console.log(`  auth_token: ${authToken.value.slice(0, 10)}... ✓`);
  const ok = await injectAndSave(cookies);
  if (ok) {
    console.log('\n🎉 完了！');
    console.log('   以降は node post-to-x.js <ファイル> で自動投稿できます。');
    console.log('   Telegramから /postx コマンドでも投稿できます。');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
