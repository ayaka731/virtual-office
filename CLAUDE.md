# ブログ執筆バーチャルオフィス

## プロジェクト概要
AIキャラクターを部署ごとに配置し、ブログ記事の企画→リサーチ→執筆→校正→SNS展開を完全自動で実行するシステム。

## ジャンル
- G1：チャトレ・メルレ アフィリエイト
- G2：Amazonアソシエイト
- G3：Amazon仲介売上（後日追加）

## 投稿先
- note（長文記事）
- X（短文/スレッド）
- Instagram（キャプション＋画像指示）
- TikTok（台本＋テロップ原稿）

---

## 実行コマンド

| コマンド | 動作 |
|---|---|
| `produce article G1` | G1で1記事セット（4プラットフォーム分）生成 |
| `produce article G2` | G2で1記事セット生成 |
| `produce batch G1 5` | G1で5記事を一括生成 |
| `review queue` | 校正待ちキュー確認 |
| `publish ready` | GO判定の記事を全投稿 |
| `status` | パイプライン全体の状態確認 |

---

## パイプライン

```
[企画部] → [リサーチ部] → [執筆部] → [校正部] → [配信部]
```

### 1. 企画部 (skills/planning/)
- **ミサキ**（企画長）: トレンド分析・テーマ決定・KW選定 → `skills/planning/trend-analysis.md`
- **ケンタ**（データ分析）: キーワードリサーチ・記事構成提案 → `skills/planning/keyword-research.md`
- **ユイ**（カレンダー管理）: 投稿スケジュール管理 → `skills/planning/schedule-management.md`

### 2. リサーチ部 (skills/research/)
- **ハルカ**（調査官）: Web調査・一次情報収集 → `skills/research/web-research.md`
- **タクミ**（競合分析）: 競合記事分析・差別化戦略 → `skills/research/competitor-analysis.md`
- **リン**（ファクトチェック）: 法規制リスク事前チェック → `skills/research/legal-check.md`

### 3. 執筆部 (skills/writing/)
- **アオイ**（メインライター）: note記事執筆 → `skills/writing/note-writing.md`
- **ソラ**（SNSライター）: X・Instagram執筆 → `skills/writing/x-writing.md`, `skills/writing/instagram-writing.md`
- **レイ**（動画台本）: TikTok台本執筆 → `skills/writing/tiktok-writing.md`
- **ハナ**（ビジュアルディレクター）: 全記事のカバー画像生成 → `skills/writing/cover-image.md`

### 4. 校正部 (skills/review/)
- **マコト**（SEO校正）: SEOスコア採点・改善指示 → `skills/review/seo-review.md`
- **サクラ**（法務チェック）: 法規制最終確認 → `skills/review/legal-review.md`
- **ヒロ**（品質管理）: 文章品質チェック → `skills/review/quality-review.md`
- **ナツキ**（ファイナルチェック）: 統合判定・GO/NG決定 → `skills/review/final-check.md`

### 5. 配信部 (skills/distribution/)
- **カイ**（配信マネージャー）: 各プラットフォーム投稿実行 → `skills/distribution/publish-manager.md`
- **ミク**（分析官）: 投稿後パフォーマンス追跡 → `skills/distribution/analytics.md`

---

## 品質基準

| 指標 | GO基準 | 備考 |
|---|---|---|
| SEOスコア | 80点以上 | マコトが採点 |
| 法務リスク | low | highは即REJECT |
| 品質スコア | 75点以上 | ヒロが採点 |

- 校正部でREVISEの場合、執筆部に差し戻し（最大3回）
- 3回REVISEでも通らない場合はREJECTしてlogs/pipeline.logに記録

---

## 絶対ルール

1. **法規制違反の可能性がある表現は絶対に使わない**
2. G1は景品表示法・特定商取引法を必ずチェック（リン → サクラの二重チェック）
3. アフィリエイトリンクにはPR表記を必ず入れる
4. 1記事＝4プラットフォーム分をセットで生成する
5. 出力は全て `output/drafts/YYYY-MM-DD/` に保存する

---

## ファイル命名規則

```
output/drafts/YYYY-MM-DD/G1-001-note.md
output/drafts/YYYY-MM-DD/G1-001-x.md
output/drafts/YYYY-MM-DD/G1-001-instagram.md
output/drafts/YYYY-MM-DD/G1-001-tiktok.md
```

---

## 参照ファイル

| ファイル | 内容 |
|---|---|
| `config/genres.json` | ジャンル定義 |
| `config/platforms.json` | プラットフォーム仕様 |
| `config/affiliate-links.json` | アフィリンク管理 |
| `templates/note-template.md` | note記事テンプレート（4段構成・SHElikes式） |
| `templates/x-template.md` | X投稿テンプレート（5パターン・2ポスト構成） |
| `templates/eyecatch-texts.json` | アイキャッチ画像用キャッチコピー20選 |

---

## ディレクトリ構造

