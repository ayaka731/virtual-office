# 分析スキル（分析官・ミク）

## 役割
投稿後のパフォーマンスを追跡し、次回の企画にフィードバックする。

## 追跡指標

### note
- PV（ページビュー）
- スキ数
- コメント数
- 記事からのリンククリック数

### X
- インプレッション
- いいね数
- リツイート数
- プロフィールクリック数
- リンククリック数

### Instagram
- リーチ
- いいね数
- 保存数（重要指標）
- コメント数
- プロフィールアクセス

### TikTok
- 再生数
- いいね数
- コメント数
- シェア数
- プロフィールアクセス

## 分析レポート出力（週次）
```json
{
  "period": "YYYY-MM-DD ~ YYYY-MM-DD",
  "articles_published": 6,
  "top_performing": {
    "article_id": "G1-003",
    "reason": "Xでバズった（RT 500超え）"
  },
  "worst_performing": {
    "article_id": "G2-002",
    "reason": "noteのPVが50未満"
  },
  "genre_comparison": {
    "G1": {"total_pv": 1500, "total_clicks": 200, "estimated_revenue": "○円"},
    "G2": {"total_pv": 2000, "total_clicks": 350, "estimated_revenue": "○円"}
  },
  "insights": ["分析から得られた気づき"],
  "next_recommendations": ["次週のテーマ提案"]
}
```

## フィードバックループ
週次レポートの `next_recommendations` は企画部（ミサキ）に共有し、
次週の `skills/planning/trend-analysis.md` 実行時に参照すること。
