# Fable 5 改修バージョン

このフォルダは **Claude Fable 5** による改修バージョンです（2026-06-10作成）。
元リポジトリ: `/Volumes/Workspace/Div/putting-analyzer_2_Claude`（ブランチ `fable5/gemini3-ui-refresh` のクローン）

## このバージョンでの変更内容

### OCR・サーバー
- OCRモデルを `gemini-2.5-flash`（2026/10/16廃止予定）→ **`gemini-3.1-flash-lite`** に移行
  - `.env` の `GEMINI_MODEL` で切替可能（高精度版: `gemini-3.5-flash`）
  - Gemini 3系は `thinkingLevel`、2.5系は `thinkingBudget` を自動振り分け（server/_core/llm.ts）
- `ocr.analyzeScorecard` を認証必須化（未認証のGemini APIコスト消費を防止）
- 未使用の `ocr.uploadImage` / `ocr.analyzeBatch` を削除
- 距離別統計から距離未記入（distanceMeters=0）のパットを除外
- OCRレビュー画面: Hole未設定カードのスキップを保存前に確認表示
- scoreResult の採用ロジックをコメント通り「最初に見つかったもの」に修正

### UI（ネイティブらしさ向上）
- `components/ui/confirm-box.tsx` / `error-banner.tsx` 新設 — ハードコード色を排除しダークモード対応
- 全画面の主要カードに影（`lib/card-shadow.ts`: iOS shadow / Android elevation / Web boxShadow）
- ハプティクス（`lib/haptics.ts`）: 保存・削除成功 / 削除確認表示 / セクション開閉
- 分析画面のセクション開閉に LayoutAnimation、空状態にアイコン追加
- RefreshControl をテーマ色に、新規ラウンドのステップ進捗バー強化

### 開発環境
- metro.config.js: 外付けボリュームのAppleDoubleファイル（._*）を除外（バンドルエラー対策）
- vitest: 同様に ._* を除外

## 2026-09-16 追加分（レビュー指摘の一括修正）

- DB: `holes(roundId, holeNumber)` ユニーク制約・FK索引（0003）、RLS 有効化（0004）
- ホール保存を1トランザクション化、ラウンド合計をサーバー側で全ホールから再計算
- 手入力のメートル距離を `distanceMeters` に反映（距離別分析・SG・ラグ分析に載る）
- OCR: カードのホール番号を尊重し未読分だけ補完（`assignHoleNumbers`）、日付のTZずれ解消
- 一覧/ホームの平均パット/H の分母をプレー済みホール数に
- 傾斜未記入を null で保持、ラグ分析は 2nd パット距離を使用
- ネイティブ OAuth の redirect を `Linking.createURL` で生成（scheme 不一致の解消）
- `/api/health` から DB 接続情報の露出を除去
- 認証 context にトークン→ユーザーのキャッシュ、users の同期を1時間に1回に
- 表示名を `users.name` に保存
- 未使用の cookie 認証経路・`use-auth`・`server/storage.ts`・`theme-lab` 等を削除

## 2026-09-16 追加分（OCR精度向上・機能追加）

### OCR パイプライン
- **台形補正**（Web）: `lib/ocr-image-core.ts` が四隅の■マークを検出し、射影変換で正面向き固定サイズの画像に補正
  （`lib/ocr-image.web.ts`。ネイティブは従来通り縮小のみ `lib/ocr-image.ts`）
- **枠の画素判定**: 補正画像上の既知座標（`lib/ocr-layout.ts`、HTML を計測して生成）で
  In / Result / Line の枠の塗りを判定し、`markHints` としてサーバーへ送る。LLM の読みより優先
- **構造化出力**: Gemini の `responseSchema` で JSON の型・列挙値を強制
- **お手本画像**: 未記入テンプレート（`server/_core/scorecard-template.ts`）を few-shot として同送
- **二重読み**: `OCR_VERIFY_MODEL`（既定 gemini-3.1-flash-lite）で並行して読み、食い違いを `conflicts` に
- **整合性チェック**: `validateOcrHole` で記入ルールとの矛盾を `warnings` に
- 確認画面は要確認フィールドに旗と背景色、警告一覧、件数を表示。手で直すと解除される
- 撮影画面は四隅■の目印、撮影直後の前処理バッジ（補正OK / ■未検出 / ブレ?）
- テスト: `tests/fixtures/` の合成写真で四隅検出〜枠判定を検証（`scripts/ocr/` 参照）

