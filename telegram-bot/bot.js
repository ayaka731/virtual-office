#!/usr/bin/env node
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const BOT_TOKEN = config.telegram.botToken;
const OWNER_ID = config.telegram.ownerId;
const VIRTUAL_OFFICE = config.paths.virtualOffice.replace('~', os.homedir());
const LOG_DIR = config.paths.logs.replace('~', os.homedir());

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(LOG_DIR, 'bot.log'), line + '\n'); } catch(e) {}
}

function isOwner(chatId) { return chatId === OWNER_ID; }

async function notifyOwner(text) {
  try { await bot.sendMessage(OWNER_ID, text, { parse_mode: 'HTML' }); } catch(e) { log('通知失敗: ' + e.message); }
}

function runClaudeCode(command, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const fullCommand = `cd ${VIRTUAL_OFFICE} && claude --dangerously-skip-permissions -p "${command}"`;
    log('実行: ' + fullCommand);
    exec(fullCommand, { timeout, maxBuffer: 1024*1024*10 }, (error, stdout, stderr) => {
      if (error) { reject(new Error(error.killed ? 'タイムアウト（5分超過）' : 'エラー: ' + error.message + '\n' + stderr)); return; }
      resolve(stdout.trim());
    });
  });
}

function postNoteArticle(mdFile) {
  return new Promise((resolve) => {
    const scriptPath = path.join(VIRTUAL_OFFICE, 'scripts', 'post-to-note.js');
    const cmd = `cd ${path.join(VIRTUAL_OFFICE, 'scripts')} && node post-to-note.js "${mdFile}"`;
    log('note投稿実行: ' + cmd);
    exec(cmd, { timeout: 300000, env: { ...process.env } }, (error, stdout, stderr) => {
      if (error) { log('note投稿エラー: ' + error.message); resolve({ ok: false, msg: error.message }); return; }
      log('note投稿完了: ' + stdout.slice(-200));
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
  await notifyOwner('🚀 <b>記事生成開始</b>\nジャンル: ' + genreLabel + ' (' + genre + ')\n時刻: ' + new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
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
      await notifyOwner('📤 <b>note投稿中...</b>\nファイル: ' + path.basename(noteFile));
      const postResult = await postNoteArticle(noteFile);
      if (postResult.ok) {
        // URLをログから抽出
        const urlMatch = postResult.msg.match(/https:\/\/note\.com\/[^\s]+/);
        const noteUrl = urlMatch ? urlMatch[0] : '（URL不明）';
        await notifyOwner('🎉 <b>note投稿完了！</b>\n' + noteUrl);
      } else {
        await notifyOwner('⚠️ <b>note投稿失敗</b>\n' + postResult.msg.slice(0, 500) + '\n\nnote投稿は手動で実行してください:\n<code>cd ~/virtual-office/scripts && node post-to-note.js ' + noteFile + '</code>');
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
  }
}

const HELP_TEXT = `🏢 <b>バーチャルオフィス Bot</b>

【日本語でOK】
・記事作って / G1記事作って / チャトレ記事
・Amazon記事作って / G2記事作って
・3記事まとめて / G1を5記事
・状況は？ / どうなってる？
・スケジュール教えて
・ログ見せて
・止めて / 停止して

【スラッシュコマンドも使えます】
/g1 - チャトレ記事生成
/g2 - Amazon記事生成
/status - 稼働状況
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
process.on('SIGINT', async () => { await notifyOwner('🔴 Bot停止しました'); process.exit(0); });
log('Bot起動完了！コマンド待機中...');
