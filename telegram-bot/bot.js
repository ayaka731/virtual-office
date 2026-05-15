#!/usr/bin/env node
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const BOT_TOKEN = config.telegram.botToken;
const OWNER_ID = config.telegram.ownerId;
const VIRTUAL_OFFICE = config.paths.virtualOffice.replace('~', os.homedir());
const LOG_DIR = config.paths.logs.replace('~', os.homedir());

// ── 二重起動防止 ──
const PID_FILE = path.join(LOG_DIR, 'bot.pid');
if (fs.existsSync(PID_FILE)) {
  const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
  try {
    process.kill(oldPid, 0); // プロセスが生きているか確認
    console.error(`❌ すでにBot(PID:${oldPid})が起動中です。kill ${oldPid} してから再起動してください`);
    process.exit(1);
  } catch(e) {
    // 古いPIDファイルが残っていただけ（プロセスは既に死んでいる）
  }
}
fs.writeFileSync(PID_FILE, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(PID_FILE); } catch(e) {} });

// PATHを明示（cronやlaunchd経由で起動した場合にclaudeが見つからないことがある）
const EXEC_ENV = {
  ...process.env,
  PATH: [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    process.env.PATH || '',
  ].filter(Boolean).join(':'),
};

const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 2000,        // 2秒ごとにポーリング
    autoStart: true,
    params: { timeout: 30 },
  },
  request: { family: 4 },  // IPv4強制（Node.js v24のIPv6/undici問題対策）
});

// polling エラーは自動復旧（ログだけ記録）
bot.on('polling_error', (err) => {
  log(`polling_error: ${err.code} - ${err.message || String(err)}`);
});

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  // stderrに出力（デバッグ用・bot.logへの二重書き込みを防ぐ）
  process.stderr.write(line + '\n');
  // ファイルには1回だけ書く
  try { fs.appendFileSync(path.join(LOG_DIR, 'bot.log'), line + '\n'); } catch(e) {}
}

function isOwner(chatId) { return chatId === OWNER_ID; }

async function notifyOwner(text) {
  try { await bot.sendMessage(OWNER_ID, text, { parse_mode: 'HTML' }); } catch(e) { log('通知失敗: ' + e.message); }
}

// ── ダッシュボードAPIを叩いてリアルタイム状態を更新 ──
const DASHBOARD_API = 'http://localhost:3001';
function pushDashboardState(state) {
  const http = require('http');
  const body = JSON.stringify(state);
  const req = http.request({ hostname:'localhost', port:3001, path:'/api/state', method:'POST',
    headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} }, () => {});
  req.on('error', () => {}); // ダッシュボードが落ちてても無視
  req.write(body);
  req.end();
}
function clearDashboardState() {
  const http = require('http');
  const req = http.request({ hostname:'localhost', port:3001, path:'/api/state', method:'DELETE' }, () => {});
  req.on('error', () => {});
  req.end();
}

// キャラ名 → 部署マッピング
const CHAR_DEPT = {
  ミサキ:'企画部', ケンタ:'企画部', ユイ:'企画部',
  ハルカ:'リサーチ部', タクミ:'リサーチ部', リン:'リサーチ部',
  アオイ:'執筆部', ソラ:'執筆部', レイ:'執筆部',
  マコト:'校正部', サクラ:'校正部', ヒロ:'校正部', ナツキ:'校正部',
  カイ:'配信部', ミク:'配信部',
};

function runClaudeCode(command, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const fullCommand = `cd ${VIRTUAL_OFFICE} && claude --dangerously-skip-permissions -p "${command}"`;
    log('実行: ' + fullCommand);
    exec(fullCommand, { timeout, maxBuffer: 1024*1024*10, env: EXEC_ENV }, (error, stdout, stderr) => {
      if (error) { reject(new Error(error.killed ? 'タイムアウト（10分超過）' : 'エラー: ' + error.message + '\n' + stderr)); return; }
      resolve(stdout.trim());
    });
  });
}

