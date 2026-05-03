#!/usr/bin/env node
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

async function test() {
  console.log('🔍 接続テスト開始...\n');
  try {
    const bot = new TelegramBot(config.telegram.botToken);
    const me = await bot.getMe();
    console.log('✅ Bot名: ' + me.first_name + ' (@' + me.username + ')');
    await bot.sendMessage(config.telegram.ownerId, '🧪 テスト通知成功！\nバーチャルオフィスBotは正常です。', { parse_mode: 'HTML' });
    console.log('✅ Telegramにメッセージ送信成功');
  } catch(e) {
    console.log('❌ 失敗: ' + e.message);
    console.log('→ @myoffice_auto_bot に /start を送ってから再試行');
    process.exit(1);
  }
  const { exec } = require('child_process');
  exec('which claude', (err, stdout) => {
    if (err) console.log('⚠️  claude コマンドが見つかりません');
    else console.log('✅ Claude Code: ' + stdout.trim());
    console.log('\n全テスト完了！ npm start でBot起動できます');
    process.exit(0);
  });
}
test();
