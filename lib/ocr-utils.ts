// OCR読み取り結果をアプリのデータモデルに変換するユーティリティ

import type {
  ScoreResult,
  SlopeUpDown,
  SlopeLeftRight,
  MentalState,
  PuttStrength,
  MissedDirection,
  PuttData,
  HoleData,
} from "./types";
import { CARD_TO_APP } from "./types";

// OCRから返ってくるパットデータの型（カードの構造に完全対応）
export interface OcrPuttData {
  puttNumber: 1 | 2 | 3;
  cupIn: boolean; // In チェックボックス（塗りつぶし判定）
  distPrev: number | null; // Dist(prev) yd（前のパットからの残り距離、3桁まで）
  result: "E" | "Ba" | "P" | "Bo" | "D+" | null; // Putt/Result（カード上"Putt:"ラベル、塗りつぶし判定）
  lengthSteps: number | null; // Length st（歩数、2桁）
  lengthMeters: number | null; // Length m（メートル直入力、2桁）※カード上では "m" 単位
  missedDirection: MissedDirection | null; // Missed Direction 1-5（塗りつぶし判定）
  touch: PuttStrength | null; // Touch 1-5（塗りつぶし判定）
  lineUD: "F" | "U" | "D" | "UD" | "DU" | null; // Line(U/D)（塗りつぶし判定）
  lineLR: "St" | "L" | "R" | "LR" | "RL" | null; // Line(L/R)（塗りつぶし判定）
  mental: "P" | 1 | 2 | 3 | 4 | 5 | "N" | null; // Mental(P/N)（塗りつぶし判定）
}

// OCRから返ってくるホールデータの型
export interface OcrHoleData {
  hole: number | null;
  date: string | null;
  course: string | null;
  putts: OcrPuttData[];
}

// Line(U/D) カード表記 → アプリ内部値
function convertLineUD(val: "F" | "U" | "D" | "UD" | "DU" | null): SlopeUpDown {
  if (!val) return "flat";
  return CARD_TO_APP.lineUD[val] || "flat";
}

// Line(L/R) カード表記 → アプリ内部値
function convertLineLR(val: "St" | "L" | "R" | "LR" | "RL" | null): SlopeLeftRight {
  if (!val) return "straight";
  return CARD_TO_APP.lineLR[val] || "straight";
}

// Mental変換（未記入はnullを返す。以前はデフォルト3を返していたが、未入力データの混入を防止）
function convertMental(mental: "P" | 1 | 2 | 3 | 4 | 5 | "N" | null): MentalState | null {
  if (mental === null) return null;
  return mental;
}

// Result カード表記 → アプリ内部値
function convertResult(result: "E" | "Ba" | "P" | "Bo" | "D+" | null): ScoreResult | null {
  if (!result) return null;
  return CARD_TO_APP.result[result] || null;
}

// OCRパットデータをアプリのPuttDataに変換
export function convertOcrPuttToAppPutt(
  ocrPutt: OcrPuttData,
  strideLength: number = 0.7
): PuttData | null {
  // データが全てnull/falseの場合はスキップ（空のパットセクション）
  const hasData =
    ocrPutt.cupIn ||
    ocrPutt.distPrev !== null ||
    ocrPutt.result !== null ||
    ocrPutt.lengthSteps !== null ||
    ocrPutt.lengthMeters !== null ||
    ocrPutt.missedDirection !== null ||
    ocrPutt.touch !== null ||
    ocrPutt.lineUD !== null ||
    ocrPutt.lineLR !== null ||
    ocrPutt.mental !== null;

  if (!hasData) return null;

  const steps = ocrPutt.lengthSteps || 0;
  // distanceMeters: 歩数から計算。歩数がない場合はカード記入のメートル値を使用
  const distanceMeters =
    steps > 0 ? steps * strideLength : (ocrPutt.lengthMeters || 0);

  return {
    strokeNumber: ocrPutt.puttNumber,
    cupIn: ocrPutt.cupIn,
    distPrev: ocrPutt.distPrev,
    result: convertResult(ocrPutt.result),
    lengthSteps: ocrPutt.lengthSteps,
    lengthMeters: ocrPutt.lengthMeters,
    distanceMeters,
    missedDirection: ocrPutt.missedDirection,
    touch: ocrPutt.touch,
    lineUD: convertLineUD(ocrPutt.lineUD),
    lineLR: convertLineLR(ocrPutt.lineLR),
    mental: convertMental(ocrPutt.mental),
  };
}

// OCRホールデータをアプリのHoleDataに変換
export function convertOcrHoleToAppHole(
  ocrHole: OcrHoleData,
  strideLength: number = 0.7
): HoleData | null {
  if (!ocrHole.hole) return null;

  const putts: PuttData[] = [];
  let scoreResult: ScoreResult = "par";

  for (const ocrPutt of ocrHole.putts) {
    const putt = convertOcrPuttToAppPutt(ocrPutt, strideLength);
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
  ocrResults: OcrHoleData[],
  strideLength: number = 0.7
): HoleData[] {
  const holes: HoleData[] = [];

  for (const ocrHole of ocrResults) {
    const hole = convertOcrHoleToAppHole(ocrHole, strideLength);
    if (hole) {
      holes.push(hole);
    }
  }

  // ホール番号でソート
  holes.sort((a, b) => a.holeNumber - b.holeNumber);
  return holes;
}