// ── pipeline.log を監視してキャラクター進捗をリアルタイム通知 ──
// Claudeはキャラクター進捗をstdoutではなくpipeline.logに書くため、ファイル監視が確実
const LOG_STEPS = [
  { re: /【企画部[・\s]*ミサキ|ミサキ.*テーマ|テーマ.*選定/, msg: '👩 <b>ミサキ（企画長）</b>\nトレンド分析・テーマ決定中...' },
  { re: /【企画部[・\s]*ケンタ|ケンタ.*KW|KWリサーチ|キーワードリサーチ/, msg: '📊 <b>ケンタ（データ分析）</b>\nキーワードリサーチ中...' },
  { re: /【リサーチ部[・\s]*ハルカ|ハルカ.*調査|Web調査/, msg: '🔍 <b>ハルカ（調査官）</b>\nWeb調査・情報収集中...' },
  { re: /【リサーチ部[・\s]*タクミ|タクミ.*競合|競合.*分析/, msg: '🎯 <b>タクミ（競合分析）</b>\n競合記事分析中...' },
  { re: /【リサーチ部[・\s]*リン|リン.*法規制|法規制事前/, msg: '⚖️ <b>リン（ファクトチェック）</b>\n法規制リスク確認中...' },
  { re: /【執筆部|アオイ.*(?:執筆|note記事)/, msg: '✍️ <b>アオイ（メインライター）</b>\nnote記事執筆中...' },
  { re: /ソラ.*(?:X投稿|スレッド|Instagram)/, msg: '📱 <b>ソラ（SNSライター）</b>\nX・Instagram作成中...' },
  { re: /レイ.*(?:TikTok|動画台本|テロップ)/, msg: '🎬 <b>レイ（動画台本）</b>\nTikTok台本作成中...' },
  { re: /【校正部[・\s]*マコト|マコト.*SEO|SEOスコア/, msg: '🔎 <b>マコト（SEO校正）</b>\nSEOスコア採点中...' },
  { re: /【校正部[・\s]*サクラ|サクラ.*法務/, msg: '📋 <b>サクラ（法務チェック）</b>\n法規制最終確認中...' },
  { re: /【校正部[・\s]*ヒロ|ヒロ.*品質/, msg: '✅ <b>ヒロ（品質管理）</b>\n文章品質チェック中...' },
  { re: /【校正部[・\s]*ナツキ|ナツキ.*判定|最終判定/, msg: '🎯 <b>ナツキ（最終判定）</b>\nGO/NG判定中...' },
  { re: /【配信部[・\s]*カイ|カイ.*(?:投稿|配信)|投稿実行/, msg: '📤 <b>カイ（配信マネージャー）</b>\n投稿実行中...' },
  { re: /ユイ.*スケジュール|配信.*スケジュール|公開推奨/, msg: '📅 <b>ユイ（カレンダー管理）</b>\n投稿スケジュール設定中...' },
  { re: /PIPELINE COMPLETE|Final.*GO/, msg: '🏁 <b>パイプライン完了！</b>\n全担当者が完走しました ✅' },
  { re: /Final.*NG|REJECT/, msg: '⛔ <b>NG判定</b>\n差し戻し処理中...' },
];

function startPipelineWatch(onProgress, genre = '') {
  const logFile = path.join(LOG_DIR, 'pipeline.log');
  let lastPos = 0;
  try { lastPos = fs.statSync(logFile).size; } catch(e) {}
  const notified = new Set();

  const interval = setInterval(() => {
    try {
      const stat = fs.statSync(logFile);
      if (stat.size <= lastPos) return;

      // 新しく追記されたテキストだけ読む
      const fd = fs.openSync(logFile, 'r');
      const buf = Buffer.alloc(stat.size - lastPos);
      fs.readSync(fd, buf, 0, buf.length, lastPos);
      fs.closeSync(fd);
      const newText = buf.toString('utf8');
      lastPos = stat.size;

      for (const step of LOG_STEPS) {
        const key = step.msg.slice(0, 12);
        if (!notified.has(key) && step.re.test(newText)) {
          notified.add(key);
          onProgress(step.msg);

          // キャラ名を抽出してダッシュボードへ通知
          const charMatch = step.msg.match(/[^\uFF00-\uFFEF\u3000-\u303F\u4E00-\u9FFF]+([ァ-ヶ]{2,6})/);
          const charName  = charMatch ? charMatch[1] : '';
          pushDashboardState({
            char: charName,
            dept: CHAR_DEPT[charName] || '',
            msg:  step.msg.replace(/<[^>]+>/g, '').replace(/\.\.\./,'').trim(),
            genre,
          });
        }
      }
    } catch(e) {}
  }, 1500); // 1.5秒ごとにチェック

  return () => clearInterval(interval); // 呼ぶと監視停止
}

function postNoteArticle(mdFile) {
  return new Promise((resolve) => {
    const scriptsDir = path.join(VIRTUAL_OFFICE, 'scripts');
    const cmd = `cd "${scriptsDir}" && node post-to-note.js "${mdFile}"`;
    log('note投稿実行: ' + cmd);
    exec(cmd, { timeout: 600000, env: EXEC_ENV }, (error, stdout, stderr) => {
      if (error) { log('note投稿エラー: ' + error.message + '\n' + stderr); resolve({ ok: false, msg: error.message }); return; }
      log('note投稿完了: ' + stdout.slice(-300));
      resolve({ ok: true, msg: stdout });
    });
  });
}

