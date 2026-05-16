/**
 * X（Twitter）API v2 自動投稿スクリプト
 *
 * 使い方: node post-to-x-api.js <xのMarkdownファイルパス> [noteのURL]
 * 例:     node post-to-x-api.js output/drafts/2026-05-13/G1-012-x.md https://note.com/yorushoku_500/n/xxx
 *
 * 投稿構成（2段スレッド）:
 *   投稿①: Markdownの最初の --- ブロック（短文フック・不安煽り系）
 *   投稿②: noteURL（リプライ・1行のみ）
 *
 * Markdownの「## スレッド投稿（メイン）」セクションから --- 区切りで分割する。
 * 画像は添付しない（テキストのみ）。
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
const platformsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const xConfig = platformsConfig.x.api;
const xId    = platformsConfig.x.id;

const client = new TwitterApi({
  appKey:      xConfig.apiKey,
  appSecret:   xConfig.apiSecret,
  accessToken: xConfig.accessToken,
  accessSecret: xConfig.accessSecret,
});
const rwClient = client.readWrite;

// ── Markdownからスレッドツイートを抽出 ────────────────────────────
function extractThreadTweets(mdPath) {
  const content = fs.readFileSync(mdPath, 'utf8');

  if (content.includes('<!-- POSTED -->')) {
    console.log('ℹ️  このファイルは既に投稿済みです');
    process.exit(0);
  }

  // 「スレッド投稿（メイン）」セクションを抽出（なければ全体）
  const mainMatch = content.match(/##\s*スレッド投稿（メイン）([\s\S]*?)(?=^##|\Z)/m);
  const mainSection = mainMatch ? mainMatch[1] : content;

  // --- 区切りでツイートに分割（コメント行・空ブロックは除外）
  const tweets = mainSection
    .split(/^---+$/m)
    .map(block => block.replace(/<!--.*?-->/gs, '').trim())
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

// ── メイン ────────────────────────────────────────────────────────
async function main() {
  const { tweets, content } = extractThreadTweets(MD_FILE);

  if (tweets.length === 0) {
    console.error('❌ ツイートが見つかりません（--- 区切りのブロックが必要）');
    process.exit(1);
  }

  // 投稿① をそのまま使い、投稿② はnoteURL（引数またはMarkdown内の最終ブロック）
  const hookTweet = tweets[0];
  const urlTweet  = NOTE_URL || (tweets.length > 1 ? tweets[tweets.length - 1] : null);

  const postQueue = [hookTweet];
  if (urlTweet) postQueue.push(urlTweet);

  console.log(`📄 ファイル: ${path.basename(MD_FILE)}`);
  console.log(`🐦 投稿数: ${postQueue.length}件（投稿①フック + ${urlTweet ? '②URL' : 'URLなし'}）`);
  if (NOTE_URL) console.log(`🔗 noteURL: ${NOTE_URL}`);
  console.log('');

  const results = [];
  let replyToId = null;

  for (let i = 0; i < postQueue.length; i++) {
    const text = postQueue[i];
    console.log(`📤 投稿 ${i + 1}/${postQueue.length}...`);
    console.log(`   ${text.slice(0, 80).replace(/\n/g, ' ')}${text.length > 80 ? '...' : ''}`);

    try {
      const tweetId = await postTweet(text, replyToId);
      results.push(tweetId);
      replyToId = tweetId;
      console.log(`✅ 完了 ID: ${tweetId}`);
      if (i < postQueue.length - 1) await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      const msg = err.data?.detail || err.message || String(err);
      console.error(`❌ 投稿${i + 1} 失敗: ${msg}`);
      if (msg.includes('duplicate')) {
        console.log('   → 重複投稿のためスキップ');
        continue;
      }
      throw err;
    }
  }

  // ── 投稿済みマーカーをファイルに記録 ──
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
