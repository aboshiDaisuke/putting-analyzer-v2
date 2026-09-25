import { describe, expect, it } from "vitest";
import {
  applyCardHints,
  cardDateToYmd,
  cardToHoles,
  emptyRow,
  isPixelDecided,
  normalizeOcrCard,
  validateRow,
  type CardHints,
  type OcrCard,
  type RowHints,
} from "../scorecard/ocr";

const blankHints = (): RowHints => ({
  puttFor: null,
  p1: { dist: [false, false], ud: null, lr: null, miss: null },
  p2: { dist: [false, false], ud: null, lr: null },
  p3: { dist: [false, false] },
  total: false,
});

function card(rows: OcrCard["rows"]): OcrCard {
  return { side: "out", date: null, course: null, rows: [...rows, ...Array.from({ length: 9 - rows.length }, emptyRow)] };
}

describe("normalizeOcrCard", () => {
  it("keeps 9 rows, clamps ranges and rounds decimals", () => {
    const c = normalizeOcrCard({
      side: "IN",
      date: "09/25",
      rows: [{ puttFor: "Ba", p1: { meters: "8m", ud: "U", lr: "X" }, p2: { meters: 1.25 }, p3: { meters: 12 }, total: 2 }],
    });
    expect(c.side).toBe("in");
    expect(c.date).toBe("0925");
    expect(c.rows).toHaveLength(9);
    expect(c.rows[0].p1).toMatchObject({ meters: 8, ud: "U", lr: null });
    expect(c.rows[0].p2.meters).toBe(1.3);
    expect(c.rows[0].p3.meters).toBeNull(); // 9.9 を超える小数欄は読み違い
  });
});

describe("applyCardHints", () => {
  const llm = card([
    { ...emptyRow(), puttFor: "P", p1: { meters: 5, ud: "U", lr: "L", miss: null }, p2: { meters: 7, ud: null, lr: null }, total: 2 },
  ]);

  it("prefers confident pixel marks without flagging them, and drops invented digits", () => {
    const rows = Array.from({ length: 9 }, blankHints);
    rows[0] = { ...blankHints(), puttFor: 1, p1: { dist: [false, true], ud: 1, lr: 2, miss: 0 }, total: true };
    const hints: CardHints = { side: "out", rows, weak: [] };
    const { card: merged, conflicts } = applyCardHints(llm, hints);
    expect(merged.rows[0].puttFor).toBe("Ba");
    expect(merged.rows[0].p1.lr).toBe("R");
    expect(merged.rows[0].p1.miss).toBe("short");
    // 2nd の距離枠は画素では空 → LLM の 7 は捨てて要確認
    expect(merged.rows[0].p2.meters).toBeNull();
    expect(conflicts).toEqual(["rows[0].p2.meters"]);
  });

  it("flags disagreement when the pixel decision was marginal", () => {
    const rows = Array.from({ length: 9 }, blankHints);
    rows[0] = { ...blankHints(), puttFor: 1, p1: { dist: [false, true], ud: 1, lr: 1, miss: null }, p2: { dist: [true, false], ud: null, lr: null }, total: true };
    const { conflicts } = applyCardHints(llm, { side: "out", rows, weak: ["rows[0].puttFor"] });
    expect(conflicts).toContain("rows[0].puttFor");
  });

  it("knows which fields the pixels settle on their own", () => {
    const rows = Array.from({ length: 9 }, blankHints);
    rows[0] = { ...blankHints(), p1: { dist: [true, false], ud: "unsure", lr: 0, miss: null } };
    const h: CardHints = { side: "out", rows };
    expect(isPixelDecided(h, "rows[0].p1.lr")).toBe(true);
    expect(isPixelDecided(h, "rows[0].p1.ud")).toBe(false);
    expect(isPixelDecided(h, "rows[0].p1.meters")).toBe(false);
    expect(isPixelDecided(h, "rows[0].p2.meters")).toBe(true);
  });
});

describe("validateRow / cardToHoles", () => {
  it("warns about inconsistent rows", () => {
    const w = validateRow({ ...emptyRow(), p1: { meters: 3, ud: null, lr: null, miss: "short" }, total: 1 });
    expect(w).toContain("「何のパット？」に印がありません");
    expect(w).toContain("1パットなのに「短/長」に印があります");
    expect(validateRow({ ...emptyRow(), puttFor: "P", p1: { meters: 2, ud: null, lr: null }, p2: { meters: 3, ud: null, lr: null }, total: 2 })).toContain(
      "2nd の距離が 1st より長くなっています",
    );
  });

  it("converts IN-side rows to holes 10-18 and skips blank rows", () => {
    const c = card([
      emptyRow(),
      { ...emptyRow(), puttFor: "Ba", p1: { meters: 8, ud: "U", lr: "R", miss: "short" }, p2: { meters: 1.2, ud: "F", lr: "S" }, total: 2 },
    ]);
    const holes = cardToHoles(c, "in");
    expect(holes).toHaveLength(1);
    expect(holes[0].holeNumber).toBe(11);
    expect(holes[0].scoreResult).toBe("par");
    expect(holes[0].putts[0]).toMatchObject({ distanceMeters: 8, lineUD: "uphill", lineLR: "right", missLength: "short", cupIn: false });
    expect(holes[0].putts[1]).toMatchObject({ distanceMeters: 1.2, cupIn: true, result: "par" });
  });

  it("turns MMDD into a date that is not in the future", () => {
    expect(cardDateToYmd("0925", new Date(2026, 8, 25))).toBe("2026-09-25");
    expect(cardDateToYmd("1230", new Date(2026, 0, 5))).toBe("2025-12-30");
    expect(cardDateToYmd("1345")).toBeNull();
  });
});