function postXThread(mdFile, noteUrl = null) {
  return new Promise((resolve) => {
    // Xプロファイル確認
    const xProfileDir = path.join(os.homedir(), '.x-playwright-profile');
    if (!fs.existsSync(xProfileDir)) {
      resolve({ ok: false, skip: true, msg: 'Xログインプロファイル未設定' });
      return;
    }
    const scriptsDir = path.join(VIRTUAL_OFFICE, 'scripts');
    const noteArg = noteUrl ? ` "${noteUrl}"` : '';
    const cmd = `cd "${scriptsDir}" && node post-to-x.js "${mdFile}"${noteArg}`;
    log('X投稿実行: ' + cmd);
    exec(cmd, { timeout: 300000, env: EXEC_ENV }, (error, stdout, stderr) => {
      if (error) { log('X投稿エラー: ' + error.message + '\n' + stderr); resolve({ ok: false, msg: error.message + '\n' + stderr }); return; }
      log('X投稿完了: ' + stdout.slice(-300));
      resolve({ ok: true, msg: stdout });
    });
  });
}

function gitCommitAndPush() {
  return new Promise((resolve) => {
    const cmd = `cd ${VIRTUAL_OFFICE} && git add output/ && git diff --cached --quiet && echo "NO_CHANGES" || (git commit -m "auto: 記事生成 $(date +%Y-%m-%d)" && git push origin main)`;
    exec(cmd, { timeout: 60000 }, (error, stdout) => {
      if (error) { log('git pushエラー（無視）: ' + error.message); resolve('failed'); return; }
      resolve(stdout.includes('NO_CHANGES') ? 'no_changes' : 'pushed');
    });
  });
}

