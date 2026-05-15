/**
 * note + X 一括投稿スクリプト
 *
 * 使い方: node publish-with-x.js <noteのMarkdownファイルパス>
 * 例:     node publish-with-x.js output/drafts/2026-05-13/G1-012-note.md
 *
 * 動作:
 *   1. note に記事を投稿（post-to-note.js）
 *   2. 公開された noteURL を取得
 *   3. 対応する *-x.md ファイルを探してX（Twitter）にスレッド投稿
 *
 * 環境変数:
 *   SKIP_X=1   X投稿をスキップ（noteだけ投稿したいとき）
 */

'use strict';
const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const NOTE_FILE = process.argv[2];

if (!NOTE_FILE || !fs.existsSync(NOTE_FILE)) {
  console.error('使い方: node publish-with-x.js <noteのMarkdownファイルパス>');
  process.exit(1);
}

// note.md → x.md のパスを導出
const X_FILE = NOTE_FILE.replace(/-note\.md$/, '-x.md');

// ── Step 1: note に投稿 ──────────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Step 1: note に投稿中...');
console.log(`   ${path.basename(NOTE_FILE)}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

let noteUrl = null;
try {
  const result = spawnSync('node', [
    path.join(__dirname, 'post-to-note.js'),
    NOTE_FILE,
  ], {
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 300000,
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.status !== 0) {
    console.error('\n❌ note投稿に失敗しました');
    process.exit(1);
  }

  // 出力から noteURL を抽出
  const urlMatch = stdout.match(/🔗 記事URL:\s*(https:\/\/note\.com\/[^\s]+)/);
  if (urlMatch) {
    noteUrl = urlMatch[1];
    console.log(`\n✅ note投稿完了: ${noteUrl}`);
  } else {
    console.log('\n✅ note投稿完了（URLの自動取得に失敗）');
  }

} catch (err) {
  console.error('❌ note投稿エラー:', err.message);
  process.exit(1);
}

// ── Step 2: X に投稿 ────────────────────────────────────────────
if (process.env.SKIP_X === '1') {
  console.log('\nℹ️  X投稿をスキップ（SKIP_X=1）');
  process.exit(0);
}

if (!fs.existsSync(X_FILE)) {
  console.log(`\nℹ️  Xファイルが見つかりません（スキップ）: ${path.basename(X_FILE)}`);
  process.exit(0);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🐦 Step 2: X にスレッド投稿中...');
console.log(`   ${path.basename(X_FILE)}`);
if (noteUrl) console.log(`   noteURL: ${noteUrl}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// X投稿は30秒待ってから（noteキャッシュが反映されるのを待つ）
console.log('⏳ 30秒待機中（noteがキャッシュされるのを待ちます）...\n');
spawnSync('sleep', ['30']);

const xArgs = [path.join(__dirname, 'post-to-x.js'), X_FILE];
if (noteUrl) xArgs.push(noteUrl);

const xResult = spawnSync('node', xArgs, {
  stdio: 'inherit',
  encoding: 'utf8',
  timeout: 300000,
});

if (xResult.status !== 0) {
  console.error('\n⚠️  X投稿に失敗しました（note投稿は成功済み）');
  process.exit(1);
}

console.log('\n🎉 note + X 投稿が完了しました！');
if (noteUrl) console.log(`   note: ${noteUrl}`);
