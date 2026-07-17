# Claude Code 引き継ぎメモ

## 現在の状態

- 作業ブランチ: `fable5/gemini3-ui-refresh`
- GitHub: `aboshiDaisuke/putting-analyzer-v2`
- ドラフトPR: https://github.com/aboshiDaisuke/putting-analyzer-v2/pull/1
- Supabase project ref: `ijrrzinlhqhinlmzunzn` (`putting-analyzer`)
- 本番: https://putting-analyzer-v2.vercel.app/
- 直近確認時点でVercel、本番トップ、本番 `/api/health` は正常
- 作業内容は最新コミット `ac2c98e` までプッシュ済み

## 完了済み

- パッティング分析の期間別集計、9ホール分析、推移チャートを修正
- ホーム集計とスコア結果の永続化を修正
- 課題トップ3、練習提案、少数サンプル表示を追加
- 残距離による3パット原因分析を追加
- 条件補正パター比較、個人基準の簡易SGを追加
- `holes.scoreResult` を追加する Drizzle migration
  `drizzle/0002_tiresome_red_ghost.sql` を本番Supabaseへ適用済み
- 本番DBで `scoreResult` は enum型、default `par`、NOT NULL
- 既存18ホールの `scoreResult` NULL件数は0

## 次にやること

最優先はSupabaseのRLS対応。

1. アプリの認証方式とDBアクセス経路を確認する
2. 次の7テーブルについて、利用者ごとのアクセス要件を整理する
   - `courses`
   - `holes`
   - `putters`
   - `putts`
   - `rounds`
   - `userProfiles`
   - `users`
3. RLSポリシーを設計し、マイグレーションとして追加する
4. ローカルテスト、型チェック、lint、production buildを実行する
5. まとまりのよい単位でコミットし、同ブランチへプッシュする
6. 本番Supabaseへ適用し、認証あり・なしのアクセスを検証する
7. 問題がなければドラフトPRをReadyにしてマージを検討する

## 重要な注意

- Supabase DB Advisorで、上記7テーブルのRLS無効がcriticalとして検出された。
- ポリシーなしでRLSだけを有効化するとアプリのDBアクセスを遮断するため、
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` を単独で本番適用しないこと。
- `.env` やアクセストークン、DBパスワードなどの秘密情報をログやコミットに出さないこと。
- 本番DBを変更する前に現行スキーマを読み取り確認し、適用後も検証すること。
- リポジトリにはDrizzle migrationを使用する。Supabase CLIのmigration形式へ勝手に移行しないこと。

## 直近の主要コミット

- `ac2c98e feat(analytics): 個人基準の簡易SGを追加`
- `f5388cc feat(analytics): 条件補正パター比較を追加`
- `1fcb913 feat(analytics): 残距離による3パット原因分析を追加`
- `38447ef feat(analytics): 少数サンプルへ参考値表示を追加`
- `75731e4 feat(analytics): 課題トップ3と練習提案を追加`
- `09dd781 fix(analytics): ホーム集計とスコア結果の永続化を修正`
- `f5305d5 fix(analytics): 期間別集計と9ホール分析を修正`

