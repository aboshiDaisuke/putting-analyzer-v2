# Claude Code 引き継ぎメモ

## 現在の状態

- 作業ブランチ: `fable5/gemini3-ui-refresh`
- GitHub: `aboshiDaisuke/putting-analyzer-v2`
- ドラフトPR: https://github.com/aboshiDaisuke/putting-analyzer-v2/pull/1
- Supabase project ref: `ijrrzinlhqhinlmzunzn` (`putting-analyzer`)
- 本番: https://putting-analyzer-v2.vercel.app/
- **2026-09-16 時点で Supabase プロジェクトが自動 pause 中**（free プランの1週間非アクティブ）。
  本番 `/api/health` は `db: failed`、Auth も応答なし。Dashboard から Restore が必要。

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
- カードのレイアウトを変えたら `scripts/ocr/measure-layout.js` で `lib/ocr-layout.ts` を再生成すること

## 次にやること

1. Supabase Dashboard でプロジェクトを Restore する
2. `drizzle.__drizzle_migrations` の履歴を確認し、0003・0004 を適用する
   - 履歴があれば `DATABASE_URL=... npx drizzle-kit migrate`
   - 履歴が無ければ SQL Editor で 0003 → 0004 の順に手動実行
   - 0004 は所有者ロール（postgres）で実行すること。適用後 `SELECT relrowsecurity FROM pg_class` で確認
3. anon key で `https://<ref>.supabase.co/rest/v1/rounds?select=*` を叩いて 401/空になることを確認
4. ログイン → ラウンド作成 → ホール入力 → 分析 が本番で動くことを確認
5. 実際のカード写真で OCR を試し、「補正OK」バッジが出るか・要確認の件数が妥当かを確認する
   （■未検出が続く場合は `lib/ocr-image-core.ts` の `findCornerMarkers` のサイズ/形状の閾値を調整）
6. 問題がなければプッシュし、ドラフトPRを Ready にする

## 重要な注意

- `.env` やアクセストークン、DBパスワードなどの秘密情報をログやコミットに出さないこと。
- 本番DBを変更する前に現行スキーマを読み取り確認し、適用後も検証すること。
- リポジトリにはDrizzle migrationを使用する。Supabase CLIのmigration形式へ勝手に移行しないこと。
- 外付けボリュームでは `drizzle/meta/._*`（AppleDouble）があると `drizzle-kit generate` が壊れる。
  `find drizzle -name "._*" -delete` してから実行する。
- `drizzle-kit generate` は `DATABASE_URL` が環境変数に無いと config で落ちる（接続はしない）。
