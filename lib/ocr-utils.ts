// OCR読み取り結果をアプリのデータモデルに変換するユーティリティ

import type {
  ScoreResult,
  SlopeUpDown,
  SlopeLeftRight,
  PuttData,
  HoleData,
} from "./types";
import { CARD_TO_APP } from "./types";

// OCRから返ってくるパットデータの型（v2カードの構造に対応）
export interface OcrPuttData {
  puttNumber: 1 | 2 | 3;
  cupIn: boolean; // In チェックボックス
  result: "E" | "Ba" | "P" | "Bo" | "D+" | null; // Putt/Result（5択）
  lengthMeters: number | null; // Length m（メートル直入力、2桁）
  lineUD: "F" | "U" | "D" | null; // Line(U/D)（3択）
  lineLR: "St" | "L" | "R" | null; // Line(L/R)（3択）
}

// OCRから返ってくるホールデータの型
export interface OcrHoleData {
  hole: number | null;
  date: string | null;
  course: string | null;
  putts: OcrPuttData[];
}

// Line(U/D) カード表記 → アプリ内部値（未記入は null のまま。フラットと区別する）
function convertLineUD(val: "F" | "U" | "D" | null): SlopeUpDown | null {
  if (!val) return null;
  return CARD_TO_APP.lineUD[val] ?? null;
}

// Line(L/R) カード表記 → アプリ内部値（未記入は null のまま。ストレートと区別する）
function convertLineLR(val: "St" | "L" | "R" | null): SlopeLeftRight | null {
  if (!val) return null;
  return CARD_TO_APP.lineLR[val] ?? null;
}

// Result カード表記 → アプリ内部値
function convertResult(result: "E" | "Ba" | "P" | "Bo" | "D+" | null): ScoreResult | null {
  if (!result) return null;
  return CARD_TO_APP.result[result] || null;
}

// OCRパットデータをアプリのPuttDataに変換
export function convertOcrPuttToAppPutt(
  ocrPutt: OcrPuttData
): PuttData | null {
  // データが全てnull/falseの場合はスキップ（空のパットセクション）
  const hasData =
    ocrPutt.cupIn ||
    ocrPutt.result !== null ||
    ocrPutt.lengthMeters !== null ||
    ocrPutt.lineUD !== null ||
    ocrPutt.lineLR !== null;

  if (!hasData) return null;

  const distanceMeters = ocrPutt.lengthMeters || 0;

  return {
    strokeNumber: ocrPutt.puttNumber,
    cupIn: ocrPutt.cupIn,
    distPrev: null,
    result: convertResult(ocrPutt.result),
    lengthSteps: null,
    lengthMeters: ocrPutt.lengthMeters,
    distanceMeters,
    lineUD: convertLineUD(ocrPutt.lineUD),
    lineLR: convertLineLR(ocrPutt.lineLR),
  };
}

// OCRホールデータをアプリのHoleDataに変換
export function convertOcrHoleToAppHole(
  ocrHole: OcrHoleData
): HoleData | null {
  if (!ocrHole.hole) return null;

  const putts: PuttData[] = [];
  let scoreResult: ScoreResult | null = null;

  for (const ocrPutt of ocrHole.putts) {
    const putt = convertOcrPuttToAppPutt(ocrPutt);
    if (putt) {
      putts.push(putt);
    }
    // Resultが見つかったら採用（1st → 2nd → 3rd の順で最初に見つかったものを使用）
    if (scoreResult === null && ocrPutt.result) {
      scoreResult = convertResult(ocrPutt.result);
    }
  }

  return {
    holeNumber: ocrHole.hole,
    scoreResult: scoreResult ?? "par",
    totalPutts: putts.length,
    putts,
  };
}

// ─── OCR生出力の正規化（LLMの誤り・構造ブレ・範囲外値を除去） ──────────────
// LLMは指示しても範囲外の数値・不正な列挙値・putts欠落などを返すことがある。
// 保存前にここで必ず正規化し、データ品質を担保する（サーバー側で適用）。

const RESULT_VALUES = new Set(["E", "Ba", "P", "Bo", "D+"]);
const LINE_UD_VALUES = new Set(["F", "U", "D"]);
const LINE_LR_VALUES = new Set(["St", "L", "R"]);

