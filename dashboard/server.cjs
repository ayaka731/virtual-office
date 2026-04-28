const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3001;
const VO = path.join(os.homedir(), 'virtual-office');
const LOG_BOT  = path.join(VO, 'logs', 'bot.log');
const LOG_PIPE = path.join(VO, 'logs', 'pipeline.log');
const DRAFTS   = path.join(VO, 'output', 'drafts');
const REVIEWED = path.join(VO, 'output', 'reviewed');
const PUBLISHED= path.join(VO, 'output', 'published');

// パイプラインログからステージを判定
function detectStage(lines) {
  const tail = lines.slice(-30).join('\n');
  const low  = tail.toLowerCase();
  if (/配信|distribution|published|投稿完了|pv計測/.test(low)) return 4;
  if (/校正|review|seo.*score|法務|品質|final.*go|revise|reject/.test(low)) return 3;
  if (/執筆|writing|ライター|note.*h2|xスレッド|tiktok台本|アフィリリンク/.test(low)) return 2;
  if (/リサーチ|research|調査|競合|景表法|口コミ/.test(low)) return 1;
  if (/企画|planning|kw|テーマ|ペルソナ|検索vol/.test(low)) return 0;
  return -1;
}

// ステージからアクティブキャラのセリフを判定
function detectMsg(lines, stage) {
  const tail = lines.slice(-5);
  for (const l of tail.reverse()) {
    const m = l.match(/\]\s+(.{5,})$/);
    if (m) return m[1].trim();
  }
  return null;
}

// output/ 以下から記事一覧を収集
function scanArticles() {
  const map = {};

  const scanDir = (dir, status) => {
    if (!fs.existsSync(dir)) return;
    for (const dateDir of fs.readdirSync(dir)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) continue;
      const full = path.join(dir, dateDir);
      for (const file of fs.readdirSync(full)) {
        if (!file.endsWith('.md')) continue;
        const m = file.match(/^(G\d-\d+)-(note|x|instagram|tiktok)\.md$/);
        if (!m) continue;
        const id = m[1];
        if (!map[id]) map[id] = { id, g: id.split('-')[0], files: [], date: dateDir, status, title: null };
        map[id].files.push(m[2]);
        // noteファイルからタイトル抽出
        if (m[2] === 'note' && !map[id].title) {
          try {
            const content = fs.readFileSync(path.join(full, file), 'utf8');
            const tm = content.match(/^#\s+(.+)$/m);
            if (tm) map[id].title = tm[1].replace(/\{.*?\}/g,'').trim();
          } catch(e) {}
        }
      }
    }
  };

  scanDir(DRAFTS,    'draft');
  scanDir(REVIEWED,  'reviewed');
  scanDir(PUBLISHED, 'published');

  return Object.values(map).map(a => ({
    id: a.id, g: a.g,
    t: a.title || a.id,
    p: Math.min(100, Math.round((a.files.length / 4) * 100)),
    status: a.status,
    platforms: a.files,
    date: a.date,
  })).sort((a,b) => b.date.localeCompare(a.date));
}

// ログファイルを読んで整形（タイムスタンプ付き行のみ）
function readLog(file, n=40) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  const parsed = [];
  for (const line of lines) {
    // [2026-04-28T06:12:40.868Z] message  (bot.log形式)
    const m1 = line.match(/^\[(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}))\.\d+Z\]\s+(.+)$/);
    if (m1) { parsed.push({ ts: m1[2], m: m1[3], src: 'bot', iso: m1[1] }); continue; }
    // [2026-04-28 HH:MM:SS] message  (pipeline.log形式)
    const m2 = line.match(/^\[(\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2}))\]\s+(.+)$/);
    if (m2) { parsed.push({ ts: m2[2], m: m2[3], src: 'pipe', iso: m2[1] }); continue; }
    // インデント行（pipeline.logの詳細）= 直前エントリに付加
    if (line.startsWith('  ') && parsed.length > 0) {
      parsed[parsed.length-1].detail = (parsed[parsed.length-1].detail||'') + line.trim() + ' ';
    }
  }
  return parsed.slice(-n);
}

// ファイルの最終更新からの経過秒
function secsSinceMtime(file) {
  if (!fs.existsSync(file)) return Infinity;
  return (Date.now() - fs.statSync(file).mtimeMs) / 1000;
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/api/status', (req, res) => {
  const pipeLogs  = readLog(LOG_PIPE, 60);
  const botLogs   = readLog(LOG_BOT,  20);
  // 時刻でマージしてソート
  const allLogs = [...pipeLogs, ...botLogs]
    .sort((a,b) => (a.iso||'').localeCompare(b.iso||''))
    .slice(-50);

  // 最後のファイル更新からの経過時間
  const pipeAge = Math.round(secsSinceMtime(LOG_PIPE));
  const botAge  = Math.round(secsSinceMtime(LOG_BOT));
  const isActive = Math.min(pipeAge, botAge) < 300; // 5分以内ならアクティブ

  const pipeLines = pipeLogs.map(l => l.m);
  const stage = isActive ? detectStage(pipeLines) : -1;
  const activeMsg = stage >= 0 ? detectMsg(pipeLines, stage) : null;

  const articles = scanArticles();

  // 稼働中のBotプロセスチェック
  const { execSync } = require('child_process');
  let botRunning = false;
  try { botRunning = execSync('pgrep -f "node bot.js"').toString().trim().length > 0; } catch(e) {}

  res.json({ stage, activeMsg, logs: allLogs, articles, botRunning, pipeAge: Math.round(pipeAge) });
});

app.listen(PORT, () => console.log(`[API] http://localhost:${PORT}/api/status`));
