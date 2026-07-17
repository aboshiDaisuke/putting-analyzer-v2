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

// Line(U/D) カード表記 → アプリ内部値
function convertLineUD(val: "F" | "U" | "D" | null): SlopeUpDown {
  if (!val) return "flat";
  return CARD_TO_APP.lineUD[val] || "flat";
}

// Line(L/R) カード表記 → アプリ内部値
function convertLineLR(val: "St" | "L" | "R" | null): SlopeLeftRight {
  if (!val) return "straight";
  return CARD_TO_APP.lineLR[val] || "straight";
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
