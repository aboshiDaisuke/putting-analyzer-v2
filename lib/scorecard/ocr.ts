/**
 * カード v3 の読み取り結果（LLM + 画素判定）の型・正規化・統合・検証・アプリデータへの変換。
 * サーバー（server/routers.ts）と確認画面（app/ocr-review.tsx）の両方で使う。
 */
import { buildHole } from "../putting";
import type { HoleData, MissLength, ScoreResult, SlopeLeftRight, SlopeUpDown } from "../types";
import {
  LR_OPTIONS,
  MISS_OPTIONS,
  PUTT_FOR_OPTIONS,
  ROW_COUNT,
  UD_OPTIONS,
  holeNumberFor,
  type CardSide,
  type LrCode,
  type MissCode,
  type PuttForCode,
  type UdCode,
} from "./layout";
import type { CardMarks, ChoiceHint, InkHint } from "./process";

// ─── 型 ─────────────────────────────────────────────────────────────────────

export type OcrPutt = {
  meters: number | null;
  ud: UdCode | null;
  lr: LrCode | null;
  /** 1st のみ */
  miss?: MissCode | null;
};

export type OcrRow = {
  puttFor: PuttForCode | null;
  p1: OcrPutt;
  p2: OcrPutt;
  p3: { meters: number | null };
  /** 「計」欄の総パット数 */
  total: number | null;
};

export type OcrCard = {
  side: CardSide | null;
  /** "MMDD" */
  date: string | null;
  course: string | null;
  rows: OcrRow[];
};

/** 画素判定の結果（JSON で送れる形） */
export type RowHints = {
  puttFor: ChoiceHint;
  p1: { dist: InkHint[]; ud: ChoiceHint; lr: ChoiceHint; miss: ChoiceHint };
  p2: { dist: InkHint[]; ud: ChoiceHint; lr: ChoiceHint };
  p3: { dist: InkHint[] };
  total: InkHint;
};
export type CardHints = {
  side: CardSide | null;
  rows: RowHints[];
  /** 画素の判定が際どかったチェック枠（例 "rows[2].p1.lr"）。ここだけは LLM と食い違ったら要確認にする */
  weak?: FieldPath[];
};

export function marksToHints(marks: CardMarks): CardHints {
  const weak: FieldPath[] = [];
  marks.rows.forEach((r, i) => {
    const b = `rows[${i}]`;
    if (!r.puttFor.strong) weak.push(`${b}.puttFor`);
    if (!r.p1.ud.strong) weak.push(`${b}.p1.ud`);
    if (!r.p1.lr.strong) weak.push(`${b}.p1.lr`);
    if (!r.p1.miss.strong) weak.push(`${b}.p1.miss`);
    if (!r.p2.ud.strong) weak.push(`${b}.p2.ud`);
    if (!r.p2.lr.strong) weak.push(`${b}.p2.lr`);
  });
  return {
    side: marks.side,
    weak,
    rows: marks.rows.map((r) => ({
      puttFor: r.puttFor.hint,
      p1: { dist: r.p1.dist.map((d) => d.hint), ud: r.p1.ud.hint, lr: r.p1.lr.hint, miss: r.p1.miss.hint },
      p2: { dist: r.p2.dist.map((d) => d.hint), ud: r.p2.ud.hint, lr: r.p2.lr.hint },
      p3: { dist: r.p3.dist.map((d) => d.hint) },
      total: r.total.hint,
    })),
  };
}