async function produceArticle(genre) {
  const startTime = Date.now();
  const genreLabel = genre === 'G1' ? 'チャトレ・メルレ' : genre === 'G2' ? 'Amazonアソシエイト' : genre === 'G3' ? 'Amazon仲介売上' : genre;
  await notifyOwner(
    '🚀 <b>記事生成開始</b>\n' +
    'ジャンル: ' + genreLabel + ' (' + genre + ')\n' +
    '時刻: ' + new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + '\n\n' +
    '━━ パイプライン稼働中 ━━\n' +
    '企画 → リサーチ → 執筆 → 校正 → 配信\n' +
    '各担当者の進捗をリアルタイム通知します'
  );
  // ダッシュボードに開始通知
  pushDashboardState({ char: '', dept: '企画部', msg: `${genreLabel} 記事生成開始`, genre, stage: 0 });

  // pipeline.log監視を先に開始してから実行
  const stopWatch = startPipelineWatch(async (progressMsg) => {
    await notifyOwner('⚙️ ' + progressMsg);
    log('進捗: ' + progressMsg.replace(/<[^>]+>/g, '').slice(0, 50));
  }, genre);

  try {
    const result = await runClaudeCode('produce article ' + genre);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const summary = result.length > 3000 ? result.substring(0, 3000) + '\n...(省略)' : result;
    await notifyOwner('✅ <b>記事生成完了</b>\nジャンル: ' + genreLabel + '\n所要時間: ' + elapsed + '秒\n━━━━━━━━━━━━━━━\n' + summary);
    log('記事生成成功: ' + genre + ' (' + elapsed + '秒)');

    // 生成されたnote記事ファイルを特定
    const { execSync } = require('child_process');
    let noteFile = '';
    try {
      noteFile = execSync(`ls -t ${VIRTUAL_OFFICE}/output/drafts/*/*.md 2>/dev/null | grep note | head -1`).toString().trim();
    } catch(e) {}

    if (noteFile) {
      // カバー画像生成（note投稿前）
      const articleId = path.basename(noteFile).replace('-note.md', '');
      const coverPath = path.join(VIRTUAL_OFFICE, 'assets', 'covers', articleId + '-cover.png');
      if (!fs.existsSync(coverPath)) {
        await notifyOwner('🎨 <b>カバー画像生成中...</b>');
        await new Promise((resolve) => {
          const cmd = `cd "${VIRTUAL_OFFICE}" && node scripts/generate-cover-image.js "${noteFile}"`;
          exec(cmd, { timeout: 60000, env: EXEC_ENV }, (err, stdout) => {
            log('カバー画像: ' + (err ? 'エラー: ' + err.message : stdout.slice(0, 100)));
            resolve();
          });
        });
      }

      await notifyOwner('📤 <b>note投稿中...</b>\nファイル: ' + path.basename(noteFile));
      const postResult = await postNoteArticle(noteFile);
      let noteUrl = null;
      if (postResult.ok) {
        const urlMatch = postResult.msg.match(/https:\/\/note\.com\/[^\s]+/);
        noteUrl = urlMatch ? urlMatch[0] : null;
        await notifyOwner('🎉 <b>note投稿完了！</b>\n' + (noteUrl || '（URL不明）'));

        // カバー画像をnoteに適用
        if (noteUrl && fs.existsSync(coverPath)) {
          const noteId = noteUrl.split('/').pop();
          await notifyOwner('🖼 <b>カバー画像適用中...</b>');
          await new Promise((resolve) => {
            const cmd = `cd "${VIRTUAL_OFFICE}" && node scripts/add-note-cover.js "${noteId}" "${coverPath}"`;
            exec(cmd, { timeout: 120000, env: EXEC_ENV }, (err, stdout) => {
              if (err) {
                log('カバー適用エラー: ' + err.message);
                notifyOwner('⚠️ カバー画像適用失敗（記事自体は公開済み）').catch(() => {});
              } else {
                log('カバー適用完了: ' + noteId);
                notifyOwner('🖼 <b>カバー画像セット完了！</b>').catch(() => {});
              }
              resolve();
            });
          });
        }
      } else {
        await notifyOwner('⚠️ <b>note投稿失敗</b>\n' + postResult.msg.slice(0, 500) + '\n\n手動:\n<code>node scripts/post-to-note.js ' + path.basename(noteFile) + '</code>');
      }

      // X スレッド投稿（note成功時のみ。noteURLをスレッド末尾リプライに付ける）
      if (postResult.ok) {
        const xFile = noteFile.replace('-note.md', '-x.md');
        if (fs.existsSync(xFile)) {
          await notifyOwner('⏳ <b>30秒後にX投稿開始</b>（noteキャッシュ待ち）');
          await new Promise(r => setTimeout(r, 30000));
          await notifyOwner('🐦 <b>X投稿中...</b>');
          const xResult = await postXThread(xFile, noteUrl);
          if (xResult.skip) {
            await notifyOwner('ℹ️ <b>X投稿スキップ</b>\nXログインプロファイル未設定\n<code>node scripts/setup-x-profile.js</code>');
          } else if (xResult.ok) {
            const xUrlMatch = xResult.msg.match(/https:\/\/x\.com\/[^\s]+/);
            await notifyOwner('🐦 <b>X投稿完了！</b>\n' + (xUrlMatch ? xUrlMatch[0] : '投稿されました'));
          } else {
            await notifyOwner('⚠️ <b>X投稿失敗</b>\n' + xResult.msg.slice(0, 300) + '\n\n手動:\n<code>node scripts/post-to-x.js ' + path.basename(xFile) + (noteUrl ? ' ' + noteUrl : '') + '</code>');
          }
        }
      }
    } else {
      await notifyOwner('⚠️ <b>note記事ファイルが見つかりません</b>');
    }

    // git push（バックアップ用）
    gitCommitAndPush().then(r => log('git push: ' + r));

    return { success: true, elapsed, result };
  } catch (error) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    await notifyOwner('❌ <b>記事生成失敗</b>\nジャンル: ' + genreLabel + '\n所要時間: ' + elapsed + '秒\nエラー: ' + error.message);
    log('記事生成失敗: ' + genre + ' - ' + error.message);
    return { success: false, elapsed, error: error.message };
  } finally {
    stopWatch();        // pipeline.log監視を停止
    clearDashboardState(); // ダッシュボードの状態をクリア
  }
}

const STAFF_TEXT = `🏢 <b>バーチャルオフィス スタッフ一覧</b>

<b>【企画部】</b>
👩 ミサキ（企画長）トレンド分析・テーマ決定・KW選定
📊 ケンタ（データ分析）KWリサーチ・記事構成提案
📅 ユイ（カレンダー管理）投稿スケジュール管理

<b>【リサーチ部】</b>
🔍 ハルカ（調査官）Web調査・一次情報収集
🎯 タクミ（競合分析）競合記事分析・差別化戦略
⚖️ リン（ファクトチェック）法規制リスク事前確認

<b>【執筆部】</b>
✍️ アオイ（メインライター）note長文記事執筆
📱 ソラ（SNSライター）X・Instagramコンテンツ
🎬 レイ（動画台本）TikTok台本・テロップ原稿

<b>【校正部】</b>
🔎 マコト（SEO校正）SEOスコア採点（基準:80点）
📋 サクラ（法務チェック）景品表示法・特商法確認
✅ ヒロ（品質管理）文章品質チェック（基準:75点）
🎯 ナツキ（最終判定）GO/NG/REVISE判定

<b>【配信部】</b>
📤 カイ（配信マネージャー）各プラットフォーム投稿
📈 ミク（分析官）投稿後パフォーマンス追跡

記事生成中は各担当者の進捗をリアルタイム通知します`;

