const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3001;
const VO = path.join(os.homedir(), 'virtual-office');
const LOG_BOT   = path.join(VO, 'logs', 'bot.log');
const LOG_PIPE  = path.join(VO, 'logs', 'pipeline.log');
const STATE_FILE= path.join(VO, 'logs', 'pipeline-state.json');
const DRAFTS    = path.join(VO, 'output', 'drafts');
const REVIEWED  = path.join(VO, 'output', 'reviewed');
const PUBLISHED = path.join(VO, 'output', 'published');

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── pipeline-state.json（botがリアルタイムで更新する） ──
function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    // 10分以上古いstateは無効
    if (Date.now() - new Date(s.ts).getTime() > 600000) return null;
    return s;
  } catch(e) { return null; }
}

// ── pipeline.log からステージを検出 ──
const STAGE_PATTERNS = [
  // 配信部（最後なので先に判定）
  { stage: 4, re: /【配信部|カイ.*(?:投稿|配信)|ユイ.*スケジュール|PIPELINE COMPLETE|投稿実行/ },
  // 校正部
  { stage: 3, re: /【校正部|マコト.*SEO|SEOスコア|サクラ.*法務|ヒロ.*品質|ナツキ.*判定|最終判定|Final.*GO|Final.*NG|REVISE/ },
  // 執筆部
  { stage: 2, re: /【執筆部|アオイ.*(?:執筆|note)|ソラ.*(?:X投稿|Instagram|スレッド)|レイ.*(?:TikTok|台本)/ },
  // リサーチ部
  { stage: 1, re: /【リサーチ部|ハルカ.*(?:調査|Web)|タクミ.*競合|リン.*法規制|法規制事前/ },
  // 企画部
  { stage: 0, re: /【企画部|ミサキ.*テーマ|テーマ.*選定|ケンタ.*KW|KWリサーチ|produce article/ },
];

function detectStageFromLog(lines) {
  // 後ろから30行を見て最も進んだステージを返す
  const tail = lines.slice(-30).join('\n');
  for (const { stage, re } of STAGE_PATTERNS) {
    if (re.test(tail)) return stage;
  }
  return -1;
}

// ── pipeline.log から現在の作業メッセージを抽出 ──
function detectMsg(lines) {
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
    const l = lines[i].trim();
    if (!l || l.startsWith('[20') || l.startsWith('#') || l.startsWith('```')) continue;
    // 「- テキスト」形式の詳細行
    const dm = l.match(/^[-・]\s+(.{5,60})$/);
    if (dm) return dm[1];
    // 「【xxx】」ヘッダーの次の行
    if (/^【.+】/.test(l) && i + 1 < lines.length) {
      const next = lines[i + 1]?.trim();
      if (next && next.length > 4) return next.replace(/^[-・]\s*/, '');
    }
  }
  return null;
}

// ── output/ 以下から記事一覧を収集 ──
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
        if (!map[id].files.includes(m[2])) map[id].files.push(m[2]);
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
  scanDir(DRAFTS, 'draft');
  scanDir(REVIEWED, 'reviewed');
  scanDir(PUBLISHED, 'published');

  return Object.values(map).map(a => ({
    id: a.id, g: a.g,
    t: a.title || a.id,
    p: Math.min(100, Math.round((a.files.length / 4) * 100)),
    status: a.status,
    platforms: a.files,
    date: a.date,
  })).sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

// ── ログファイル読み込み（タイムスタンプ付き行のみ） ──
function readLog(file, n=40) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  const parsed = [];
  const seen = new Set();
  for (const line of lines) {
    // [2026-05-03T03:12:40.868Z] message  (bot.log形式)
    const m1 = line.match(/^\[(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}))\.\d+Z\]\s+(.+)$/);
    if (m1) {
      const key = m1[1] + m1[3];
      if (!seen.has(key)) { seen.add(key); parsed.push({ ts: m1[2], m: m1[3], src: 'bot', iso: m1[1] }); }
      continue;
    }
    // [2026-05-03 12:24:06] message  (pipeline.log形式)
    const m2 = line.match(/^\[(\d{4}-\d{2}-\d{2}[\sT]+(\d{2}:\d{2}(?::\d{2})?))\]\s+(.+)$/);
    if (m2) {
      const key = m2[1] + m2[3];
      if (!seen.has(key)) { seen.add(key); parsed.push({ ts: m2[2], m: m2[3], src: 'pipe', iso: m2[1] }); }
      continue;
    }
    // インデント行 = 直前エントリの詳細
    if ((line.startsWith('  ') || line.startsWith('\t')) && parsed.length > 0) {
      parsed[parsed.length-1].detail = (parsed[parsed.length-1].detail||'') + line.trim() + ' ';
    }
  }
  return parsed.slice(-n);
}

