/**
 * X（Twitter）自動投稿スクリプト（Playwright版）
 * 使い方: node post-to-x.js <x-markdownファイルパス>
 *
 * 初回: node setup-x-profile.js でログイン状態を保存
 * 2回目以降: 保存済みプロファイルで自動ログイン
 */

'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MD_FILE     = process.argv[2];
const NOTE_URL    = process.argv[3] || null;   // 例: https://note.com/yorushoku_500/n/xxx
const PROFILE_DIR = path.join(os.homedir(), '.x-playwright-profile');
const HAS_PROFILE = fs.existsSync(PROFILE_DIR) && !process.env.CI;

if (!HAS_PROFILE) {
  console.error('❌ X ログインプロファイルがありません。先に以下を実行してください:');
  console.error('   node scripts/setup-x-profile.js');
  process.exit(1);
}
if (!MD_FILE) {
  console.error('使い方: node post-to-x.js <x記事のMarkdownパス>');
  process.exit(1);
}
if (!fs.existsSync(MD_FILE)) {
  console.error('❌ ファイルが見つかりません:', MD_FILE);
  process.exit(1);
}

// ── Markdown からツイート配列を抽出（--- 区切り or ```ブロック 両対応） ──
function extractTweets(mdPath, noteUrl = null) {
  const content = fs.readFileSync(mdPath, 'utf8');
  if (content.includes('<!-- POSTED -->')) {
    // 投稿日時を確認して警告
    const dateMatch = content.match(/投稿日時:\s*(.+)/);
    const postedDate = dateMatch ? dateMatch[1].trim() : '（日時不明）';
    console.log(`ℹ️  このファイルは既に投稿済みです（${postedDate}）`);
    console.log('   重複投稿は凍結リスクがあるためスキップします');
    process.exit(0);
  }

  let tweets = [];

  // ── パターン1: --- 区切り（X markdown標準形式） ──
  // スレッド系セクションを探す（複数のセクション名に対応）
  const sectionPattern = /##\s*(?:スレッド投稿（メイン）|スレッド全文|スレッド|メインスレッド)([\s\S]*?)(?=^##\s|\Z)/m;
  const mainMatch = content.match(sectionPattern);
  const mainSection = mainMatch ? mainMatch[1] : content;

  if (mainSection) {
    tweets = mainSection
      .split(/^---+$/m)
      .map(b => {
        return b
          // **【本目ラベル】** 行を除去
          .replace(/^\s*\*\*【[^】]*】\*\*\s*\n?/m, '')
          // ### ツイートN（ラベル） 行を除去
          .replace(/^\s*###\s*ツイート\d+[^\n]*\n?/m, '')
          .trim();
      })
      .filter(b => b.length > 0 && !b.startsWith('#'));
  }

  // ── パターン2: ```ブロック（フォールバック） ──
  if (tweets.length === 0) {
    const re = /```\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const text = m[1].trim();
      if (text.length > 0) tweets.push(text);
    }
  }

  // 280字制限（URLは本文に入れないので通常の280字）
  tweets = tweets.map(t => t.length > 280 ? t.slice(0, 277) + '…' : t);

  return { tweets, content };
}

// ── GraphQL レスポンスから tweet ID を傍受 ──
function interceptTweetId(page) {
  let resolveId;
  const promise = new Promise(r => { resolveId = r; });
  const handler = async (response) => {
    const url = response.url();
    if (!url.includes('CreateTweet')) return;
    try {
      const json = await response.json().catch(() => null);
      const id = json?.data?.create_tweet?.tweet_results?.result?.rest_id
              || json?.data?.create_tweet?.tweet_results?.result?.legacy?.id_str;
      if (id) {
        page.off('response', handler);
        resolveId(id);
      }
    } catch(_) {}
  };
  page.on('response', handler);
  // 10秒でタイムアウト
  const timeout = setTimeout(() => { page.off('response', handler); resolveId(null); }, 10000);
  return { promise, cleanup: () => clearTimeout(timeout) };
}

// ── ツイートテキストを入力して投稿ボタンを押す ──
async function composeTweet(page, text, replyToUrl = null) {
  // スレッド返信の場合は元ツイートページへ
  if (replyToUrl) {
    await page.goto(replyToUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 返信ボタンをJS経由でクリック
    const replyClicked = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="reply"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!replyClicked) throw new Error('返信ボタンが見つかりません');
    await page.waitForTimeout(2000);
  } else {
    // 新規ツイート：ホームの投稿ボタン
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 投稿ボタンをJS経由でクリック
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);
  }

  // テキストエリアを待機（返信モーダル内も対応）
  const textbox = page.locator('[data-testid="tweetTextarea_0"]').first();
  await textbox.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(800);

  // クリックしてフォーカス
  await textbox.click();
  await page.waitForTimeout(400);

  // 既存テキスト（@mention等）をクリアしてから入力
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);

  // keyboard.type() で確実に全文入力
  await page.keyboard.type(text, { delay: 0 });
  await page.waitForTimeout(800);

  // 確認
  const charCount = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tweetTextarea_0"]');
    return el ? el.innerText.trim().length : 0;
  });
  console.log(`  入力確認: ${charCount} 文字`);

  // 文字数が大幅に不足している場合は再試行
  if (charCount < text.length * 0.5) {
    console.log('  ⚠️ 入力が足りないため再試行...');
    await textbox.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    await page.evaluate((t) => {
      const el = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (el) { el.focus(); document.execCommand('insertText', false, t); }
    }, text);
    await page.waitForTimeout(600);
  }

  // GraphQL レスポンス傍受を開始（投稿ボタンを押す前にセット）
  const { promise: tweetIdPromise, cleanup } = interceptTweetId(page);

  // 投稿ボタンを待つ
  await page.locator('[data-testid="tweetButton"]').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);

  // JavaScript で直接クリック（オーバーレイを無視）
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="tweetButton"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('tweetButton が見つかりませんでした');

  // tweet ID を待つ（最大10秒）
  const tweetId = await tweetIdPromise;
  cleanup();
  await page.waitForTimeout(1500);

  let tweetUrl = null;
  if (tweetId) {
    const xConfig = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'config', 'platforms.json'), 'utf8'
    )).x;
    tweetUrl = `https://x.com/${xConfig.id}/status/${tweetId}`;
    console.log(`  ツイートURL: ${tweetUrl}`);
  } else {
    console.log('  ⚠️ tweet ID 取得失敗（スレッド返信は継続）');
  }

  return tweetUrl;
}

// ── スレッドの最後のツイートへリプライとしてnoteURLをぶら下げる ──
// URLをスレッドに繋げることでインプレッションを下げずにリンク誘導できる
async function replyWithUrl(page, lastTweetUrl, noteUrl) {
  await composeTweet(page, noteUrl, lastTweetUrl);
}

async function main() {
  const { tweets, content } = extractTweets(MD_FILE, NOTE_URL);
  if (tweets.length === 0) {
    console.error('❌ 投稿するツイートが見つかりませんでした（```ブロックが必要）');
    process.exit(1);
  }

  console.log(`📄 ファイル: ${MD_FILE}`);
  console.log(`📝 ツイート数: ${tweets.length}件`);
  tweets.forEach((t, i) => {
    console.log(`--- ツイート${i + 1} (${t.length}文字) ---`);
    console.log(t.slice(0, 60) + (t.length > 60 ? '...' : ''));
  });

  const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: false,
    slowMo: 100,
    viewport: { width: 1280, height: 900 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const page = await browser.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const results = [];

  try {
    // ログイン確認
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/i/flow')) {
      console.error('❌ ログインが必要です。先に node setup-x-profile.js を実行してください');
      await browser.close();
      process.exit(1);
    }
    console.log('✅ ログイン確認OK');

    // 1ツイート目（新規）
    console.log(`\n📤 ツイート1/${tweets.length} 投稿中...`);
    const firstUrl = await composeTweet(page, tweets[0], null);
    results.push(firstUrl);
    console.log(`✅ ツイート1 完了: ${firstUrl || '（URL取得失敗）'}`);

    // 2ツイート目以降（スレッド返信）
    for (let i = 1; i < tweets.length; i++) {
      console.log(`\n⏳ 次のツイートまで15秒待機...`);
      await page.waitForTimeout(15000);

      console.log(`📤 ツイート${i + 1}/${tweets.length} 投稿中...`);
      const tweetUrl = await composeTweet(page, tweets[i], results[0]);
      results.push(tweetUrl);
      console.log(`✅ ツイート${i + 1} 完了: ${tweetUrl || '（URL取得失敗）'}`);
    }

    // ── noteURLをスレッド最後のツイートへのリプライとしてぶら下げる ──
    // 本文にURLを入れるとインプが落ちるため、ツリーの末尾に繋げる形にする
    const lastTweetUrl = results.filter(Boolean).pop();
    if (NOTE_URL && lastTweetUrl) {
      console.log(`\n⏳ URLリプライ前に15秒待機...`);
      await page.waitForTimeout(15000);

      console.log(`🔗 noteURLをスレッド末尾にリプライ中...`);
      try {
        await replyWithUrl(page, lastTweetUrl, NOTE_URL);
        console.log('✅ URLリプライ完了');
      } catch(e) {
        console.log('⚠️ URLリプライ失敗（スレッド本体は投稿済み）:', e.message);
      }
    }

    // ── 投稿結果を Markdown に記録 ──
    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const urls = results.map((u, i) => `- ツイート${i + 1}: ${u || '（URL不明）'}`).join('\n');
    const noteUrlLine = NOTE_URL ? `- 引用リポスト: ${NOTE_URL}\n` : '';
    const header = `<!-- POSTED -->\n## X投稿結果\n- 投稿日時: ${now}\n${urls}\n${noteUrlLine}\n`;
    fs.writeFileSync(MD_FILE, header + content);

    console.log('\n🎉 スレッド投稿完了！');
    if (results[0]) console.log(`🔗 スレッド先頭: ${results[0]}`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
