/**
 * X（Twitter）API v2 自動投稿スクリプト
 *
 * 使い方: node post-to-x-api.js <xのMarkdownファイルパス> [noteのURL]
 * 例:     node post-to-x-api.js output/drafts/2026-05-13/G1-012-x.md https://note.com/yorushoku_500/n/xxx
 *
 * Markdownファイルの「スレッド投稿（メイン）」セクションを読み取り、
 * --- 区切りごとに1ツイートとして順番にスレッド投稿する。
 * 最後のツイートに noteURL を自動で追記する。
 */

'use strict';
const { TwitterApi } = require('twitter-api-v2');
const fs   = require('fs');
const path = require('path');

const MD_FILE  = process.argv[2];
const NOTE_URL = process.argv[3] || null;

if (!MD_FILE || !fs.existsSync(MD_FILE)) {
  console.error('使い方: node post-to-x-api.js <x-markdown> [noteURL]');
  process.exit(1);
}

// ── 設定読み込み ──────────────────────────────────────────────────
const configPath = path.join(__dirname, '..', 'config', 'platforms.json');
const xConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')).x.api;

const client = new TwitterApi({
  appKey:           xConfig.apiKey,
  appSecret:        xConfig.apiSecret,
  accessToken:      xConfig.accessToken,
  accessSecret:     xConfig.accessSecret,
});
const rwClient = client.readWrite;

// ── Markdownからスレッドツイートを抽出 ────────────────────────────
function extractThreadTweets(mdPath) {
  const content = fs.readFileSync(mdPath, 'utf8');

  if (content.includes('<!-- POSTED -->')) {
    console.log('ℹ️  このファイルは既に投稿済みです');
    process.exit(0);
  }

  // 「スレッド投稿（メイン）」セクションを抽出
  const mainMatch = content.match(/##\s*スレッド投稿（メイン）([\s\S]*?)(?=^##|\Z)/m);
  const mainSection = mainMatch ? mainMatch[1] : content;

  // --- 区切りでツイートに分割
  const tweets = mainSection
    .split(/^---+$/m)
    .map(block => block.trim())
    .filter(block => block.length > 0 && !block.startsWith('#'));

  return { tweets, content };
}

// ── 1ツイートを投稿（reply_to があればスレッド） ──────────────────
async function postTweet(text, replyToId = null) {
  const payload = { text };
  if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };

  const res = await rwClient.v2.tweet(payload);
  return res.data.id;
}

// ── URLをツイートに追記（280字制限を考慮） ───────────────────────
function appendUrl(text, url) {
  if (!url) return text;
  const separator = '\n\n';
  const maxLen = 280 - 23 - separator.length; // URLは23字扱い
  const trimmed = text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
  return `${trimmed}${separator}${url}`;
}

// ── メイン ────────────────────────────────────────────────────────
async function main() {
  const { tweets, content } = extractThreadTweets(MD_FILE);

  if (tweets.length === 0) {
    console.error('❌ ツイートが見つかりません（--- 区切りのブロックが必要）');
    process.exit(1);
  }

  console.log(`📄 ファイル: ${path.basename(MD_FILE)}`);
  console.log(`🐦 ツイート数: ${tweets.length}件`);
  if (NOTE_URL) console.log(`🔗 noteURL: ${NOTE_URL}`);
  console.log('');

  const results = [];
  let replyToId = null;

  for (let i = 0; i < tweets.length; i++) {
    // 最後のツイートにnoteURLを追記
    const isLast = i === tweets.length - 1;
    const text = (isLast && NOTE_URL) ? appendUrl(tweets[i], NOTE_URL) : tweets[i];

    console.log(`📤 ツイート ${i + 1}/${tweets.length} 投稿中...`);
    console.log(`   ${text.slice(0, 60).replace(/\n/g, ' ')}${text.length > 60 ? '...' : ''}`);

    try {
      const tweetId = await postTweet(text, replyToId);
      results.push(tweetId);
      replyToId = tweetId;
      console.log(`✅ 投稿完了 ID: ${tweetId}`);

      // レート制限対策（スレッド間1秒）
      if (i < tweets.length - 1) await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      const msg = err.data?.detail || err.message || String(err);
      console.error(`❌ ツイート${i + 1} 失敗: ${msg}`);
      if (msg.includes('duplicate')) {
        console.log('   → 重複投稿のためスキップ');
        continue;
      }
      throw err;
    }
  }

  // ── 投稿済みマーカーをファイルに記録 ──
  const xId = JSON.parse(fs.readFileSync(configPath, 'utf8')).x.id;
  const firstUrl = results[0] ? `https://x.com/${xId}/status/${results[0]}` : '';
  const header = `<!-- POSTED -->\n## X投稿結果\n- スレッド先頭: ${firstUrl}\n- 投稿数: ${results.length}件\n\n`;
  fs.writeFileSync(MD_FILE, header + content);

  console.log(`\n🎉 スレッド投稿完了！`);
  if (firstUrl) console.log(`🔗 ${firstUrl}`);
}

main().catch(err => {
  console.error('Fatal error:', err.data?.detail || err.message);
  process.exit(1);
});