function secsSinceMtime(file) {
  if (!fs.existsSync(file)) return Infinity;
  return (Date.now() - fs.statSync(file).mtimeMs) / 1000;
}

// ── GET /api/status ──
app.get('/api/status', (req, res) => {
  // botが書いたリアルタイム状態を優先
  const state = readState();

  const pipeLines = fs.existsSync(LOG_PIPE)
    ? fs.readFileSync(LOG_PIPE, 'utf8').trim().split('\n').filter(Boolean)
    : [];
  const botLogs  = readLog(LOG_BOT, 25);
  const pipeLogs = readLog(LOG_PIPE, 30);

  // マージ（重複除去済み）
  const allLogs = [...pipeLogs, ...botLogs]
    .sort((a,b) => (a.iso||'').localeCompare(b.iso||''))
    .slice(-50);

  const pipeAge = Math.round(secsSinceMtime(LOG_PIPE));
  const botAge  = Math.round(secsSinceMtime(LOG_BOT));

  let stage, activeChar, activeMsg, genre, articleId;

  if (state) {
    // pipeline-state.json が新しければ最優先
    const DEPT_MAP = {
      企画部: 0, research: 1, リサーチ部: 1,
      執筆部: 2, 校正部: 3, 配信部: 4,
    };
    stage = DEPT_MAP[state.dept] ?? detectStageFromLog(pipeLines);
    activeChar = state.char;
    activeMsg  = state.msg;
    genre      = state.genre;
    articleId  = state.articleId;
  } else {
    stage     = pipeAge < 600 ? detectStageFromLog(pipeLines) : -1;
    activeMsg = stage >= 0 ? detectMsg(pipeLines) : null;
  }

  const articles = scanArticles();

  const { execSync } = require('child_process');
  let botRunning = false;
  try { botRunning = execSync('pgrep -f "node bot.js"').toString().trim().length > 0; } catch(e) {}

  res.json({
    stage,
    activeChar: activeChar || null,
    activeMsg:  activeMsg  || null,
    genre:      genre      || null,
    articleId:  articleId  || null,
    logs: allLogs,
    articles,
    botRunning,
    pipeAge,
    botAge: Math.round(botAge),
  });
});

// ── GET /api/articles ──
app.get('/api/articles', (req, res) => {
  res.json(scanArticles());
});

// ── POST /api/produce ── ダッシュボードから記事生成をトリガー
app.post('/api/produce', (req, res) => {
  const { genre = 'G1' } = req.body || {};
  if (!['G1','G2','G3'].includes(genre)) {
    return res.status(400).json({ error: 'invalid genre' });
  }
  const { exec } = require('child_process');
  const EXEC_ENV = { ...process.env, PATH: ['/usr/local/bin','/opt/homebrew/bin', process.env.PATH||''].join(':') };
  const cmd = `cd "${VO}" && claude --dangerously-skip-permissions -p "produce article ${genre}"`;
  // 非同期実行（レスポンスはすぐ返す）
  exec(cmd, { timeout: 900000, env: EXEC_ENV }, (err, stdout) => {
    if (err) console.error('[produce] error:', err.message);
    else console.log('[produce] done:', stdout.slice(-200));
  });
  res.json({ ok: true, genre, message: `${genre} 記事生成を開始しました` });
});

// ── POST /api/state ── botがリアルタイム状態を書き込む（内部用） ──
app.post('/api/state', (req, res) => {
  try {
    const body = { ...req.body, ts: new Date().toISOString() };
    fs.writeFileSync(STATE_FILE, JSON.stringify(body, null, 2));
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/state ── パイプライン完了時にstateをクリア ──
app.delete('/api/state', (req, res) => {
  try { fs.unlinkSync(STATE_FILE); } catch(e) {}
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`[API] http://localhost:${PORT}/api/status`));