const HELP_TEXT = `🏢 <b>バーチャルオフィス Bot</b>

【日本語でOK】
・記事作って / G1記事作って / チャトレ記事
・Amazon記事作って / G2記事作って
・3記事まとめて / G1を5記事
・Xに投稿して / ツイートして
・noteとX両方投稿して / セットで投稿
・状況は？ / どうなってる？
・スタッフ一覧 / 担当者
・スケジュール教えて
・ログ見せて
・止めて / 停止して

【スラッシュコマンドも使えます】
/g1 - チャトレ記事生成＋note+X自動投稿
/g2 - Amazon記事生成＋note+X自動投稿
/postx - 未投稿のX記事を自動検出して投稿
/postnote - 未投稿のnote記事を投稿＋X連動
/status - 稼働状況
/staff - スタッフ一覧
/schedule - スケジュール確認
/logs - ログ表示
/stop - Bot停止`;

function getStatus() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const jstHour = parseInt(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }));
  let nextRun = '8:00';
  if (jstHour >= 8 && jstHour < 12) nextRun = '12:00';
  else if (jstHour >= 12 && jstHour < 20) nextRun = '20:00';
  return '📊 <b>稼働状況</b>\n\n状態: 🟢 稼働中\n稼働時間: ' + hours + '時間' + mins + '分\n次の自動実行: ' + nextRun + ' (JST)\nメモリ: ' + Math.round(process.memoryUsage().heapUsed/1024/1024) + 'MB';
}

function getSchedule() {
  const schedules = config.scheduler.schedules.map(s => '⏰ ' + s.label + ' → ' + s.genre).join('\n');
  return '📅 <b>自動実行スケジュール</b>\n\n' + schedules + '\n\nタイムゾーン: Asia/Tokyo';
}

function getLogs() {
  const logFile = path.join(LOG_DIR, 'bot.log');
  if (fs.existsSync(logFile)) {
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-20).join('\n');
    return '📝 <b>最近のログ</b>\n\n<pre>' + lines + '</pre>';
  }
  return 'ログファイルがまだありません。';
}

// スラッシュコマンド
bot.onText(/\/start/, (msg) => {
  if (!isOwner(msg.chat.id)) return;
  bot.sendMessage(msg.chat.id, HELP_TEXT, { parse_mode: 'HTML' });
});

bot.onText(/\/staff/, (msg) => {
  if (!isOwner(msg.chat.id)) return;
  bot.sendMessage(msg.chat.id, STAFF_TEXT, { parse_mode: 'HTML' });
});

bot.onText(/\/g1/i, async (msg) => {
  if (!isOwner(msg.chat.id)) return;
  await produceArticle('G1');
});

bot.onText(/\/g2/i, async (msg) => {
  if (!isOwner(msg.chat.id)) return;
  await produceArticle('G2');
});

bot.onText(/\/produce\s+(G[123])/i, async (msg, match) => {
  if (!isOwner(msg.chat.id)) return;
  await produceArticle(match[1].toUpperCase());
});

bot.onText(/\/status/, (msg) => {
  if (!isOwner(msg.chat.id)) return;
  bot.sendMessage(msg.chat.id, getStatus(), { parse_mode: 'HTML' });
});

bot.onText(/\/schedule/, (msg) => {
  if (!isOwner(msg.chat.id)) return;
  bot.sendMessage(msg.chat.id, getSchedule(), { parse_mode: 'HTML' });
});

bot.onText(/\/logs/, (msg) => {
  if (!isOwner(msg.chat.id)) return;
  try { bot.sendMessage(msg.chat.id, getLogs(), { parse_mode: 'HTML' }); }
  catch(e) { bot.sendMessage(msg.chat.id, 'ログ読み込みエラー: ' + e.message); }
});

bot.onText(/\/run\s+(.+)/, async (msg, match) => {
  if (!isOwner(msg.chat.id)) return;
  await bot.sendMessage(msg.chat.id, '⏳ 実行中: ' + match[1]);
  try {
    const result = await runClaudeCode(match[1]);
    const summary = result.length > 3000 ? result.substring(0, 3000) + '\n...(省略)' : result;
    await bot.sendMessage(msg.chat.id, '✅ <b>完了</b>\n\n<pre>' + summary + '</pre>', { parse_mode: 'HTML' });
  } catch(e) { await bot.sendMessage(msg.chat.id, '❌ <b>エラー</b>\n\n' + e.message, { parse_mode: 'HTML' }); }
});

