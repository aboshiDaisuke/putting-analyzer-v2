import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  const results: Record<string, string> = {};
  
  const dbUrl = process.env.DATABASE_URL ?? "";
  results.hasDatabaseUrl = dbUrl ? "yes" : "no";
  results.dbUrlPreview = dbUrl ? dbUrl.replace(/:([^:@]+)@/, ":***@").slice(0, 100) : "empty";
  
  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, { connect_timeout: 8, max: 1 });
    const r = await sql`SELECT 1 as ok`;
    results.db = r[0]?.ok === 1 ? "connected" : "unexpected";
    await sql.end();
  } catch (e: unknown) {
    results.db = "failed: " + (e instanceof Error ? e.message : String(e));
  }
  
  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(JSON.stringify(results, null, 2));
}
