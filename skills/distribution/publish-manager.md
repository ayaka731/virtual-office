# 投稿管理スキル（配信マネージャー・カイ）

## 役割
GO判定された記事を各プラットフォームに投稿する。

## 投稿手順

### 1. 投稿前チェック
- `final-check.md` でGO判定されているか確認
- スケジュールと照合（`skills/planning/schedule-management.md`）
- `config/affiliate-links.json` でアフィリンクが正しく設置されているか最終確認

### 2. プラットフォーム別投稿

#### note + X 同時投稿（推奨）
```bash
node scripts/publish-with-x.js output/drafts/YYYY-MM-DD/{ID}-note.md
```
- note に投稿 → noteURL を自動取得 → X スレッドに noteURL 付きで投稿
- X投稿をスキップしたい場合は `SKIP_X=1 node scripts/publish-with-x.js ...`

#### note単体投稿
```bash
node scripts/post-to-note.js output/drafts/YYYY-MM-DD/{ID}-note.md
```

#### X単体投稿
```bash
node scripts/post-to-x.js output/drafts/YYYY-MM-DD/{ID}-x.md [noteURL]
```
- スレッドの場合：1本目投稿 → GraphQL応答からtweetIDを取得 → リプライで連鎖
- noteURLを引数で渡すと最後のツイートに自動追記

#### Instagram投稿
- キャプションテキストを準備
- ハッシュタグをコメント欄用に分離（オプション）
- 画像は別途生成/準備が必要

#### TikTok投稿
- 台本を `output/published/` に保存
- 動画作成は手動 or 別ツール（将来的にRemotion等で自動化）

### 3. 投稿後アクション
- 各プラットフォームの投稿URLを記録
- `output/published/` に投稿済みファイルを移動
- `logs/pipeline.log` に投稿完了を記録

## 出力フォーマット
```json
{
  "article_id": "G1-001",
  "published": {
    "note": {"url": "投稿URL", "timestamp": "YYYY-MM-DD HH:MM"},
    "x": {"url": "投稿URL", "timestamp": "YYYY-MM-DD HH:MM"},
    "instagram": {"status": "画像準備待ち", "timestamp": null},
    "tiktok": {"status": "台本完了・撮影待ち", "timestamp": null}
  }
}
```