const HOLE_MIN = 1;
const HOLE_MAX = 18;
const LENGTH_MIN = 1;
const LENGTH_MAX = 20;

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    // "8m" や全角混じり等に備えて数字・符号・小数点のみ抽出
    const cleaned = v.replace(/[^0-9.-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function enumOrNull<T extends string>(v: unknown, allowed: Set<string>): T | null {
  return typeof v === "string" && allowed.has(v) ? (v as T) : null;
}

function normalizeOcrPutt(raw: unknown, puttNumber: 1 | 2 | 3): OcrPuttData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const len = toNumberOrNull(r.lengthMeters);
  return {
    puttNumber, // モデルの値ではなく配置順（1st/2nd/3rd）で固定する
    cupIn: r.cupIn === true,
    result: enumOrNull(r.result, RESULT_VALUES),
    lengthMeters:
      len !== null && len >= LENGTH_MIN && len <= LENGTH_MAX ? Math.round(len) : null,
    lineUD: enumOrNull(r.lineUD, LINE_UD_VALUES),
    lineLR: enumOrNull(r.lineLR, LINE_LR_VALUES),
  };
}

/** 1枚分のOCR生出力を、必ず3パット・範囲内・正しい型のOcrHoleDataに整える。 */
export function normalizeOcrHole(raw: unknown): OcrHoleData {
  // モデルが配列で返した場合は先頭要素を採用
  const obj = Array.isArray(raw) ? raw[0] : raw;
  const r = (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;

  const holeNum = toNumberOrNull(r.hole);
  const rawPutts = Array.isArray(r.putts) ? r.putts : [];
  const putts: OcrPuttData[] = [0, 1, 2].map((i) =>
    normalizeOcrPutt(rawPutts[i], (i + 1) as 1 | 2 | 3)
  );

  const date = typeof r.date === "string" && r.date.trim() ? r.date.trim() : null;
  const course = typeof r.course === "string" && r.course.trim() ? r.course.trim() : null;

  return {
    hole:
      holeNum !== null && holeNum >= HOLE_MIN && holeNum <= HOLE_MAX
        ? Math.round(holeNum)
        : null,
    date,
    course,
    putts,
  };
}

/**
 * 撮影した複数カードにホール番号を割り当てる。
 *  - カードから読めた番号（1〜18）は尊重する（後半9ホールだけの撮影などに対応）
 *  - 読めなかった／既に使われた番号のカードは、直前のホールの次の未使用番号を補う
 *  - 18番まで埋まったら null（レビュー画面で手動修正 or スキップ）
 */
export function assignHoleNumbers(results: OcrHoleData[]): OcrHoleData[] {
  const used = new Set<number>();
  let cursor = 0;
  return results.map((r) => {
    const read = typeof r.hole === "number" && r.hole >= 1 && r.hole <= 18 ? r.hole : null;
    let hole: number | null = read !== null && !used.has(read) ? read : null;
    if (hole === null) {
      let candidate = cursor + 1;
      while (candidate <= 18 && used.has(candidate)) candidate++;
      hole = candidate <= 18 ? candidate : null;
    }
    if (hole !== null) {
      used.add(hole);
      cursor = hole;
    }
    return { ...r, hole };
  });
}

/** 複数枚（または単一）のOCR生出力をまとめて正規化する。 */
export function normalizeOcrResults(raw: unknown): OcrHoleData[] {
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(normalizeOcrHole);
}

// 複数ホールのOCRデータをまとめてアプリデータに変換
export function convertOcrBatchToHoles(
  ocrResults: OcrHoleData[]
): HoleData[] {
  const holes: HoleData[] = [];

  for (const ocrHole of ocrResults) {
    const hole = convertOcrHoleToAppHole(ocrHole);
    if (hole) {
      holes.push(hole);
    }
  }

  // ホール番号でソート
  holes.sort((a, b) => a.holeNumber - b.holeNumber);
  return holes;
}

// ─── 整合性チェック（保存前の警告） ────────────────────────────────────────

function puttHasData(p: OcrPuttData): boolean {
  return p.cupIn || p.result !== null || p.lengthMeters !== null || p.lineUD !== null || p.lineLR !== null;
}

/**
 * カードの記入ルールに照らして矛盾を検出し、日本語の警告文を返す（保存は妨げない）。
 * OCR の誤読（隣の枠を拾う、ラベル文字を印と誤認する等）はここで大半が浮かび上がる。
 */
export function validateOcrHole(hole: OcrHoleData): string[] {
  const warnings: string[] = [];
  const [p1, p2, p3] = hole.putts;
  const has = hole.putts.map(puttHasData);

  if (hole.hole === null) warnings.push("ホール番号が読み取れませんでした");
  if (hole.date !== null && !/^\d{8}$/.test(hole.date.replace(/\D/g, "")))
    warnings.push("日付が8桁（YYYYMMDD）になっていません");

  if (p1.cupIn && (has[1] || has[2])) warnings.push("1stでカップインなのに2nd以降に記入があります");
  if (p2?.cupIn && has[2]) warnings.push("2ndでカップインなのに3rdに記入があります");
  if (has[1] && !has[0]) warnings.push("2ndに記入がありますが1stが空です");
  if (has[2] && !has[1]) warnings.push("3rdに記入がありますが2ndが空です");

  const anyData = has.some(Boolean);
  if (anyData && !hole.putts.some((p) => p.cupIn)) warnings.push("カップインの印がどのパットにもありません");

  if (p1.lengthMeters !== null && p2?.lengthMeters !== null && p2.lengthMeters >= p1.lengthMeters)
    warnings.push("2ndの距離が1stより長くなっています");
  if (p2?.lengthMeters !== null && p3?.lengthMeters !== null && p3.lengthMeters >= p2.lengthMeters)
    warnings.push("3rdの距離が2ndより長くなっています");

  const results = hole.putts.map((p) => p.result).filter((r): r is NonNullable<typeof r> => r !== null);
  if (new Set(results).size > 1) warnings.push("Result（スコア）が複数のパットで異なります");

  const marked = hole.putts.filter((p) => has[hole.putts.indexOf(p)]);
  if (marked.length > 0 && marked.every((p) => p.lengthMeters === null))
    warnings.push("距離（Length）が1つも読み取れていません");

  return warnings;
}

// ─── 二重読み（別モデル）との比較 ─────────────────────────────────────────

/** 2つの読み取り結果を比べ、値が異なるフィールドのパスを返す（例: "putts[1].lengthMeters"） */
export function compareOcrHoles(a: OcrHoleData, b: OcrHoleData): string[] {
  const diffs: string[] = [];
  if (a.hole !== b.hole) diffs.push("hole");
  if ((a.date ?? "").replace(/\D/g, "") !== (b.date ?? "").replace(/\D/g, "")) diffs.push("date");
  if ((a.course ?? "").trim().toLowerCase() !== (b.course ?? "").trim().toLowerCase()) diffs.push("course");
  for (let i = 0; i < 3; i++) {
    const pa = a.putts[i];
    const pb = b.putts[i];
    if (!pa || !pb) continue;
    for (const key of ["cupIn", "result", "lengthMeters", "lineUD", "lineLR"] as const) {
      if (pa[key] !== pb[key]) diffs.push(`putts[${i}].${key}`);
    }
  }
  return diffs;
}

// ─── 端末側のピクセル判定（チェック枠）の適用 ──────────────────────────────

/** 排他枠の判定: 選ばれた index / null = 印なし / "unsure" = 判定不能 */
export type ChoiceHint = number | null | "unsure";
export type SectionMarkHints = {
  cupIn: boolean | "unsure";
  result: ChoiceHint;
  lineUD: ChoiceHint;
  lineLR: ChoiceHint;
};
/** 台形補正した画像の枠を画素で判定した結果。LLM の読み取りより優先して使う */
export type OcrMarkHints = { sections: [SectionMarkHints, SectionMarkHints, SectionMarkHints] };

const RESULT_BY_INDEX = ["E", "Ba", "P", "Bo", "D+"] as const;
const LINE_UD_BY_INDEX = ["F", "U", "D"] as const;
const LINE_LR_BY_INDEX = ["St", "L", "R"] as const;

/**
 * 画素判定を LLM の結果に重ねる。
 *  - 画素が「印あり」と判定した枠はそれを採用（LLM と違えば conflicts に記録）
 *  - 画素が「印なし」なのに LLM が値を出した場合は LLM 値を残しつつ conflicts に記録
 *    （○囲みなど枠の外側を通る印は画素側が見逃すことがあるため）
 *  - "unsure" は LLM に委ねる
 */
export function applyMarkHints(
  hole: OcrHoleData,
  hints: OcrMarkHints,
): { hole: OcrHoleData; conflicts: string[] } {
  const conflicts: string[] = [];
  const putts = hole.putts.map((putt, i) => {
    const h = hints.sections[i];
    if (!h) return putt;
    const next: OcrPuttData = { ...putt };

    if (h.cupIn !== "unsure") {
      if (h.cupIn) {
        if (!putt.cupIn) conflicts.push(`putts[${i}].cupIn`);
        next.cupIn = true;
      } else if (putt.cupIn) {
        conflicts.push(`putts[${i}].cupIn`);
      }
    }

    const resolve = <T extends string>(
      key: "result" | "lineUD" | "lineLR",
      hint: ChoiceHint,
      table: readonly T[],
    ): T | null | undefined => {
      if (hint === "unsure") return undefined; // LLM の値のまま
      const current = putt[key] as T | null;
      if (typeof hint === "number") {
        const value = table[hint];
        if (value === undefined) return undefined;
        if (current !== value) conflicts.push(`putts[${i}].${key}`);
        return value;
      }
      if (current !== null) conflicts.push(`putts[${i}].${key}`);
      return undefined;
    };
    const result = resolve("result", h.result, RESULT_BY_INDEX);
    if (result !== undefined) next.result = result;
    const lineUD = resolve("lineUD", h.lineUD, LINE_UD_BY_INDEX);
    if (lineUD !== undefined) next.lineUD = lineUD;
    const lineLR = resolve("lineLR", h.lineLR, LINE_LR_BY_INDEX);
    if (lineLR !== undefined) next.lineLR = lineLR;
    return next;
  });
  return { hole: { ...hole, putts }, conflicts: Array.from(new Set(conflicts)) };
}
