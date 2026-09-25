/**
 * 1ホールぶんのパット記録の組み立てと読み取りのルール（カード v3 と手入力で共通）。
 *
 *  - 「何のパット？」は 1打目のパットが入れば何のスコアか（バーディパット＝birdie）。
 *    2打目以降は 1つずつ悪くなる（バーディパットを外せば次はパーパット）。
 *  - 最後に記録したパットがカップイン。総パット数が記録より多い（4パット以上）ときは
 *    記録した最後のパットも外れている。
 *  - ホールのスコア = 何のパット + (総パット数 − 1)。
 */
import type { HoleData, MissLength, PuttData, ScoreResult, SlopeLeftRight, SlopeUpDown } from "./types";

export const SCORE_ORDER: ScoreResult[] = ["eagle", "birdie", "par", "bogey", "double_bogey_plus"];

export function shiftScore(base: ScoreResult, strokes: number): ScoreResult {
  const i = Math.min(SCORE_ORDER.length - 1, Math.max(0, SCORE_ORDER.indexOf(base) + strokes));
  return SCORE_ORDER[i];
}

/** ホールの1打目のパットが何のパットだったか（未記入は null） */
export function puttForOfHole(hole: HoleData): ScoreResult | null {
  return hole.putts.find((p) => p.strokeNumber === 1)?.result ?? null;
}

export type PuttEntry = {
  meters: number | null;
  lineUD?: SlopeUpDown | null;
  lineLR?: SlopeLeftRight | null;
  missLength?: MissLength | null;
};

export type HoleEntry = {
  holeNumber: number;
  puttFor: ScoreResult | null;
  /** 総パット数（0 = チップイン等でパットなし） */
  totalPutts: number;
  /** 1st, 2nd, 3rd（4打目以降は記録しない） */
  putts: PuttEntry[];
};

/** 入力（カードの1行・手入力フォーム）から保存用の HoleData を作る */
export function buildHole(entry: HoleEntry): HoleData {
  const total = Math.max(0, Math.round(entry.totalPutts));
  const recorded = entry.putts.slice(0, Math.min(3, total));
  const putts: PuttData[] = recorded.map((p, i) => {
    const strokeNumber = (i + 1) as 1 | 2 | 3;
    const cupIn = strokeNumber === total;
    const meters = p.meters != null && p.meters > 0 ? Math.round(p.meters * 10) / 10 : null;
    return {
      strokeNumber,
      cupIn,
      distPrev: null,
      result: entry.puttFor ? shiftScore(entry.puttFor, i) : null,
      lengthSteps: null,
      lengthMeters: meters,
      distanceMeters: meters ?? 0,
      lineUD: p.lineUD ?? null,
      lineLR: p.lineLR ?? null,
      missLength: cupIn ? null : (p.missLength ?? null),
    };
  });
  const base = entry.puttFor ?? "par";
  return {
    holeNumber: entry.holeNumber,
    scoreResult: total > 0 ? shiftScore(base, total - 1) : base,
    totalPutts: total,
    putts,
  };
}

/** 保存済みの HoleData を入力フォームの形に戻す */
export function holeToEntry(hole: HoleData): HoleEntry {
  const sorted = [...hole.putts].sort((a, b) => a.strokeNumber - b.strokeNumber);
  return {
    holeNumber: hole.holeNumber,
    puttFor: puttForOfHole(hole),
    totalPutts: hole.totalPutts,
    putts: sorted.map((p) => ({
      meters: p.lengthMeters ?? (p.distanceMeters > 0 ? p.distanceMeters : null),
      lineUD: p.lineUD,
      lineLR: p.lineLR,
      missLength: p.missLength ?? null,
    })),
  };
}

/** パットの距離（m）。未記入は null */
export function puttMeters(p: PuttData): number | null {
  if (p.distanceMeters > 0) return p.distanceMeters;
  if (p.lengthMeters != null && p.lengthMeters > 0) return p.lengthMeters;
  return null;
}
