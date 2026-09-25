/**
 * パッティング分析 v3（ストロークス・ゲインド中心）。
 *
 * 考え方（docs/ANALYTICS.md に詳しい説明）:
 *  - 「平均パット数」はアプローチの寄り具合に大きく左右されるので、技術の評価には使わない。
 *  - 基準（ツアー / スクラッチ / HC15）の「その距離から平均何打で入れるか」＝期待パット数 E(d) と比べ、
 *    1打ごとの得失 SG = E(打つ前の距離) − 1 − E(打った後の距離) を積み上げる。
 *    カード v3 は全パットの距離を記録するので、1打ごとに評価できる（ロングパットの寄せと、ショートパットの決定力を分けて見られる）。
 *  - パット数 = 基準の期待パット数（＝ファーストパットの距離の難しさ） − SG（＝パッティングの腕）に分解して見せる。
 */
import { SCORE_ORDER, puttForOfHole, puttMeters } from "./putting";
import type { HoleData, MissLength, PuttData, Round, ScoreResult, SlopeLeftRight, SlopeUpDown } from "./types";

// ─── 基準（ベースライン） ────────────────────────────────────────────────────

export type BaselineId = "tour" | "scratch" | "hc15";

export const BASELINES: Record<BaselineId, { label: string; short: string; note: string }> = {
  tour: { label: "PGAツアー平均", short: "ツアー", note: "Broadie『Every Shot Counts』の距離別期待パット数（ShotLink）" },
  scratch: { label: "スクラッチ（HC0）", short: "HC0", note: "ツアー基準をもとにした概算" },
  hc15: { label: "アマ平均（HC15前後）", short: "HC15", note: "ツアー基準をもとにした概算" },
};

// 距離(m) → 期待パット数。区間は線形補間、両端は外挿しない（端の値に張り付く＋長距離は緩やかに増やす）
const EXPECTED_PUTTS: Record<BaselineId, [number, number][]> = {
  tour: [
    [0.3, 1.0], [0.61, 1.01], [0.91, 1.04], [1.22, 1.13], [1.52, 1.23], [1.83, 1.34], [2.13, 1.42],
    [2.44, 1.5], [2.74, 1.56], [3.05, 1.61], [4.57, 1.78], [6.1, 1.87], [9.14, 1.98], [12.19, 2.06],
    [15.24, 2.14], [18.29, 2.21], [27.43, 2.4],
  ],
  scratch: [
    [0.3, 1.0], [0.61, 1.02], [0.91, 1.07], [1.22, 1.17], [1.52, 1.28], [1.83, 1.39], [2.13, 1.47],
    [2.44, 1.55], [3.05, 1.66], [4.57, 1.83], [6.1, 1.93], [9.14, 2.05], [12.19, 2.14], [15.24, 2.22],
    [18.29, 2.3], [27.43, 2.5],
  ],
  hc15: [
    [0.3, 1.0], [0.61, 1.04], [0.91, 1.12], [1.22, 1.24], [1.52, 1.36], [1.83, 1.47], [2.13, 1.56],
    [2.44, 1.63], [3.05, 1.74], [4.57, 1.92], [6.1, 2.02], [9.14, 2.15], [12.19, 2.26], [15.24, 2.36],
    [18.29, 2.45], [27.43, 2.65],
  ],
};

// 距離(m) → 1パットで入る確率（%）
const MAKE_RATE: Record<BaselineId, [number, number][]> = {
  tour: [
    [0.3, 100], [0.61, 99], [0.91, 96], [1.22, 88], [1.52, 77], [1.83, 66], [2.13, 58], [2.44, 50],
    [3.05, 40], [4.57, 23], [6.1, 15], [9.14, 7], [12.19, 5], [15.24, 3], [18.29, 2], [27.43, 1],
  ],
  scratch: [
    [0.3, 100], [0.61, 98], [0.91, 92], [1.22, 82], [1.52, 70], [1.83, 60], [2.13, 51], [2.44, 44],
    [3.05, 34], [4.57, 19], [6.1, 12], [9.14, 6], [12.19, 4], [15.24, 2.5], [18.29, 2], [27.43, 1],
  ],
  hc15: [
    [0.3, 99], [0.61, 95], [0.91, 85], [1.22, 72], [1.52, 60], [1.83, 50], [2.13, 42], [2.44, 36],
    [3.05, 27], [4.57, 15], [6.1, 9], [9.14, 4], [12.19, 3], [15.24, 2], [18.29, 1.5], [27.43, 1],
  ],
};

