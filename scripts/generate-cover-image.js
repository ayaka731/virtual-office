/**
 * カバー画像自動生成スクリプト（Pollinations.ai 使用・完全無料）
 *
 * 使い方: node generate-cover-image.js <noteのMarkdownファイルパス>
 * 例:     node generate-cover-image.js ../output/drafts/2026-05-06/G1-005-note.md
 *
 * 生成先: ../assets/covers/{記事ID}-cover.png
 *
 * キャラクター: 瑠璃（ルリ）
 *   - ショートウェーブのダークブラウンボブ
 *   - 大きなアンバーブラウンの瞳
 *   - ふんわり丸い顔、ほんのり赤いほっぺ
 *   - 記事ごとに衣装・小物・背景を変える
 */

'use strict';
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const MD_FILE     = process.argv[2];
const COVERS_DIR  = path.join(__dirname, '..', 'assets', 'covers');
const WIDTH       = 1200;
const HEIGHT      = 630;

if (!MD_FILE || !fs.existsSync(MD_FILE)) {
  console.error('使い方: node generate-cover-image.js <noteのMarkdownファイルパス>');
  process.exit(1);
}

// ── 記事IDと記事情報を取得 ────────────────────────────────────────
function parseArticle(mdPath) {
  const base    = path.basename(mdPath, '.md');
  const id      = base.replace(/-note$/, '');
  const genre   = id.split('-')[0];
  const content = fs.readFileSync(mdPath, 'utf8');

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/【.*?】/g, '').trim() : id;

  const h2s = [...content.matchAll(/^##\s+(.+)$/gm)].map(m => m[1]).slice(0, 3);

  // 記事番号からアクセサリーのバリエーションを決める（同キャラ・違う衣装）
  const num = parseInt(id.split('-')[1] || '1', 10);

  return { id, genre, title, h2s, num };
}

// ── 一貫キャラ（瑠璃）のプロンプト生成 ──────────────────────────────
function buildPrompt(genre, title, h2s, num) {
  // ── キャラクター固定ベース ──
  const CHARACTER =
    'cute kawaii anime girl, short wavy dark brown bob hairstyle with natural highlights, ' +
    'large expressive amber brown eyes, soft rounded face, rosy blushing cheeks, ' +
    'warm gentle smile, consistent character design, high quality 2D anime illustration';

  // ── 衣装バリエーション（記事番号で循環） ──
  const OUTFITS = [
    'wearing cozy cream hoodie',
    'wearing soft pink oversized sweater',
    'wearing light blue denim jacket',
    'wearing white blouse with bow collar',
    'wearing warm caramel knit cardigan',
    'wearing mint green casual tee',
    'wearing lavender pastel hoodie',
    'wearing striped beige long-sleeve shirt',
    'wearing peach ruffle blouse',
    'wearing sage green zip-up hoodie',
    'wearing cream off-shoulder top',
    'wearing soft yellow knit sweater',
  ];

  // ── 帽子・小物バリエーション ──
  const ACCESSORIES = [
    '',
    'wearing a cute brown beret',
    'wearing a white bucket hat',
    'wearing a beige baseball cap',
    'wearing a cozy knit beanie',
    'wearing a straw hat with ribbon',
    '',
    'wearing a navy cap',
    'wearing a soft pink beret',
    '',
    'wearing a cream bucket hat',
    'wearing a floral hair clip',
  ];

  const outfit    = OUTFITS[num % OUTFITS.length];
  const accessory = ACCESSORIES[num % ACCESSORIES.length];
  const accStr    = accessory ? `, ${accessory}` : '';

  // ── ジャンル別背景・小物 ──
  const genreBg = {
    G1: 'cozy bedroom background, warm pastel tones, soft indoor lighting, potted plants, ' +
        'holding glowing smartphone, floating chat bubble icons and yen coin sparkles',
    G2: 'clean modern desk setup background, soft neutral tones, surrounded by floating product icons, ' +
        'holding smartphone or small product box, pastel tech aesthetic',
    G3: 'clean white background with small delivery box icons, soft business casual setting, ' +
        'cheerful professional atmosphere',
  };
  const bg = genreBg[genre] || 'soft pastel background, clean blog illustration style';

  // ── タイトルキーワードで表情・ポーズを微調整 ──
  let pose = 'gentle smile, relaxed pose';
  if (/身バレ|プライバシー|安全|秘密/.test(title))  pose = 'slightly cautious expression, thoughtful pose, one finger to lips';
  if (/稼ぐ|収入|副業|月収|万円/.test(title))       pose = 'excited happy expression, both hands up celebrating, coins sparkling around';
  if (/ガジェット|イヤホン|ヘッドホン/.test(title)) pose = 'wearing wireless earphones, curious happy expression, thumbs up';
  if (/初心者|始め方|入門/.test(title))             pose = 'holding open notebook, curious expression, beginner guide vibe';
  if (/比較|ランキング|選び方/.test(title))          pose = 'pointing finger upward, confident smile, ranking trophy nearby';
  if (/おすすめ|人気|厳選/.test(title))             pose = 'thumbs up, bright enthusiastic smile';
  if (/注意|リスク|危険|やばい/.test(title))        pose = 'slightly worried expression, hands together, cautionary gesture';

  const prompt =
    `${CHARACTER}, ${outfit}${accStr}, ${pose}, ` +
    `${bg}, ` +
    `wide 16:9 blog cover illustration, no text overlay, clean composition, ` +
    `pastel color palette, soft warm lighting, high quality anime art`;

  return prompt;
}

// ── Pollinations.ai から画像をダウンロード ──────────────────────────
function downloadImage(imageUrl, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(imageUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const request = client.get(imageUrl, { timeout: 120000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(); resolve(destPath); });
      fileStream.on('error', reject);
    });
    request.on('error', reject);
    request.on('timeout', () => { request.destroy(); reject(new Error('タイムアウト')); });
  });
}

async function main() {
  const { id, genre, title, h2s, num } = parseArticle(MD_FILE);
  const outPath = path.join(COVERS_DIR, `${id}-cover.png`);

  if (fs.existsSync(outPath)) {
    console.log(`ℹ️  カバー画像は既に存在します: ${outPath}`);
    process.exit(0);
  }

  const prompt = buildPrompt(genre, title, h2s, num);
  console.log(`🎨 カバー画像を生成中...`);
  console.log(`   記事: ${id} - ${title}`);
  console.log(`   プロンプト: ${prompt.slice(0, 100)}...`);

  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${WIDTH}&height=${HEIGHT}&nologo=true&model=flux&seed=${Math.floor(Math.random()*99999)}`;

  fs.mkdirSync(COVERS_DIR, { recursive: true });

  try {
    await downloadImage(imageUrl, outPath);
    const size = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`✅ 画像生成完了: ${outPath} (${size}KB)`);
    console.log(`   → note投稿時に自動でカバー画像として使用されます`);

    // pipeline.log に記録
    const logDir  = path.join(__dirname, '..', 'logs');
    const logPath = path.join(logDir, 'pipeline.log');
    fs.mkdirSync(logDir, { recursive: true });
    const logEntry = [
      `【執筆部・ハナ】`,
      `- 記事ID: ${id}`,
      `- カバー画像生成: assets/covers/${id}-cover.png`,
      `- プロンプト概要: ${prompt.slice(0, 80)}...`,
      `- サイズ: ${WIDTH}×${HEIGHT}px`,
      '',
    ].join('\n');
    fs.appendFileSync(logPath, logEntry);
  } catch(e) {
    console.error(`❌ 画像生成失敗: ${e.message}`);
    process.exit(1);
  }
}

main();
