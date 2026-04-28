# 投稿管理スキル（配信マネージャー・カイ）

## 役割
GO判定された記事を各プラットフォームに投稿する。

## 投稿手順

### 1. 投稿前チェック
- `final-check.md` でGO判定されているか確認
- スケジュールと照合（`skills/planning/schedule-management.md`）
- `config/affiliate-links.json` でアフィリンクが正しく設置されているか最終確認

### 2. プラットフォーム別投稿

#### note投稿
- Markdown → noteの記事エディタ形式に変換
- タイトル、本文、タグを設定
- 有料/無料の設定
- 予約投稿 or 即時投稿

#### X投稿
- スレッドの場合：1本目投稿 → リプライで連鎖
- 画像がある場合：添付
- 投稿間隔：各ツイート30秒間隔

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