// ── 未投稿のX記事を自動検出（ファイル内容で POSTED チェック） ──
function findUnpostedXFile() {
  const draftsDir = path.join(VIRTUAL_OFFICE, 'output', 'drafts');
  if (!fs.existsSync(draftsDir)) return null;
  const files = [];
  for (const dir of fs.readdirSync(draftsDir)) {
    const d = path.join(draftsDir, dir);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('-x.md')) files.push({ path: path.join(d, f), mtime: fs.statSync(path.join(d, f)).mtimeMs });
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  for (const f of files) {
    try {
      const content = fs.readFileSync(f.path, 'utf8');
      if (!content.includes('<!-- POSTED -->')) return f.path;
    } catch(e) {}
  }
  return null;
}

// ── 対応する note.md の投稿済みURLを取得 ──
function extractNoteUrlFromNoteMd(xFilePath) {
  const noteFile = xFilePath.replace('-x.md', '-note.md');
  if (!fs.existsSync(noteFile)) return null;
  try {
    const content = fs.readFileSync(noteFile, 'utf8');
    const m = content.match(/https:\/\/note\.com\/[^\s\n]+/);
    return m ? m[0] : null;
  } catch(e) { return null; }
}

// ── X投稿結果メッセージ共通処理 ──
async function sendXResult(chatId, result, xFile) {
  if (result.skip) {
    await bot.sendMessage(chatId, '⚠️ Xログインプロファイル未設定\n<code>node scripts/setup-x-profile.js</code> を実行してください', { parse_mode: 'HTML' });
  } else if (result.ok) {
    const urlMatch = result.msg.match(/https:\/\/x\.com\/[^\s]+/);
    await bot.sendMessage(chatId, '🐦 <b>X投稿完了！</b>\n' + (urlMatch ? urlMatch[0] : '投稿されました'), { parse_mode: 'HTML' });
  } else {
    await bot.sendMessage(chatId, '❌ X投稿失敗: ' + result.msg.slice(0, 300) + '\n\n手動:\n<code>node scripts/post-to-x.js ' + path.basename(xFile) + '</code>', { parse_mode: 'HTML' });
  }
}

bot.onText(/\/postx(?:\s+(.+))?/, async (msg, match) => {
  if (!isOwner(msg.chat.id)) return;
  const mdPath = match[1] ? match[1].trim() : null;

  // ファイル指定なし → 未投稿のX記事を自動検出
  const xFile = mdPath || findUnpostedXFile();
  if (!xFile) {
    await bot.sendMessage(msg.chat.id, '⚠️ 投稿待ちのX記事が見つかりません\n使い方: /postx <ファイルパス>');
    return;
  }
  // ファイル内容で投稿済みチェック
  try {
    if (fs.readFileSync(xFile, 'utf8').includes('<!-- POSTED -->')) {
      await bot.sendMessage(msg.chat.id, 'ℹ️ このファイルは投稿済みです: ' + path.basename(xFile));
      return;
    }
  } catch(e) {}

  // 対応するnote.mdからnoteURLを取得
  const noteUrl = extractNoteUrlFromNoteMd(xFile);
  await bot.sendMessage(msg.chat.id, '📤 X投稿中: ' + path.basename(xFile) + (noteUrl ? '\nnote: ' + noteUrl : ''));
  const result = await postXThread(xFile, noteUrl);
  await sendXResult(msg.chat.id, result, xFile);
});