```
virtual-office/
├── CLAUDE.md                    # このファイル
├── config/
│   ├── genres.json              # ジャンル定義
│   ├── platforms.json           # プラットフォーム仕様
│   └── affiliate-links.json     # アフィリンク管理
├── skills/
│   ├── planning/
│   │   ├── trend-analysis.md    # ミサキ：トレンド分析
│   │   ├── keyword-research.md  # ケンタ：KWリサーチ
│   │   └── schedule-management.md # ユイ：スケジュール管理
│   ├── research/
│   │   ├── web-research.md      # ハルカ：Web調査
│   │   ├── competitor-analysis.md # タクミ：競合分析
│   │   └── legal-check.md       # リン：法規制事前チェック
│   ├── writing/
│   │   ├── note-writing.md      # アオイ：note執筆
│   │   ├── x-writing.md         # ソラ：X執筆
│   │   ├── instagram-writing.md # ソラ：Instagram執筆
│   │   ├── tiktok-writing.md    # レイ：TikTok台本
│   │   └── cover-image.md       # ハナ：カバー画像生成
│   ├── review/
│   │   ├── seo-review.md        # マコト：SEO校正
│   │   ├── legal-review.md      # サクラ：法務校正
│   │   ├── quality-review.md    # ヒロ：品質校正
│   │   └── final-check.md       # ナツキ：最終判定
│   └── distribution/
│       ├── publish-manager.md   # カイ：投稿管理
│       └── analytics.md         # ミク：分析
├── templates/
│   ├── note-template.md         # note記事テンプレート（4段構成）
│   ├── x-template.md            # X投稿テンプレート（5パターン）
│   └── eyecatch-texts.json      # アイキャッチ用キャッチコピー20選
├── output/
│   ├── drafts/                  # 執筆済み・校正待ち
│   ├── reviewed/                # 校正済み・GO判定済み
│   └── published/               # 投稿済み
└── logs/
    └── pipeline.log             # パイプライン実行ログ
```

---

## コマンド実行フロー

### `produce article G1` の実行フロー
各ステップ開始時に **必ず** `logs/pipeline.log` に以下フォーマットで追記すること（絶対ルール）:

```
【部署名・キャラクター名】
- 実施内容の箇条書き
```

1. ミサキがG1向けテーマを決定（`skills/planning/trend-analysis.md`）→ `【企画部・ミサキ】` をpipeline.logに記録
2. ケンタがKW戦略を立案（`skills/planning/keyword-research.md`）→ `【企画部・ケンタ】` をpipeline.logに記録
3. ハルカがWeb調査（`skills/research/web-research.md`）→ `【リサーチ部・ハルカ】` をpipeline.logに記録
4. タクミが競合分析（`skills/research/competitor-analysis.md`）→ `【リサーチ部・タクミ】` をpipeline.logに記録
5. リンが法規制リスクを事前チェック（`skills/research/legal-check.md`）→ `【リサーチ部・リン】` をpipeline.logに記録
6. アオイがnote記事を執筆（`skills/writing/note-writing.md`）→ `【執筆部・アオイ】` をpipeline.logに記録
7. ソラがX・Instagramコンテンツを作成（`skills/writing/x-writing.md`, `skills/writing/instagram-writing.md`）→ `【執筆部・ソラ】` をpipeline.logに記録
8. レイがTikTok台本を作成（`skills/writing/tiktok-writing.md`）→ `【執筆部・レイ】` をpipeline.logに記録
9. **ハナがカバー画像を生成**（`skills/writing/cover-image.md`）→ `node scripts/generate-cover-image.js output/drafts/YYYY-MM-DD/{ID}-note.md` を実行 → `【執筆部・ハナ】` をpipeline.logに記録
10. マコトがSEO採点（`skills/review/seo-review.md`）→ `【校正部・マコト】` をpipeline.logに記録
11. サクラが法務最終チェック（`skills/review/legal-review.md`）→ `【校正部・サクラ】` をpipeline.logに記録
12. ヒロが品質チェック（`skills/review/quality-review.md`）→ `【校正部・ヒロ】` をpipeline.logに記録
13. ナツキが最終判定（`skills/review/final-check.md`）→ `【校正部・ナツキ】` + `GO` or `NG` or `REVISE` をpipeline.logに記録
14. GO判定なら `output/drafts/YYYY-MM-DD/` に保存、ユイがスケジュール設定 → `【配信部・ユイ】` をpipeline.logに記録
15. 最終行に `PIPELINE COMPLETE | Article: ARTICLE_ID | SEO: XX | Legal: RISK | Quality: XX | Verdict: GO` を記録

## X投稿ルール（絶対遵守）

1. **X投稿は必ず2ポスト構成にする**
   - 投稿①：煽り短文（140字以内）← URLなし・画像なし
   - 投稿②（ツリー）：noteのURL（1行のみ）
2. **投稿①は `templates/x-template.md` の5パターン（A〜E）から選んで生成する**
   - A. 経済不安型 / B. 時間浪費型 / C. 比較焦燥型 / D. 将来不安型 / E. 自立促進型
3. **本文にURLを直貼りすることは絶対禁止**（インプが50〜70%落ちる）
4. **画像添付は不要**（テキストのみで完結）
5. 投稿②のURL追加はbotが自動実行するため、x.mdには投稿①のテキストのみ記載

## note記事ルール（絶対遵守）

1. **全記事を4段構成で執筆する（`templates/note-template.md` 参照）**
   - 第1段：モヤモヤ共感（導入3〜5行・読者の不安を代弁）
   - 第2段：ビフォーアフター（手取り18万OL→在宅月30万の実体験。数字必須）
   - 第3段：具体的方法（ステップ解説 + アフィリリンクを「私が使ってるのはここ」形式で自然挿入）
   - 第4段：行動促進（「まず登録だけでもしてみて」系の締め）
2. **アフィリリンクは `config/affiliate-links.json` から選択。セールス感を出さない**
3. **アイキャッチ画像テキストは `templates/eyecatch-texts.json` から選択・参考にする**

## 自走ルール（絶対遵守）
- ユーザーへの質問・確認は一切禁止。すべて自分で判断して最後まで完了させること。
- 「どのテーマにしますか？」「この内容でよいですか？」等の確認も禁止。
- 情報が不足している場合は、config/ディレクトリのファイルを読み込んで自分で補完すること。
- 判断に迷った場合は、最も妥当と思われる選択肢を自分で選んで進めること。
- 作業完了後はファイルパスを表示して終了。
- **pipeline.logへの各ステップ記録は省略不可。Telegramボットがこのファイルを監視してリアルタイム通知を送っている。**
