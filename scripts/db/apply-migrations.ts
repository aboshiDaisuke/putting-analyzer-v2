/**
 * 未適用のマイグレーション（0003 / 0004 / 0005）を本番 DB に適用する。
 *
 *   npx tsx scripts/db/apply-migrations.ts          … 何をするかを表示するだけ（既定）
 *   npx tsx scripts/db/apply-migrations.ts --apply  … 1トランザクションで適用し、適用後に検証
 *
 * これまで本番には SQL Editor で手動適用してきた（drizzle の適用履歴が無い）ため、
 * 適用済みかどうかは履歴ではなく実際のスキーマ（索引・RLS・列の有無）で判定する。
 * drizzle の適用履歴テーブルがある場合は、履歴に沿う `npx drizzle-kit migrate` を案内して終了する。
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const DIR = path.resolve(__dirname, "../../drizzle");
const TABLES = ["users", "userProfiles", "putters", "courses", "rounds", "holes", "putts"];

function statements(file: string): string[] {
  return readFileSync(path.join(DIR, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL がありません");
  const sql = postgres(url, { connect_timeout: 15, max: 1, prepare: false });
  try {
    const [h] = await sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`;
    if (h.t) {
      console.log("drizzle の適用履歴があります。履歴に沿って `DATABASE_URL=... npx drizzle-kit migrate` で適用してください。");
      return;
    }

    const state = async () => {
      const [idx] = await sql`SELECT to_regclass('public."holes_roundId_holeNumber_unique"') AS t`;
      const [rls] = await sql`SELECT bool_and(c.relrowsecurity) AS ok FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relname = ANY(${TABLES})`;
      const [col] = await sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'putts' AND column_name = 'missLength'`;
      return { m0003: Boolean(idx.t), m0004: Boolean(rls.ok), m0005: col.n > 0 };
    };

    const before = await state();
    const plan = [
      { name: "0003 holes の重複削除・ユニーク索引・FK 索引", file: "0003_holes_unique_and_fk_indexes.sql", done: before.m0003 },
      { name: "0004 RLS 有効化・anon/authenticated の権限取り消し", file: "0004_enable_rls.sql", done: before.m0004 },
      { name: "0005 putts.missLength 列の追加", file: "0005_putts_miss_length.sql", done: before.m0005 },
    ];
    for (const p of plan) console.log(`${p.done ? "適用済み" : "未適用  "}  ${p.name}`);
    const todo = plan.filter((p) => !p.done);
    if (todo.length === 0) {
      console.log("適用するものはありません。");
      return;
    }
    const [dup] = await sql`SELECT count(*)::int AS n FROM (SELECT "roundId", "holeNumber" FROM holes GROUP BY 1, 2 HAVING count(*) > 1) d`;
    if (!before.m0003) console.log(`（0003 で holes の重複 ${dup.n}組を、新しい行を残して削除します）`);
    if (!apply) {
      console.log("\n確認のみです。適用するには --apply を付けて実行してください。");
      return;
    }

    await sql.begin(async (tx) => {
      for (const p of todo) {
        for (const stmt of statements(p.file)) await tx.unsafe(stmt);
        console.log(`適用: ${p.name}`);
      }
    });

    const after = await state();
    const [anon] = await sql`SELECT has_table_privilege('anon', 'public.rounds', 'SELECT') AS ok`;
    console.log(`\n検証: 0003=${after.m0003} 0004=${after.m0004} 0005=${after.m0005} / anon が rounds を読める=${anon.ok}`);
    if (!after.m0003 || !after.m0004 || !after.m0005 || anon.ok) throw new Error("適用後の検証に失敗しました");
    console.log("すべて適用・検証しました。");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("失敗:", e instanceof Error ? e.message : e);
  process.exit(1);
});