function interpolate(table: [number, number][], x: number, extrapolateSlope = 0): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  const [xl, yl] = table[table.length - 1];
  return yl + (x - xl) * extrapolateSlope;
}

/** その距離から平均何打で入れるか */
export function expectedPutts(meters: number, baseline: BaselineId): number {
  if (meters <= 0) return 0;
  return interpolate(EXPECTED_PUTTS[baseline], meters, 0.012);
}

/** その距離からの1パット率（%） */
export function baselineMakeRate(meters: number, baseline: BaselineId): number {
  return interpolate(MAKE_RATE[baseline], meters);
}

// ─── 観測データの取り出し ────────────────────────────────────────────────────

export type PuttObs = {
  roundId: string;
  holeNumber: number;
  stroke: number;
  meters: number;
  holed: boolean;
  lineUD: SlopeUpDown | null;
  lineLR: SlopeLeftRight | null;
  missLength: MissLength | null;
  /** 次のパットの距離（外れて次の距離が分かる場合） */
  leaveMeters: number | null;
  /** この1打の SG（次の距離が分からなければ null） */
  sg: number | null;
  /** 何のパットか（この打の時点） */
  puttFor: ScoreResult | null;
};

export type HoleObs = {
  round: Round;
  hole: HoleData;
  puttFor: ScoreResult | null;
  total: number;
  firstMeters: number | null;
  /** E(1st距離) − 総パット数 */
  sg: number | null;
  expected: number | null;
  putts: PuttObs[];
};

function sortedPutts(hole: HoleData): PuttData[] {
  return [...hole.putts].sort((a, b) => a.strokeNumber - b.strokeNumber);
}

export function holeObservations(rounds: Round[], baseline: BaselineId): HoleObs[] {
  const out: HoleObs[] = [];
  for (const round of rounds) {
    for (const hole of round.holes) {
      if (hole.totalPutts <= 0) continue;
      const putts = sortedPutts(hole);
      const puttFor = puttForOfHole(hole);
      const firstMeters = putts[0] ? puttMeters(putts[0]) : null;
      const expected = firstMeters != null ? expectedPutts(firstMeters, baseline) : null;
      const obs: PuttObs[] = [];
      putts.forEach((p, i) => {
        const meters = puttMeters(p);
        if (meters == null) return;
        const holed = p.cupIn || p.strokeNumber === hole.totalPutts;
        const next = putts[i + 1];
        const leave = next ? puttMeters(next) : null;
        let sg: number | null = null;
        if (holed) sg = expectedPutts(meters, baseline) - 1;
        else if (leave != null) sg = expectedPutts(meters, baseline) - 1 - expectedPutts(leave, baseline);
        obs.push({
          roundId: round.id,
          holeNumber: hole.holeNumber,
          stroke: p.strokeNumber,
          meters,
          holed,
          lineUD: p.lineUD,
          lineLR: p.lineLR,
          missLength: holed ? null : (p.missLength ?? null),
          leaveMeters: holed ? null : leave,
          sg,
          puttFor: p.result ?? null,
        });
      });
      out.push({
        round,
        hole,
        puttFor,
        total: hole.totalPutts,
        firstMeters,
        expected,
        sg: expected != null ? expected - hole.totalPutts : null,
        putts: obs,
      });
    }
  }
  return out;
}

// ─── 統計の小道具 ──────────────────────────────────────────────────────────

/** 二項比率の Wilson 95% 区間（%） */
export function wilson(successes: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 100 };
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half) * 100, high: Math.min(1, center + half) * 100 };
}

