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
    missedDirection: null,
    touch: null,
    lineUD: convertLineUD(ocrPutt.lineUD),
    lineLR: convertLineLR(ocrPutt.lineLR),
    mental: null,
  };
}

// OCRホールデータをアプリのHoleDataに変換
export function convertOcrHoleToAppHole(
  ocrHole: OcrHoleData
): HoleData | null {
  if (!ocrHole.hole) return null;

  const putts: PuttData[] = [];
  let scoreResult: ScoreResult = "par";

  for (const ocrPutt of ocrHole.putts) {
    const putt = convertOcrPuttToAppPutt(ocrPutt);
    if (putt) {
      putts.push(putt);
    }
    // Resultが見つかったら採用（1st → 2nd → 3rd の順で最初に見つかったものを使用）
    if (!scoreResult || scoreResult === "par") {
      if (ocrPutt.result) {
        const converted = convertResult(ocrPutt.result);
        if (converted) scoreResult = converted;
      }
    }
  }

  return {
    holeNumber: ocrHole.hole,
    scoreResult,
    totalPutts: putts.length,
    putts,
  };
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
