/**
 * 本番 DB の状態を読むだけのチェック（書き込みはしない）。
 *   npx tsx scripts/db/check-db.ts
 * 接続先は .env の DATABASE_URL。接続文字列やパスワードは表示しない。
 */
import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL がありません");
  const sql = postgres(url, { connect_timeout: 15, max: 1, prepare: false });
  try {
    const [{ current_user: user }] = await sql`SELECT current_user`;
    console.log(`接続OK（ロール: ${user}）`);

    const hist = await sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`;
    if (hist[0].t) {
      const rows = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      console.log(`drizzle の適用履歴: ${rows.length}件`);
      for (const r of rows) console.log(`  #${r.id} created_at=${r.created_at} hash=${String(r.hash).slice(0, 12)}…`);
    } else {
      console.log("drizzle の適用履歴: なし（これまでは SQL Editor で手動適用）");
    }

    const tables = ["users", "userProfiles", "putters", "courses", "rounds", "holes", "putts"];
    console.log("\nテーブル（件数・RLS・所有者）:");
    for (const t of tables) {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM ${sql(t)}`;
      const [c] = await sql`SELECT c.relrowsecurity AS rls, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relname = ${t}`;
      const [p] = await sql`SELECT has_table_privilege('anon', ${`public."${t}"`}, 'SELECT') AS anon_select`;
      console.log(`  ${t.padEnd(13)} ${String(n).padStart(6)}件  RLS=${c.rls ? "有効" : "無効"}  owner=${c.owner}  anonがSELECT可=${p.anon_select}`);
    }

    const [dup] = await sql`SELECT count(*)::int AS n FROM (SELECT "roundId", "holeNumber" FROM holes GROUP BY 1, 2 HAVING count(*) > 1) d`;
    const [idx] = await sql`SELECT to_regclass('public."holes_roundId_holeNumber_unique"') AS t`;
    const [col] = await sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'putts' AND column_name = 'missLength'`;
    console.log("\nマイグレーションの状態:");
    console.log(`  0003 holes の重複（roundId, holeNumber）: ${dup.n}組 / ユニーク索引: ${idx.t ? "あり" : "なし"}`);
    const rlsAll = await sql`SELECT bool_and(c.relrowsecurity) AS ok FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relname = ANY(${tables})`;
    console.log(`  0004 全テーブルの RLS: ${rlsAll[0].ok ? "有効" : "未適用"}`);
    console.log(`  0005 putts.missLength: ${col.n ? "あり" : "なし"}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("失敗:", e instanceof Error ? e.message : e);
  process.exit(1);
});
