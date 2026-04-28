# 最終チェックスキル（ファイナルチェック・ナツキ）

## 役割
SEO校正・法務チェック・品質チェックの結果を統合し、最終GO/NG判断を下す。

## 判定ロジック

### 即REJECT条件（1つでも該当でREJECT）
- `legal_risk` が `high`
- いずれかのスコアが50点未満

### GO条件（全て満たす）
- `seo_score` >= 80
- `legal_risk` が `low`
- `quality_score` >= 75
- 全プラットフォーム版（note / x / instagram / tiktok）が揃っている

### REVISE条件（上記以外）
- 具体的な修正指示をまとめて執筆部に差し戻す
- 修正回数をカウント（3回目でREJECT）

## 差し戻し・REJECT処理

| 修正回数 | アクション |
|---|---|
| 1〜2回目 | REVISE：修正指示を添えて執筆部に差し戻し |
| 3回目 | REJECT：`logs/pipeline.log` にREJECT理由を記録 |

## 出力フォーマット
```json
{
  "article_id": "G1-001",
  "final_verdict": "GO / REVISE / REJECT",
  "scores_summary": {
    "seo": 85,
    "legal": "low",
    "quality": 88
  },
  "revision_count": 0,
  "revision_instructions": "修正が必要な場合の具体的指示",
  "ready_platforms": ["note", "x", "instagram", "tiktok"],
  "publish_approved": true
}
```