/** 符号付き（マイナスは全角の −） */
function signed(v: number, digits: number): string {
  const a = Math.abs(v).toFixed(digits);
  return Number(a) === 0 ? a : `${v > 0 ? "+" : "−"}${a}`;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

// ─── 距離帯 ────────────────────────────────────────────────────────────────

export type Band = { key: string; label: string; min: number; max: number };

/** 決定率カーブ用（短い距離を細かく） */
export const MAKE_BANDS: Band[] = [
  { key: "0-1", label: "〜1m", min: 0, max: 1 },
  { key: "1-1.5", label: "1〜1.5m", min: 1, max: 1.5 },
  { key: "1.5-2", label: "1.5〜2m", min: 1.5, max: 2 },
  { key: "2-3", label: "2〜3m", min: 2, max: 3 },
  { key: "3-4.5", label: "3〜4.5m", min: 3, max: 4.5 },
  { key: "4.5-6", label: "4.5〜6m", min: 4.5, max: 6 },
  { key: "6-9", label: "6〜9m", min: 6, max: 9 },
  { key: "9-12", label: "9〜12m", min: 9, max: 12 },
  { key: "12+", label: "12m〜", min: 12, max: Infinity },
];

/** SG の内訳用（練習メニューに対応する粗い区分） */
export const SG_BANDS: Band[] = [
  { key: "short", label: "〜2m（決め切る）", min: 0, max: 2 },
  { key: "mid", label: "2〜6m（チャンス）", min: 2, max: 6 },
  { key: "long", label: "6m〜（寄せる）", min: 6, max: Infinity },
];

const inBand = (m: number, b: Band) => m >= b.min && m < b.max;

function bandMid(b: Band): number {
  return Number.isFinite(b.max) ? (b.min + b.max) / 2 : b.min * 1.3;
}

// ─── 集計 ──────────────────────────────────────────────────────────────────

export type SgSummary = {
  holes: number;
  rounds: number;
  /** 18ホールあたり */
  sgPer18: number;
  actualPer18: number;
  /** 基準のゴルファーが同じファーストパットから打った場合のパット数（18H あたり） */
  expectedPer18: number;
  byBand: { band: Band; putts: number; sgTotal: number; sgPer18: number }[];
};

export function sgSummary(holes: HoleObs[]): SgSummary {
  const withSg = holes.filter((h) => h.sg != null);
  const n = withSg.length;
  const roundIds = new Set(withSg.map((h) => h.round.id));
  const puttObs = holes.flatMap((h) => h.putts).filter((p) => p.sg != null);
  const scale = n > 0 ? 18 / n : 0;
  return {
    holes: n,
    rounds: roundIds.size,
    sgPer18: sum(withSg.map((h) => h.sg!)) * scale,
    actualPer18: sum(withSg.map((h) => h.total)) * scale,
    expectedPer18: sum(withSg.map((h) => h.expected!)) * scale,
    byBand: SG_BANDS.map((band) => {
      const ps = puttObs.filter((p) => inBand(p.meters, band));
      const total = sum(ps.map((p) => p.sg!));
      return { band, putts: ps.length, sgTotal: total, sgPer18: total * scale };
    }),
  };
}

export type MakeCurvePoint = {
  band: Band;
  attempts: number;
  makes: number;
  rate: number;
  ci: { low: number; high: number };
  baseline: number;
};

/** 全パット（1st に限らない）の距離帯別カップイン率 */
export function makeCurve(holes: HoleObs[], baseline: BaselineId): MakeCurvePoint[] {
  const puttObs = holes.flatMap((h) => h.putts);
  return MAKE_BANDS.map((band) => {
    const ps = puttObs.filter((p) => inBand(p.meters, band));
    const makes = ps.filter((p) => p.holed).length;
    return {
      band,
      attempts: ps.length,
      makes,
      rate: ps.length ? (makes / ps.length) * 100 : 0,
      ci: wilson(makes, ps.length),
      baseline: baselineMakeRate(bandMid(band), baseline),
    };
  });
}

export type LagStats = {
  /** 6m 以上の 1st パット数 */
  attempts: number;
  avgLeave: number;
  /** 1m 以内に寄った割合 */
  within1m: number;
  threePuttRate: number;
  /** 外れたうちショートの割合（短/長の記入があるもの） */
  shortRate: number | null;
  missRecorded: number;
  /** 残り距離 / 元の距離 */
  leaveRatio: number;
  byBand: { band: Band; attempts: number; avgLeave: number; threePuttRate: number }[];
};

export const LAG_BANDS: Band[] = [
  { key: "6-9", label: "6〜9m", min: 6, max: 9 },
  { key: "9-12", label: "9〜12m", min: 9, max: 12 },
  { key: "12-15", label: "12〜15m", min: 12, max: 15 },
  { key: "15+", label: "15m〜", min: 15, max: Infinity },
];

export function lagStats(holes: HoleObs[]): LagStats {
  const lags = holes.filter((h) => h.firstMeters != null && h.firstMeters >= 6);
  const leaves = lags.map((h) => h.putts[0]?.leaveMeters ?? (h.total === 1 ? 0 : null));
  const known = lags.map((h, i) => ({ h, leave: leaves[i] })).filter((x): x is { h: HoleObs; leave: number } => x.leave != null);
  const missed = lags.flatMap((h) => (h.putts[0] && !h.putts[0].holed && h.putts[0].missLength ? [h.putts[0].missLength] : []));
  return {
    attempts: lags.length,
    avgLeave: mean(known.map((x) => x.leave)),
    within1m: known.length ? (known.filter((x) => x.leave <= 1).length / known.length) * 100 : 0,
    threePuttRate: lags.length ? (lags.filter((h) => h.total >= 3).length / lags.length) * 100 : 0,
    shortRate: missed.length ? (missed.filter((m) => m === "short").length / missed.length) * 100 : null,
    missRecorded: missed.length,
    leaveRatio: mean(known.map((x) => x.leave / x.h.firstMeters!)),
    byBand: LAG_BANDS.map((band) => {
      const b = known.filter((x) => inBand(x.h.firstMeters!, band));
      const all = lags.filter((h) => inBand(h.firstMeters!, band));
      return {
        band,
        attempts: all.length,
        avgLeave: mean(b.map((x) => x.leave)),
        threePuttRate: all.length ? (all.filter((h) => h.total >= 3).length / all.length) * 100 : 0,
      };
    }),
  };
}

export type PuttForStats = {
  puttFor: ScoreResult;
  holes: number;
  avgFirstMeters: number;
  /** 1パットで決めた割合 */
  conversion: number;
  threePuttRate: number;
  avgPutts: number;
};

export function puttForStats(holes: HoleObs[]): PuttForStats[] {
  return SCORE_ORDER.map((puttFor) => {
    const hs = holes.filter((h) => h.puttFor === puttFor);
    return {
      puttFor,
      holes: hs.length,
      avgFirstMeters: mean(hs.flatMap((h) => (h.firstMeters != null ? [h.firstMeters] : []))),
      conversion: hs.length ? (hs.filter((h) => h.total === 1).length / hs.length) * 100 : 0,
      threePuttRate: hs.length ? (hs.filter((h) => h.total >= 3).length / hs.length) * 100 : 0,
      avgPutts: mean(hs.map((h) => h.total)),
    };
  }).filter((s) => s.holes > 0);
}

/** パーオン（何のパット＝イーグル/バーディ）したホールの平均パット */
export function puttsPerGir(holes: HoleObs[]): { holes: number; avg: number } {
  const gir = holes.filter((h) => h.puttFor === "eagle" || h.puttFor === "birdie");
  return { holes: gir.length, avg: mean(gir.map((h) => h.total)) };
}

export type LineCell = { putts: number; makes: number; sgPerPutt: number };

export type LineStats = {
  ud: Record<"flat" | "uphill" | "downhill", LineCell>;
  lr: Record<"straight" | "left" | "right", LineCell>;
  /** [ud][lr] */
  matrix: Record<string, Record<string, LineCell>>;
};

const UD_KEYS = ["flat", "uphill", "downhill"] as const;
const LR_KEYS = ["straight", "left", "right"] as const;

function lineCell(ps: PuttObs[]): LineCell {
  const withSg = ps.filter((p) => p.sg != null);
  return { putts: ps.length, makes: ps.filter((p) => p.holed).length, sgPerPutt: mean(withSg.map((p) => p.sg!)) };
}

/** 傾斜・曲がり別の SG/打（距離の違いを補正済み。7m 以内のパット） */
export function lineStats(holes: HoleObs[]): LineStats {
  const ps = holes.flatMap((h) => h.putts).filter((p) => p.meters <= 7);
  const ud = Object.fromEntries(UD_KEYS.map((k) => [k, lineCell(ps.filter((p) => p.lineUD === k))])) as LineStats["ud"];
  const lr = Object.fromEntries(LR_KEYS.map((k) => [k, lineCell(ps.filter((p) => p.lineLR === k))])) as LineStats["lr"];
  const matrix: LineStats["matrix"] = {};
  for (const u of UD_KEYS) {
    matrix[u] = {};
    for (const l of LR_KEYS) matrix[u][l] = lineCell(ps.filter((p) => p.lineUD === u && p.lineLR === l));
  }
  return { ud, lr, matrix };
}

export type MissTendency = {
  recorded: number;
  shortRate: number;
  byUD: Record<"flat" | "uphill" | "downhill", { recorded: number; shortRate: number }>;
};

/** 外れた 1st パットがショートかオーバーか（カード v3 の「短/長」） */
export function missTendency(holes: HoleObs[]): MissTendency {
  const firsts = holes.flatMap((h) => (h.putts[0] && !h.putts[0].holed && h.putts[0].missLength ? [h.putts[0]] : []));
  const rate = (ps: PuttObs[]) => (ps.length ? (ps.filter((p) => p.missLength === "short").length / ps.length) * 100 : 0);
  return {
    recorded: firsts.length,
    shortRate: rate(firsts),
    byUD: Object.fromEntries(
      UD_KEYS.map((k) => {
        const ps = firsts.filter((p) => p.lineUD === k);
        return [k, { recorded: ps.length, shortRate: rate(ps) }];
      }),
    ) as MissTendency["byUD"],
  };
}

export type RoundSg = {
  roundId: string;
  date: string;
  label: string;
  courseName: string;
  holes: number;
  putts: number;
  sgPer18: number;
  threePutts: number;
};

export function roundSgSeries(holes: HoleObs[]): RoundSg[] {
  const byRound = new Map<string, HoleObs[]>();
  for (const h of holes) {
    const list = byRound.get(h.round.id) ?? [];
    list.push(h);
    byRound.set(h.round.id, list);
  }
  return [...byRound.values()]
    .map((hs) => {
      const r = hs[0].round;
      const withSg = hs.filter((h) => h.sg != null);
      const d = new Date(`${r.date}T00:00:00`);
      return {
        roundId: r.id,
        date: r.date,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        courseName: r.courseName,
        holes: hs.length,
        putts: sum(hs.map((h) => h.total)),
        sgPer18: withSg.length ? (sum(withSg.map((h) => h.sg!)) / withSg.length) * 18 : 0,
        threePutts: hs.filter((h) => h.total >= 3).length,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type GroupSg = { label: string; rounds: number; holes: number; sgPer18: number; puttsPer18: number };

/** 条件（パター・芝・速さ・コース）ごとの SG/18H（ファーストパット距離の違いを補正した比較） */
export function groupSg(holes: HoleObs[], key: (r: Round) => string | null): GroupSg[] {
  const groups = new Map<string, HoleObs[]>();
  for (const h of holes) {
    const k = key(h.round);
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push(h);
    groups.set(k, list);
  }
  return [...groups.entries()]
    .map(([label, hs]) => {
      const withSg = hs.filter((h) => h.sg != null);
      return {
        label,
        rounds: new Set(hs.map((h) => h.round.id)).size,
        holes: hs.length,
        sgPer18: withSg.length ? (sum(withSg.map((h) => h.sg!)) / withSg.length) * 18 : 0,
        puttsPer18: (sum(hs.map((h) => h.total)) / hs.length) * 18,
      };
    })
    .sort((a, b) => b.holes - a.holes);
}

export function stimpBand(stimp: number | undefined | null): string | null {
  if (!stimp) return null;
  if (stimp < 8) return "〜8ft";
  if (stimp < 9) return "8〜9ft";
  if (stimp < 10) return "9〜10ft";
  if (stimp < 11) return "10〜11ft";
  return "11ft〜";
}

// ─── 練習の優先順位 ──────────────────────────────────────────────────────────

export type Priority = {
  id: string;
  title: string;
  /** 1ラウンドあたり何打の伸びしろがあるか（基準との差。正の値＝失っている） */
  strokesPer18: number;
  evidence: string;
  drill: string;
  sample: number;
};

/**
 * 基準との差（失っている打数）が大きい順に練習テーマを返す。
 * 失点が小さい・サンプルが少ないものは出さない。
 */
export function practicePriorities(holes: HoleObs[], baseline: BaselineId): Priority[] {
  const sg = sgSummary(holes);
  if (sg.holes === 0) return [];
  const out: Priority[] = [];
  const band = (key: string) => sg.byBand.find((b) => b.band.key === key)!;

  const short = band("short");
  if (short.putts >= 8) {
    const curve = makeCurve(holes, baseline).filter((c) => c.band.max <= 2 && c.attempts > 0);
    const made = sum(curve.map((c) => c.makes));
    const att = sum(curve.map((c) => c.attempts));
    out.push({
      id: "short",
      title: "2m以内を決め切る",
      strokesPer18: -short.sgPer18,
      evidence: `2m以内の成功 ${made}/${att}（${att ? ((made / att) * 100).toFixed(0) : 0}%）`,
      drill: "1m・1.5m・2mの3地点から、傾斜を変えて各10球。連続成功が途切れたら最初から（ゲートドリルでフェース向きも確認）",
      sample: short.putts,
    });
  }

  const mid = band("mid");
  if (mid.putts >= 8) {
    out.push({
      id: "mid",
      title: "2〜6mのチャンスを入れる",
      strokesPer18: -mid.sgPer18,
      evidence: `2〜6mのパット ${mid.putts}回で合計 ${signed(mid.sgTotal, 1)}打`,
      drill: "3〜5mで曲がるラインを1つ決め、狙う点（打ち出し方向）にティーを置いて20球。入った数と外れた側を記録",
      sample: mid.putts,
    });
  }

  const long = band("long");
  const lag = lagStats(holes);
  if (long.putts >= 8) {
    const tendency = lag.shortRate == null ? "" : lag.shortRate >= 60 ? "・ショートが多い" : lag.shortRate <= 40 ? "・オーバーが多い" : "";
    out.push({
      id: "lag",
      title: "ロングパットを寄せる",
      strokesPer18: -long.sgPer18,
      evidence: `6m以上から平均 ${lag.avgLeave.toFixed(1)}m に寄せ、1m以内 ${lag.within1m.toFixed(0)}%${tendency}`,
      drill:
        lag.shortRate != null && lag.shortRate >= 60
          ? "10・15・20mから、カップの40cm奥にティーを置いてそこに止める距離感ドリル（届かせる意識）"
          : "10・15・20mから、カップを中心に半径1mの円に止めるドリル。各5球×3セットで円内率を記録",
      sample: long.putts,
    });
  }

  const lines = lineStats(holes);
  const lineCandidates = [
    ...UD_KEYS.map((k) => ({ key: `ud-${k}`, label: { flat: "平らな", uphill: "上りの", downhill: "下りの" }[k], cell: lines.ud[k] })),
    ...LR_KEYS.map((k) => ({ key: `lr-${k}`, label: { straight: "まっすぐな", left: "左に曲がる", right: "右に曲がる" }[k], cell: lines.lr[k] })),
  ].filter((c) => c.cell.putts >= 8);
  if (lineCandidates.length > 0) {
    const worst = [...lineCandidates].sort((a, b) => a.cell.sgPerPutt - b.cell.sgPerPutt)[0];
    // 1ラウンドでそのラインを何回打つか × 1打あたりの損
    const perRound = (worst.cell.putts / sg.holes) * 18;
    out.push({
      id: `line-${worst.key}`,
      title: `${worst.label}ラインを克服する`,
      strokesPer18: -worst.cell.sgPerPutt * perRound,
      evidence: `7m以内で1打あたり ${signed(worst.cell.sgPerPutt, 2)}打（${worst.cell.putts}回）`,
      drill: `${worst.label}ラインを練習グリーンで探し、1.5m と 3m から各10球。外れた側（高い側/低い側）をメモして読みの癖を確認`,
      sample: worst.cell.putts,
    });
  }

  return out.filter((p) => p.strokesPer18 > 0.1).sort((a, b) => b.strokesPer18 - a.strokesPer18).slice(0, 3);
}

// ─── 3D グリーン用の点 ─────────────────────────────────────────────────────

export type GreenPoint = {
  /** カップからの距離（m） */
  meters: number;
  /** カップを中心にした角度（ラジアン）。0 = 手前（上り）、π = 奥（下り）、+ = 右から、− = 左から */
  angle: number;
  /** 表示用のずらし量（−0.5〜0.5） */
  jitter: number;
  outcome: "one" | "two" | "three";
  lineUD: SlopeUpDown | null;
  lineLR: SlopeLeftRight | null;
  leaveMeters: number | null;
  missLength: MissLength | null;
  roundId: string;
  holeNumber: number;
  date: string;
};

// 決定的な擬似乱数（同じデータなら毎回同じ配置）
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * 1st パットをカップ周りの「どこから打ったか」に配置する。
 * 上り＝カップの手前、下り＝奥、左に曲がる＝右側から、右に曲がる＝左側から。
 * 記入が無い要素は散らす。
 */
export function greenPoints(holes: HoleObs[]): GreenPoint[] {
  return holes.flatMap((h) => {
    const first = h.putts[0];
    if (!first || h.firstMeters == null) return [];
    const jitter = hash01(`${h.round.id}-${h.hole.holeNumber}`) - 0.5;
    const ud = first.lineUD;
    const lr = first.lineLR;
    let base: number;
    if (ud === "uphill") base = 0;
    else if (ud === "downhill") base = Math.PI;
    else base = Math.PI / 2;
    // 左右: 左に曲がるラインはカップの右側から打つことが多い → 角度を右へ
    let side = 0;
    if (lr === "left") side = 1;
    else if (lr === "right") side = -1;
    let angle: number;
    if (ud === "flat" || ud == null) {
      angle = side === 0 ? (jitter < 0 ? -1 : 1) * (Math.PI / 2 + jitter * 1.2) : side * (Math.PI / 2 + jitter * 0.9);
    } else {
      const spread = side === 0 ? jitter * 0.6 : side * (0.55 + Math.abs(jitter) * 0.5);
      angle = ud === "uphill" ? base + spread : base - spread;
    }
    return [
      {
        meters: h.firstMeters,
        angle,
        jitter: hash01(`${h.round.id}-${h.hole.holeNumber}-r`) - 0.5,
        outcome: h.total <= 1 ? "one" : h.total === 2 ? "two" : "three",
        lineUD: ud,
        lineLR: lr,
        leaveMeters: first.leaveMeters,
        missLength: first.missLength,
        roundId: h.round.id,
        holeNumber: h.hole.holeNumber,
        date: h.round.date,
      },
    ];
  });
}