// ─── LLM の生出力の正規化 ─────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9.]/g, "");
    if (!cleaned || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pick<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function meters(v: unknown, max: number, decimals: boolean): number | null {
  const n = num(v);
  if (n === null || n <= 0 || n > max) return null;
  return decimals ? Math.round(n * 10) / 10 : Math.round(n);
}

export function emptyRow(): OcrRow {
  return {
    puttFor: null,
    p1: { meters: null, ud: null, lr: null, miss: null },
    p2: { meters: null, ud: null, lr: null },
    p3: { meters: null },
    total: null,
  };
}

export function normalizeOcrRow(raw: unknown): OcrRow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const p1 = (r.p1 ?? {}) as Record<string, unknown>;
  const p2 = (r.p2 ?? {}) as Record<string, unknown>;
  const p3 = (r.p3 ?? {}) as Record<string, unknown>;
  const total = num(r.total);
  return {
    puttFor: pick(r.puttFor, PUTT_FOR_OPTIONS),
    p1: { meters: meters(p1.meters, 99, false), ud: pick(p1.ud, UD_OPTIONS), lr: pick(p1.lr, LR_OPTIONS), miss: pick(p1.miss, MISS_OPTIONS) },
    p2: { meters: meters(p2.meters, 9.9, true), ud: pick(p2.ud, UD_OPTIONS), lr: pick(p2.lr, LR_OPTIONS) },
    p3: { meters: meters(p3.meters, 9.9, true) },
    total: total !== null && total >= 0 && total <= 9 ? Math.round(total) : null,
  };
}

export function normalizeOcrCard(raw: unknown): OcrCard {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rows = Array.isArray(r.rows) ? r.rows : [];
  const side = r.side === "OUT" || r.side === "out" ? "out" : r.side === "IN" || r.side === "in" ? "in" : null;
  const date = typeof r.date === "string" ? r.date.replace(/\D/g, "") : "";
  const course = typeof r.course === "string" ? r.course.trim() : "";
  return {
    side,
    date: date.length === 4 ? date : null,
    course: course || null,
    rows: Array.from({ length: ROW_COUNT }, (_, i) => normalizeOcrRow(rows[i])),
  };
}

// ─── 画素判定との統合 ─────────────────────────────────────────────────────

export type FieldPath = string; // 例 "rows[3].p1.meters"

/**
 * 画素判定を LLM の読みに重ねる。
 *  - チェック枠: 画素が印ありと判定した枠を採用（LLM と違えば要確認）
 *    画素が「印なし」で LLM が値を出したときは LLM を残して要確認（○囲みなど枠外の印は画素で拾えない）
 *  - 数字枠: 画素が「全枠空白」なら LLM の数字は捨てる（ありもしない数字の捏造を防ぐ）。
 *    画素がインクありなのに LLM が読めていなければ要確認
 */
export function applyCardHints(card: OcrCard, hints: CardHints): { card: OcrCard; conflicts: FieldPath[] } {
  const conflicts: FieldPath[] = [];
  const rows = card.rows.map((row, i) => {
    const h = hints.rows[i];
    if (!h) return row;
    const next: OcrRow = { ...row, p1: { ...row.p1 }, p2: { ...row.p2 }, p3: { ...row.p3 } };
    const base = `rows[${i}]`;

    const choice = <T extends string>(path: string, hint: ChoiceHint, table: readonly T[], current: T | null | undefined): T | null => {
      const cur = current ?? null;
      if (hint === "unsure") {
        if (cur !== null) conflicts.push(path); // 画素では判断できなかった → 念のため確認
        return cur;
      }
      const weak = hints.weak ? hints.weak.includes(path) : true;
      if (typeof hint === "number") {
        const value = table[hint] ?? null;
        // 画素がはっきり判定した枠は画素を正とし、LLM との食い違いは要確認にしない
        if (value !== cur && weak) conflicts.push(path);
        return value;
      }
      // 画素は「印なし」。○囲みなど枠の外を通る印は画素で拾えないので LLM の値を残して確認してもらう
      if (cur !== null) conflicts.push(path);
      return cur;
    };
    const digits = (path: string, cells: InkHint[], current: number | null): number | null => {
      const anyInk = cells.some((c) => c === true);
      const allBlank = cells.every((c) => c === false);
      if (allBlank && current !== null) {
        conflicts.push(path);
        return null;
      }
      if (anyInk && current === null) conflicts.push(path);
      return current;
    };

    next.puttFor = choice(`${base}.puttFor`, h.puttFor, PUTT_FOR_OPTIONS, row.puttFor);
    next.p1.meters = digits(`${base}.p1.meters`, h.p1.dist, row.p1.meters);
    next.p1.ud = choice(`${base}.p1.ud`, h.p1.ud, UD_OPTIONS, row.p1.ud);
    next.p1.lr = choice(`${base}.p1.lr`, h.p1.lr, LR_OPTIONS, row.p1.lr);
    next.p1.miss = choice(`${base}.p1.miss`, h.p1.miss, MISS_OPTIONS, row.p1.miss);
    next.p2.meters = digits(`${base}.p2.meters`, h.p2.dist, row.p2.meters);
    next.p2.ud = choice(`${base}.p2.ud`, h.p2.ud, UD_OPTIONS, row.p2.ud);
    next.p2.lr = choice(`${base}.p2.lr`, h.p2.lr, LR_OPTIONS, row.p2.lr);
    next.p3.meters = digits(`${base}.p3.meters`, h.p3.dist, row.p3.meters);
    next.total = digits(`${base}.total`, [h.total], row.total);
    return next;
  });
  return { card: { ...card, side: hints.side ?? card.side, rows }, conflicts: Array.from(new Set(conflicts)) };
}