// /postnote: 既存のdraftをnote+X両方投稿
bot.onText(/\/postnote(?:\s+(.+))?/, async (msg, match) => {
  if (!isOwner(msg.chat.id)) return;
  const mdPath = match[1] ? match[1].trim() : null;

  // ファイル指定なし → 未投稿のnote記事を自動検出
  let noteFile = mdPath;
  if (!noteFile) {
    const draftsDir = path.join(VIRTUAL_OFFICE, 'output', 'drafts');
    const files = [];
    if (fs.existsSync(draftsDir)) {
      for (const dir of fs.readdirSync(draftsDir)) {
        const d = path.join(draftsDir, dir);
        if (!fs.statSync(d).isDirectory()) continue;
        for (const f of fs.readdirSync(d)) {
          if (f.endsWith('-note.md')) files.push({ path: path.join(d, f), mtime: fs.statSync(path.join(d, f)).mtimeMs });
        }
      }
    }
    files.sort((a, b) => b.mtime - a.mtime);
    for (const f of files) {
      try {
        if (!fs.readFileSync(f.path, 'utf8').includes('<!-- POSTED -->')) { noteFile = f.path; break; }
      } catch(e) {}
    }
  }
  if (!noteFile) {
    await bot.sendMessage(msg.chat.id, '⚠️ 投稿待ちのnote記事が見つかりません');
    return;
  }

  await bot.sendMessage(msg.chat.id, '📝 note+X 投稿開始: ' + path.basename(noteFile));

  // note投稿
  const noteResult = await postNoteArticle(noteFile);
  if (!noteResult.ok) {
    await bot.sendMessage(msg.chat.id, '❌ note投稿失敗: ' + noteResult.msg.slice(0, 300), { parse_mode: 'HTML' });
    return;
  }
  const urlMatch = noteResult.msg.match(/https:\/\/note\.com\/[^\s]+/);
  const noteUrl = urlMatch ? urlMatch[0] : null;
  await bot.sendMessage(msg.chat.id, '✅ note投稿完了！\n' + (noteUrl || '（URL取得失敗）'));

  // X投稿
  const xFile = noteFile.replace('-note.md', '-x.md');
  if (!fs.existsSync(xFile)) {
    await bot.sendMessage(msg.chat.id, 'ℹ️ X用ファイルが見つかりません。note投稿のみ完了しました。');
    return;
  }
  await bot.sendMessage(msg.chat.id, '⏳ 30秒待ってからX投稿します...');
  await new Promise(r => setTimeout(r, 30000));
  await bot.sendMessage(msg.chat.id, '🐦 X投稿中...');
  const xResult = await postXThread(xFile, noteUrl);
  await sendXResult(msg.chat.id, xResult, xFile);
});

bot.onText(/\/stop/, (msg) => {
  if (!isOwner(msg.chat.id)) return;
  bot.sendMessage(msg.chat.id, '👋 Botを停止します...');
  setTimeout(() => process.exit(0), 1000);
});

