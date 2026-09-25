/**
 * カード v3 の読み取り精度を実際の Gemini で測る（.env の GEMINI_API_KEY を使用・課金あり）。
 *
 *   npx tsx scripts/scorecard/eval-ocr.ts [fixture名...]
 *
 * tests/fixtures/card-v3-*.png（+ 正解 .json）を読み取り、フィールドごとの正解率と
 * 「要確認」に上がったかどうかを表示する。誤読のうち要確認に上がらなかったもの（見逃し）が本当の問題。
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { decodePng } from "../../tests/helpers/png";
import { encodeJpegBase64 } from "../../server/_core/card-image";
import { analyzeCard } from "../../server/card-ocr";
import { fillToOcrCard, type CardFill } from "../../lib/scorecard/card-svg";
import type { CardSide } from "../../lib/scorecard/layout";

// FIXTURE_DIR=tests/fixtures/stress で悪条件の写真を測る。JPEG_Q で送信画像の圧縮率を変えられる
const FIXTURES = path.resolve(__dirname, "../..", process.env.FIXTURE_DIR ?? "tests/fixtures");
const JPEG_Q = Number(process.env.JPEG_Q ?? 90);

async function main() {
  const names = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(FIXTURES).filter((f) => /^(card-v3|stress)-.*\.json$/.test(f)).map((f) => f.replace(/\.json$/, ""));
  let total = 0;
  let correct = 0;
  let silentErrors = 0;
  for (const name of names) {
    const truthRaw = JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8")) as { side: CardSide; fill: CardFill };
    const truth = fillToOcrCard(truthRaw.side, truthRaw.fill);
    const png = decodePng(readFileSync(path.join(FIXTURES, `${name}.png`)));
    const started = Date.now();
    const res = await analyzeCard({ base64: encodeJpegBase64(png, JPEG_Q) });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (!res.card) {
      console.log(`${name}: 読み取り失敗`);
      continue;
    }
    const conflicts = new Set(res.conflicts);
    const errors: string[] = [];
    let n = 0;
    let ok = 0;
    const check = (p: string, got: unknown, want: unknown) => {
      n++;
      if (got === want) ok++;
      else {
        const flagged = conflicts.has(p) || [...conflicts].some((c) => p.startsWith(c));
        if (!flagged) silentErrors++;
        errors.push(`${p}: 読み=${JSON.stringify(got)} 正解=${JSON.stringify(want)}${flagged ? "（要確認に表示）" : "（見逃し）"}`);
      }
    };
    if (truth.side === "out") check("date", res.card.date, truth.date);
    check("side", res.side, truth.side);
    truth.rows.forEach((t, i) => {
      const g = res.card!.rows[i];
      const b = `rows[${i}]`;
      check(`${b}.puttFor`, g.puttFor, t.puttFor);
      check(`${b}.total`, g.total, t.total);
      for (const k of ["p1", "p2"] as const) {
        check(`${b}.${k}.meters`, g[k].meters, t[k].meters);
        check(`${b}.${k}.ud`, g[k].ud, t[k].ud);
        check(`${b}.${k}.lr`, g[k].lr, t[k].lr);
      }
      check(`${b}.p1.miss`, g.p1.miss ?? null, t.p1.miss ?? null);
      check(`${b}.p3.meters`, g.p3.meters, t.p3.meters);
    });
    total += n;
    correct += ok;
    console.log(`\n${name}: ${ok}/${n} 正解 (${((ok / n) * 100).toFixed(1)}%) ${secs}秒 補正=${res.meta.rectified} 回転=${res.meta.rotation} 要確認=${res.conflicts.length}件 警告行=${Object.keys(res.warnings).length}`);
    for (const e of errors) console.log("  ✗ " + e);
    if (res.conflicts.length) console.log("  要確認: " + res.conflicts.join(", "));
  }
  console.log(`\n合計 ${correct}/${total} (${((correct / Math.max(1, total)) * 100).toFixed(1)}%)  要確認に出ない誤読: ${silentErrors}件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