/** 2つの読み（別モデル）で食い違ったフィールド */
export function compareOcrCards(a: OcrCard, b: OcrCard): FieldPath[] {
  const diffs: FieldPath[] = [];
  if (a.date !== b.date) diffs.push("date");
  a.rows.forEach((ra, i) => {
    const rb = b.rows[i];
    if (!rb) return;
    const base = `rows[${i}]`;
    if (ra.puttFor !== rb.puttFor) diffs.push(`${base}.puttFor`);
    if (ra.total !== rb.total) diffs.push(`${base}.total`);
    for (const k of ["p1", "p2"] as const) {
      if (ra[k].meters !== rb[k].meters) diffs.push(`${base}.${k}.meters`);
      if (ra[k].ud !== rb[k].ud) diffs.push(`${base}.${k}.ud`);
      if (ra[k].lr !== rb[k].lr) diffs.push(`${base}.${k}.lr`);
    }
    if ((ra.p1.miss ?? null) !== (rb.p1.miss ?? null)) diffs.push(`${base}.p1.miss`);
    if (ra.p3.meters !== rb.p3.meters) diffs.push(`${base}.p3.meters`);
  });
  return diffs;
}

// ─── 行の中身と整合性 ─────────────────────────────────────────────────────

export function rowHasData(row: OcrRow): boolean {
  return (
    row.puttFor !== null ||
    row.total !== null ||
    row.p1.meters !== null || row.p1.ud !== null || row.p1.lr !== null || (row.p1.miss ?? null) !== null ||
    row.p2.meters !== null || row.p2.ud !== null || row.p2.lr !== null ||
    row.p3.meters !== null
  );
}

function puttHasData(p: OcrPutt | { meters: number | null }): boolean {
  const q = p as OcrPutt;
  return q.meters !== null || (q.ud ?? null) !== null || (q.lr ?? null) !== null || (q.miss ?? null) !== null;
}

/** 記録されているパットの数（距離・印のどれかがある最後のパット） */
export function recordedPuttCount(row: OcrRow): number {
  if (puttHasData(row.p3)) return 3;
  if (puttHasData(row.p2)) return 2;
  if (puttHasData(row.p1)) return 1;
  return 0;
}

/** 総パット数（「計」が無ければ記録から推定） */
export function effectiveTotal(row: OcrRow): number {
  return row.total ?? recordedPuttCount(row);
}

/** 1行の矛盾を日本語で返す（保存は妨げない） */
export function validateRow(row: OcrRow): string[] {
  if (!rowHasData(row)) return [];
  const w: string[] = [];
  const recorded = recordedPuttCount(row);
  const total = row.total;
  if (row.puttFor === null) w.push("「何のパット？」に印がありません");
  if (total === null) w.push("「計」が読めません（記入からパット数を推定しました）");
  if (total !== null) {
    if (total >= 1 && row.p1.meters === null) w.push("1st の距離がありません");
    if (total >= 2 && recorded < 2) w.push(`計が${total}なのに 2nd の記入がありません`);
    if (total >= 3 && recorded < 3) w.push(`計が${total}なのに 3rd の距離がありません`);
    if (recorded > total && total > 0) w.push(`計が${total}なのに ${recorded}打目まで記入があります`);
    if (total === 0 && recorded > 0) w.push("計が0なのにパットの記入があります");
  }
  if (row.p1.meters !== null && row.p2.meters !== null && row.p2.meters > row.p1.meters)
    w.push("2nd の距離が 1st より長くなっています");
  if (row.p2.meters !== null && row.p3.meters !== null && row.p3.meters > row.p2.meters)
    w.push("3rd の距離が 2nd より長くなっています");
  if ((row.p1.miss ?? null) !== null && effectiveTotal(row) === 1) w.push("1パットなのに「短/長」に印があります");
  if (row.p1.meters !== null && row.p1.meters > 40) w.push("1st の距離が 40m を超えています");
  return w;
}