### 機能
- オフライン保存キュー（`lib/offline-queue.ts`）: 圏外でもホール入力を端末に保留し、接続後に自動送信
- 距離別カップイン率に PGA ツアー目安の破線を表示
- プロフィールから CSV エクスポート（1行1パット、BOM 付き）

## 起動方法

```bash
npm install   # または pnpm install
npm run dev   # APIサーバー(3000) + Metro(8081)
```

ブラウザ確認: http://localhost:8081 を開く。`.env` の `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000` が必要（設定済み。空白だとAPI呼び出しがMetroに飛んで404になる）。
スマホ確認: Macと同じWi-Fiで Expo Go からQR読み取り。
スマホ実機の場合は `EXPO_PUBLIC_API_BASE_URL=http://<MacのLAN IP>:3000` に変更してMetroを再起動すること。

## 2026-09-25 v3 改修

### パッティングカード v3（`public/scorecard/putting-card-v3.html` / `.pdf`）
- 1枚で18ホール。A4 に表（OUT 1〜9）と裏（IN 10〜18、180°回転）を印刷し、中央で山折りすると 175×105mm の二つ折りカードになる
  （旧カードは 108×178mm で 4.25×7 インチをわずかに超えていた・1ホール1枚だった）
- 1ホール1行: 何のパット？（E/Ba/P/Bo/D+）・1st 距離（整数m）/傾斜/曲がり/短・長・2nd 距離（小数1桁）/傾斜/曲がり・3rd 距離・計
- 四隅■＋向きキー＋面コードで、逆さ・縦向き・表裏の取り違えを自動で直す。フォントは埋め込み済み PDF
- 座標の正は `lib/scorecard/layout.ts`。HTML の計測は不要になった

### OCR v3
- 前処理をサーバーに移し、ネイティブ撮影でも台形補正・画素判定が効くようにした（jpeg-js）
- 全チェック枠は画素で判定（鉛筆の薄い線も拾えるよう枠ごとに紙の白さを測る）。数字枠はインクの有無を測って LLM の捏造を除去
- Gemini には全体画像＋「列見出し＋1行」の切り抜き9枚＋記入済みお手本と正解 JSON を送る（行ずれ防止）
- 二重読みの食い違いは、画素で確定できないフィールドだけ「要確認」に
- 合成写真（ペン/鉛筆・0/90/180°・照明ムラ）で 275/275 フィールド正解（`scripts/scorecard/eval-ocr.ts`）

### 分析 v3（`lib/putting-stats.ts`・`docs/ANALYTICS.md`）
- ストロークス・ゲインド（ツアー / HC0 / HC15 基準）を1打ごとに計算。パット数を「距離の難しさ」と「腕前」に分解
- 距離帯別の損得、全パットの距離別成功率（95%区間）、寄せ（残り・1m以内率・短/長）、ライン 3×3、何のパット別、推移、条件別
- 練習の優先順位を「1ラウンドあたり失っている打数」で並べ、ドリルを提示

### デザイン
- three.js の 3D グリーン（ホーム・ログインのヒーロー、分析とラウンドのグリーンマップ）。ネイティブは SVG
- ホーム・分析・ラウンド詳細・手入力・撮影・確認画面を作り直し。ダークモードでの主要ボタンの文字コントラストを修正（onPrimary）
- 分析の見方（`app/guide.tsx`）、カード印刷の導線、デモモード

### 修正したバグ
- Web で `lib/ocr-image.web.ts` が自分自身を import しており、アップロード上限が undefined → 常に JPEG 品質 0.6 で送っていた
- ホームがラウンド0件のとき `avgPuttsPerHole({})` で落ちる
- 新規ラウンドの日付初期値が UTC（日本時間の朝9時前は前日になる）
- タブバーのラベルが下で切れる