// 日本語自然言語ハンドラ
bot.on('message', async (msg) => {
  if (!isOwner(msg.chat.id)) return;
  if (!msg.text || msg.text.startsWith('/')) return;
  const t = msg.text;

  // 停止
  if (/止めて|停止|止まって|シャットダウン/.test(t)) {
    await bot.sendMessage(msg.chat.id, '👋 Botを停止します...');
    setTimeout(() => process.exit(0), 1000);
    return;
  }

  // 状況確認
  if (/状況|どうなって|稼働|ステータス|調子/.test(t)) {
    await bot.sendMessage(msg.chat.id, getStatus(), { parse_mode: 'HTML' });
    return;
  }

  // スケジュール
  if (/スケジュール|予定|いつ|時間/.test(t)) {
    await bot.sendMessage(msg.chat.id, getSchedule(), { parse_mode: 'HTML' });
    return;
  }

  // ログ
  if (/ログ|log|履歴|記録/.test(t)) {
    try { await bot.sendMessage(msg.chat.id, getLogs(), { parse_mode: 'HTML' }); }
    catch(e) { await bot.sendMessage(msg.chat.id, 'ログ読み込みエラー: ' + e.message); }
    return;
  }

  // スタッフ・担当者確認
  if (/スタッフ|担当者|メンバー|誰が|キャラ|部署|チーム/.test(t)) {
    await bot.sendMessage(msg.chat.id, STAFF_TEXT, { parse_mode: 'HTML' });
    return;
  }

  // まとめて複数記事（例：「G1を3記事」「5記事まとめて」）
  const batchMatch = t.match(/(G[123])[をの]?(\d+)記事|(\d+)記事.*(G[123])/i);
  if (batchMatch) {
    const genre = (batchMatch[1] || batchMatch[4]).toUpperCase();
    const count = parseInt(batchMatch[2] || batchMatch[3]);
    await bot.sendMessage(msg.chat.id, `📦 ${genre}の記事を${count}本まとめて生成します...`);
    try {
      const result = await runClaudeCode(`produce batch ${genre} ${count}`);
      const summary = result.length > 3000 ? result.substring(0, 3000) + '\n...(省略)' : result;
      await bot.sendMessage(msg.chat.id, `✅ <b>${count}記事生成完了</b>\n\n${summary}`, { parse_mode: 'HTML' });
    } catch(e) {
      await bot.sendMessage(msg.chat.id, '❌ エラー: ' + e.message, { parse_mode: 'HTML' });
    }
    return;
  }

  // X投稿
  if (/X|ツイート|ツイッター|スレッド/.test(t) && /投稿|ポスト|上げて|載せて/.test(t)) {
    const xFile = findUnpostedXFile();
    if (!xFile) {
      await bot.sendMessage(msg.chat.id, '⚠️ 投稿待ちのX記事が見つかりません');
      return;
    }
    const noteUrl = extractNoteUrlFromNoteMd(xFile);
    await bot.sendMessage(msg.chat.id, '📤 X投稿中: ' + path.basename(xFile) + (noteUrl ? '\nnoteURL付き' : ''));
    const result = await postXThread(xFile, noteUrl);
    await sendXResult(msg.chat.id, result, xFile);
    return;
  }

  // note+X 同時投稿
  if (/note.*X|X.*note|両方|同時|セット/.test(t) && /投稿|ポスト|上げて/.test(t)) {
    const draftsDir = path.join(VIRTUAL_OFFICE, 'output', 'drafts');
    let noteFile = null;
    if (fs.existsSync(draftsDir)) {
      const files = [];
      for (const dir of fs.readdirSync(draftsDir)) {
        const d = path.join(draftsDir, dir);
        if (!fs.statSync(d).isDirectory()) continue;
        for (const f of fs.readdirSync(d)) {
          if (f.endsWith('-note.md')) files.push({ path: path.join(d, f), mtime: fs.statSync(path.join(d, f)).mtimeMs });
        }
      }
      files.sort((a, b) => b.mtime - a.mtime);
      for (const f of files) {
        try { if (!fs.readFileSync(f.path, 'utf8').includes('<!-- POSTED -->')) { noteFile = f.path; break; } } catch(e) {}
      }
    }
    if (!noteFile) { await bot.sendMessage(msg.chat.id, '⚠️ 投稿待ちのnote記事が見つかりません'); return; }
    await bot.sendMessage(msg.chat.id, '📝 note+X 投稿開始: ' + path.basename(noteFile));
    const noteResult = await postNoteArticle(noteFile);
    if (!noteResult.ok) { await bot.sendMessage(msg.chat.id, '❌ note投稿失敗'); return; }
    const urlM = noteResult.msg.match(/https:\/\/note\.com\/[^\s]+/);
    const noteUrl2 = urlM ? urlM[0] : null;
    await bot.sendMessage(msg.chat.id, '✅ note完了: ' + (noteUrl2 || '（URL取得失敗）'));
    const xFile2 = noteFile.replace('-note.md', '-x.md');
    if (fs.existsSync(xFile2)) {
      await new Promise(r => setTimeout(r, 30000));
      const xResult = await postXThread(xFile2, noteUrl2);
      await sendXResult(msg.chat.id, xResult, xFile2);
    }
    return;
  }

  // G1記事生成（チャトレ・副業系）
  if (/G1|チャトレ|チャットレディ|メルレ|メールレディ|副業/.test(t) && /記事|作って|書いて|生成|作成/.test(t)) {
    await produceArticle('G1');
    return;
  }

  // G2記事生成（Amazon系）
  if (/G2|Amazon|アマゾン|アフィリ|商品|レビュー/.test(t) && /記事|作って|書いて|生成|作成/.test(t)) {
    await produceArticle('G2');
    return;
  }

  // ジャンル指定なしで「記事作って」→ G1とG2を選ばせる
  if (/記事|作って|書いて|生成|作成/.test(t)) {
    await bot.sendMessage(msg.chat.id,
      'どちらの記事を作りますか？\n\n🔴 「G1記事作って」→ チャトレ・メルレ\n🔵 「G2記事作って」→ Amazon商品',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // ヘルプ
  if (/ヘルプ|help|使い方|コマンド|何できる/.test(t)) {
    await bot.sendMessage(msg.chat.id, HELP_TEXT, { parse_mode: 'HTML' });
    return;
  }
});

config.scheduler.schedules.forEach(schedule => {
  cron.schedule(schedule.time, async () => {
    log('スケジュール実行: ' + schedule.label + ' - ' + schedule.genre);
    await produceArticle(schedule.genre);
  }, { timezone: config.scheduler.timezone });
  log('スケジュール登録: ' + schedule.label + ' (' + schedule.time + ') → ' + schedule.genre);
});

log('Bot起動中...');
notifyOwner('🟢 <b>バーチャルオフィス Bot 起動完了</b>\n\n時刻: ' + new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + '\nスケジュール: 8:00 / 12:00 / 20:00\n\n/start でコマンド一覧を表示');
process.on('uncaughtException', async (err) => { log('未処理エラー: ' + err.message); await notifyOwner('⚠️ <b>エラー発生</b>\n' + err.message); });
process.on('SIGINT',  async () => { await notifyOwner('🔴 Bot停止しました'); process.exit(0); });
process.on('SIGTERM', async () => { await notifyOwner('🔴 Bot停止しました(SIGTERM)'); process.exit(0); });
log('Bot起動完了！コマンド待機中...');