// ─── アプリデータへの変換 ─────────────────────────────────────────────────

const PUTT_FOR_TO_APP: Record<PuttForCode, ScoreResult> = {
  E: "eagle",
  Ba: "birdie",
  P: "par",
  Bo: "bogey",
  "D+": "double_bogey_plus",
};
const UD_TO_APP: Record<UdCode, SlopeUpDown> = { F: "flat", U: "uphill", D: "downhill" };
const LR_TO_APP: Record<LrCode, SlopeLeftRight> = { S: "straight", L: "left", R: "right" };
const MISS_TO_APP: Record<MissCode, MissLength> = { short: "short", long: "long" };

export function rowToHole(side: CardSide, index: number, row: OcrRow): HoleData | null {
  if (!rowHasData(row)) return null;
  return buildHole({
    holeNumber: holeNumberFor(side, index),
    puttFor: row.puttFor ? PUTT_FOR_TO_APP[row.puttFor] : null,
    totalPutts: effectiveTotal(row),
    putts: [
      {
        meters: row.p1.meters,
        lineUD: row.p1.ud ? UD_TO_APP[row.p1.ud] : null,
        lineLR: row.p1.lr ? LR_TO_APP[row.p1.lr] : null,
        missLength: row.p1.miss ? MISS_TO_APP[row.p1.miss] : null,
      },
      {
        meters: row.p2.meters,
        lineUD: row.p2.ud ? UD_TO_APP[row.p2.ud] : null,
        lineLR: row.p2.lr ? LR_TO_APP[row.p2.lr] : null,
      },
      { meters: row.p3.meters },
    ],
  });
}

/** カード1面 → HoleData[]（記入のない行は除く） */
export function cardToHoles(card: OcrCard, side: CardSide): HoleData[] {
  return card.rows.flatMap((row, i) => {
    const hole = rowToHole(side, i, row);
    return hole ? [hole] : [];
  });
}

/** "MMDD" と基準日から "YYYY-MM-DD"（未来日になる場合は前年とみなす） */
export function cardDateToYmd(mmdd: string | null, today: Date = new Date()): string | null {
  if (!mmdd || !/^\d{4}$/.test(mmdd)) return null;
  const m = Number(mmdd.slice(0, 2));
  const d = Number(mmdd.slice(2));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  let y = today.getFullYear();
  const candidate = new Date(y, m - 1, d);
  if (candidate.getTime() - today.getTime() > 2 * 24 * 60 * 60 * 1000) y -= 1;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * そのフィールドが画素判定だけで確定しているか。
 * 確定しているフィールドは、二重読み（別モデル）が食い違っても要確認にしない。
 *  - チェック枠: 印の位置 or 全て空白と判定できた
 *  - 数字枠: 全ての枠が空白（数字そのものは画素では読めないので、記入ありは確定扱いにしない）
 */
export function isPixelDecided(hints: CardHints, path: FieldPath): boolean {
  const m = /^rows\[(\d+)\]\.(puttFor|total|p[123])(?:\.(meters|ud|lr|miss))?$/.exec(path);
  if (!m) return false;
  const h = hints.rows[Number(m[1])];
  if (!h) return false;
  const [, , group, field] = m;
  if (group === "puttFor") return h.puttFor !== "unsure";
  if (group === "total") return h.total === false;
  const p = h[group as "p1" | "p2" | "p3"] as Partial<RowHints["p1"]>;
  if (field === "meters") return (p.dist ?? []).every((c) => c === false);
  const choice = p[field as "ud" | "lr" | "miss"];
  return choice !== undefined && choice !== "unsure";
}
