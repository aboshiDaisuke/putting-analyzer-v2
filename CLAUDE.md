# Claude Code 引き継ぎメモ

## 現在の状態

- 作業ブランチ: `fable5/v3-card-analytics-3d`（`fable5/gemini3-ui-refresh` から分岐。2026-09-25 の v3 改修）
- GitHub: `aboshiDaisuke/putting-analyzer-v2`
- ドラフトPR: https://github.com/aboshiDaisuke/putting-analyzer-v2/pull/1
- Supabase project ref: `ijrrzinlhqhinlmzunzn` (`putting-analyzer`)
- 本番: https://putting-analyzer-v2.vercel.app/
- **2026-09-25 に Supabase を Restore し、migration 0003・0004・0005 を本番に適用済み**
  （`scripts/db/apply-migrations.ts --apply`。RLS 有効・anon の REST は 401 を確認。適用前のデータは scratchpad に JSON で退避）。
  本番 DB は drizzle の適用履歴テーブルが**空**（手動適用の運用）なので `drizzle-kit migrate` は使わないこと
- 停止の原因: 停止防止の cron が `main`（本番）に入っていなかった。PR #1 をマージすると Vercel の日次 cron が有効になる

## 2026-09-16 の修正（コミット済み・未プッシュ・本番DB未適用）

- RLS 対応の migration `drizzle/0004_enable_rls.sql`（RLS 有効化 + anon/authenticated の権限取消）
- `drizzle/0003_holes_unique_and_fk_indexes.sql`（holes の (roundId, holeNumber) ユニーク、FK 索引、重複行の事前削除）
- ホール保存を1トランザクション化し、ラウンド合計をサーバーで再計算（`server/db.ts` `saveHoles`）
- 手入力のメートル距離が分析に反映されない不具合、OCR のホール番号強制上書き、日付の1日ずれ、
  一覧の平均パット分母、ネイティブ OAuth スキーム、health エンドポイントの情報露出を修正
- 傾斜「未記入」を null で保持（フラットと区別）、ラグ分析は 2nd パットの距離を使用
- 表示名を `users.name` に保存、認証 context にキャッシュ導入、cookie 認証経路など未使用コードを削除

## 2026-09-16 追加分（OCR精度向上・機能）

- OCR: 台形補正（Web）→ 枠の画素判定 → responseSchema → お手本画像 few-shot → 二重読み → 整合性チェック。
  詳細は FABLE5_VERSION.md。`OCR_VERIFY_MODEL` を Vercel 環境変数に追加すると検証モデルを変更/無効化できる（未設定なら lite で有効）
- オフライン保存キュー、距離別チャートのツアー目安、CSV エクスポート
- （v2 の `scripts/ocr/`・`lib/ocr-layout.ts` は v3 で廃止）

## 2026-09-25 v3 改修（カード・OCR・分析・3D）

- **カード v3**: 1枚で18ホール（A4 に表 OUT・裏 IN を印刷して二つ折り、175×105mm = 規則のポケットサイズ以内）。
  座標の正は `lib/scorecard/layout.ts`（mm）。SVG は `lib/scorecard/card-svg.ts`、印刷ページは
  `npx tsx scripts/scorecard/build-card.ts` → `public/scorecard/putting-card-v3.html`、PDF は `scripts/scorecard/render-pdf.js`。
  **レイアウトを変えたら** build-card → render-pdf → gen-fixtures → build-fewshot を再実行し `npx vitest run` と eval-ocr で確認
- **OCR v3**: サーバー（`server/card-ocr.ts` / `server/_core/card-image.ts`）で JPEG デコード → 四隅■＋向きキーで 0/90/180/270° 補正
  → 面コードで OUT/IN 判定 → 全チェック枠を画素判定・数字枠のインク有無 → Gemini（全体＋行ごとの切り抜き＋記入済みお手本）→ 統合・検証。
  精度評価は `npx tsx scripts/scorecard/eval-ocr.ts`（合成写真3枚で 275/275、要確認に出ない誤読 0）。v2 カードの読み取りは廃止
- **データ**: putts に `missLength`（short/long）を追加 → `drizzle/0005_putts_miss_length.sql`（未適用）。
  `putts.result` は「このパットが入れば何のスコアか」（1ホール1回の「何のパット？」から自動で埋める。`lib/putting.ts`）
- **分析**: ストロークス・ゲインド中心に作り直し（`lib/putting-stats.ts`、設計は `docs/ANALYTICS.md`）
- **3D**: `components/green/green-scene.web.tsx`（three.js・動的 import・画面外で停止・reduced-motion 対応）、ネイティブは SVG
- **デモモード**: ログイン画面「ログインせずにデモを見る」。`lib/demo-mode.ts`（メモリ上のストア）＋ `lib/demo-data.ts`。
  Supabase 停止中の画面確認にも使える（localStorage `putting_analyzer_demo_mode=1`）

## 次にやること

1. ~~Supabase を Restore / 0003〜0005 を適用 / anon の REST が 401 / ローカルで ログイン→撮影→読み取り→保存→分析 の通し確認~~（2026-09-25 済み）
2. PR #1 をマージして本番にデプロイ（停止防止の cron が有効になる）。デプロイ後に本番でも通しで確認
3. 本番の `/api/health` が `{"ok":true,...}`（古い `dbUrlPreview` 付きではない）になっていることを確認
4. GitHub Actions の keep-alive が成功していることを確認（公開リポジトリは60日コミットが無いと自動停止）
5. カード v3 を印刷（実寸 175×105mm になっているか定規で確認）し、実際に記入・撮影して OCR を試す
   （■未検出が続く場合は `lib/ocr-image-core.ts` の `findCornerMarkers`、印の判定は `lib/scorecard/process.ts` の MARK_*/INK_* を調整）
6. 問題がなければプッシュし、ドラフトPRを Ready にする

## 重要な注意

- ローカルでは別アプリが `[::1]:3000` を使っていることがある。その場合ブラウザの `localhost:3000` は別アプリに届く
  （CORS エラーになる）。API を `PORT=3001` で起動し、`.env` の `EXPO_PUBLIC_API_BASE_URL` を一時的に `http://127.0.0.1:3001` にして Metro を `--clear` で再起動する

- `.env` やアクセストークン、DBパスワードなどの秘密情報をログやコミットに出さないこと。
- 本番DBを変更する前に現行スキーマを読み取り確認し、適用後も検証すること。
- リポジトリにはDrizzle migrationを使用する。Supabase CLIのmigration形式へ勝手に移行しないこと。
- 外付けボリュームでは `drizzle/meta/._*`（AppleDouble）があると `drizzle-kit generate` が壊れる。
  `find drizzle -name "._*" -delete` してから実行する。
- `drizzle-kit generate` は `DATABASE_URL` が環境変数に無いと config で落ちる（接続はしない）。
