# Virtual Office - ブログ執筆自動化システム

AIキャラクターが企画→リサーチ→執筆→校正→SNS展開を自動実行するシステム。

## 構成

```
virtual-office/
├── CLAUDE.md                    # Claude Codeの指示書・自走ルール
├── config/
│   ├── genres.json              # G1/G2/G3ジャンル定義
│   ├── platforms.json           # SNSアカウント情報
│   └── affiliate-links.json     # アフィリンク（gitignore対象）
├── skills/                      # Claude Codeスキル15ファイル
│   ├── planning/                # 企画部（ミサキ・ケンタ・ユイ）
│   ├── research/                # リサーチ部（ハルカ・タクミ・リン）
│   ├── writing/                 # 執筆部（アオイ・ソラ・レイ）
│   ├── review/                  # 校正部（マコト・サクラ・ヒロ・ナツキ）
│   └── distribution/            # 配信部（カイ・ミク）
├── templates/
│   └── note-template.md
├── scripts/
│   └── post-to-note.js          # Playwright note自動投稿
├── dashboard/                   # DQ風リアルタイムダッシュボード
├── telegram-bot/                # Telegram Bot（gitignore対象）
├── output/
│   ├── drafts/                  # 生成済み記事（gitignore対象）
│   └── published/               # 投稿済み記事
└── .github/workflows/
    └── publish-note.yml         # GitHub Actions
```

## Claude Codeコマンド

```bash
cd ~/virtual-office && claude
```

| コマンド | 動作 |
|---|---|
| `produce article G1` | G1記事を1セット生成（4プラットフォーム分） |
| `produce article G2` | G2記事を1セット生成 |
| `produce batch G1 5` | G1記事を5本一括生成 |
| `status`             | パイプライン状態確認 |

## note自動投稿（GitHub Actions）

### 初回セットアップ

1. **GitHubリポジトリをprivateで作成**
   ```
   https://github.com/new → リポジトリ名: virtual-office → Private
   ```

2. **リモートを追加してpush**
   ```bash
   git remote add origin https://github.com/<YOUR_USERNAME>/virtual-office.git
   git push -u origin main
   ```

3. **GitHub Secretsを登録**
   `Settings → Secrets and variables → Actions → New repository secret`

   | Secret名 | 値 |
   |---|---|
   | `NOTE_EMAIL` | noteのログインメールアドレス |
   | `NOTE_PASSWORD` | noteのパスワード |

### 手動投稿実行

GitHub → Actions → `note自動投稿` → `Run workflow`

- `article_path`: 投稿するファイルパス（例: `output/drafts/2026-04-28/G1-001-note.md`）
- `dry_run`: チェックするとファイル確認のみ（実際には投稿しない）

### 自動投稿（pushトリガー）

`output/drafts/`配下に`*-note.md`ファイルをcommit & pushすると自動実行される。

```bash
git add output/drafts/2026-04-28/G1-001-note.md
git commit -m "add G1-001 note article"
git push
# → GitHub Actionsが自動起動してnoteに下書き保存
```

## ローカル投稿テスト

```bash
cd ~/virtual-office/scripts
npm install
npx playwright install chromium

NOTE_EMAIL=your@email.com NOTE_PASSWORD=yourpassword \
  node post-to-note.js ../output/drafts/2026-04-28/G1-001-note.md
```

## Telegram Bot

```bash
cd ~/virtual-office/telegram-bot
node bot.js
```

コマンド例（Telegramから送信）:
- `G1記事作って` → Claude Codeが記事生成
- `状況は？` → パイプライン状況確認

## ダッシュボード

```bash
cd ~/virtual-office/dashboard
npm run dev
# → http://localhost:5173/
```

Claude Codeが動くと自動でキャラクターが歩きだしてリアルタイム反映。

## SNSアカウント

| プラットフォーム | アカウント | 投稿方法 |
|---|---|---|
| note | yorushoku_500 | Playwright自動（下書き）/ 手動公開 |
| X | tinzhnglil15017 | API（取得後に自動化） |
| Instagram | ruri_yorushoku | 手動 |
| Threads | ruri_yorushoku | 手動 |
| lit.link | honshitoro | プロフィールまとめ |

## X API設定

X（Twitter）への自動投稿にはAPI v2のキーが必要です。

### APIキーの取得手順

1. **Developer Portalにアクセス**
   [https://developer.twitter.com/en/portal/dashboard](https://developer.twitter.com/en/portal/dashboard)

2. **アプリを作成（またはすでにあるアプリを選択）**
   - `+ Add app` → アプリ名を入力 → `Production`環境を選択

3. **アクセス許可の設定**
   - `App settings` → `User authentication settings` → 編集
   - `App permissions`: **Read and write** を選択
   - `Type of App`: `Web App, Automated App or Bot`
   - `Callback URI` と `Website URL` は任意のURLを入力（例: `https://example.com`）
   - 保存

4. **キーとトークンを取得**
   - `Keys and tokens` タブを開く
   - `Consumer Keys` セクション → `API Key and Secret` → **Regenerate**（または確認）
   - `Authentication Tokens` セクション → `Access Token and Secret` → **Generate**
   - **⚠️ 生成直後しか表示されない。必ずメモすること**

5. **`config/platforms.json` を更新**

   ```json
   "x": {
     "api": {
       "apiKey":       "取得したAPI Key",
       "apiSecret":    "取得したAPI Key Secret",
       "accessToken":  "取得したAccess Token",
       "accessSecret": "Access Token Secret"
     }
   }
   ```

### 投稿テスト

```bash
cd ~/virtual-office/scripts
node post-to-x-api.js ../output/drafts/YYYY-MM-DD/G1-001-x.md
```

### 注意事項

- `accessToken` / `accessSecret` は **自分のアカウント**で発行すること（他アカウントへの代理投稿には別途OAuth2が必要）
- 無料プラン（Free Tier）は月1,500ツイートまで書き込み可能
- APIキーは `config/platforms.json` に直書きされているため、このファイルを**絶対にpublicリポジトリへpushしない**こと（.gitignoreで除外推奨）

---

## ジャンル

| ID | ジャンル | 状態 |
|---|---|---|
| G1 | チャトレ・メルレ アフィリエイト | 稼働中（リンク5件登録済み） |
| G2 | Amazonアソシエイト | note投稿後に申請予定 |
| G3 | Amazon仲介売上 | 資料待ち |
