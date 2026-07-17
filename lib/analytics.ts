import {
  Round,
  HoleData,
  PuttData,
  AnalyticsSummary,
  DistanceStats,
  SlopeStats,
  GreenSpeedStats,
  SlopeLeftRightStatsItem,
  MetadataAvgPuttsItem,
  RoundTrendItem,
  PracticeInsight,
  LagAnalysis,
  SlopeUpDown,
  SlopeLeftRight,
  LABELS,
} from './types';

// 距離範囲の定義（メートル）
const DISTANCE_RANGES = [
  { min: 0, max: 1, label: '0-1m' },
  { min: 1, max: 2, label: '1-2m' },
  { min: 2, max: 3, label: '2-3m' },
  { min: 3, max: 5, label: '3-5m' },
  { min: 5, max: 7, label: '5-7m' },
  { min: 7, max: 10, label: '7-10m' },
  { min: 10, max: Infinity, label: '10m+' },
];

// グリーンスピード範囲の定義（フィート）
const SPEED_RANGES = [
  { min: 0, max: 8, label: '~8ft' },
  { min: 8, max: 9, label: '8-9ft' },
  { min: 9, max: 10, label: '9-10ft' },
  { min: 10, max: 11, label: '10-11ft' },
  { min: 11, max: Infinity, label: '11ft+' },
];

export type AnalyticsPeriod = 'week' | 'month' | 'year' | 'all';
export const MIN_RELIABLE_PUTT_SAMPLE = 10;
export const MIN_RELIABLE_ROUND_SAMPLE = 3;

export function isReferenceSample(sampleSize: number, minimum: number): boolean {
  return sampleSize < minimum;
}

// DB/API変換後のラウンドは未入力ホールも totalPutts=0 で保持するため、
// 分析の分母には実際にパットが入力されたホールだけを使う。
export function getPlayedHoles(round: Round): HoleData[] {
  return round.holes.filter((hole) => hole.totalPutts > 0);
}

// 全パットデータを抽出
export function extractAllPutts(rounds: Round[]): { putt: PuttData; round: Round; hole: HoleData }[] {
  const result: { putt: PuttData; round: Round; hole: HoleData }[] = [];
  
  for (const round of rounds) {
    for (const hole of round.holes) {
      for (const putt of hole.putts) {
        result.push({ putt, round, hole });
      }
    }
  }
  
  return result;
}

// 1stパットのみ抽出
export function extractFirstPutts(rounds: Round[]): { putt: PuttData; round: Round; hole: HoleData }[] {
  return extractAllPutts(rounds).filter(({ putt }) => putt.strokeNumber === 1);
}

// 基本統計の計算
export function calculateBasicStats(rounds: Round[]): {
  totalRounds: number;
  totalHoles: number;
  totalPutts: number;
  averagePuttsPerRound: number;
  averagePuttsPerHole: number;
} {
  const totalRounds = rounds.length;
  let playedRounds = 0;
  let totalHoles = 0;
  let totalPutts = 0;
  
  for (const round of rounds) {
    const played = getPlayedHoles(round);
    if (played.length === 0) continue;
    playedRounds++;
    totalHoles += played.length;
    totalPutts += played.reduce((sum, hole) => sum + hole.totalPutts, 0);
  }
  
  return {
    totalRounds,
    totalHoles,
    totalPutts,
    averagePuttsPerRound: playedRounds > 0 ? totalPutts / playedRounds : 0,
    averagePuttsPerHole: totalHoles > 0 ? totalPutts / totalHoles : 0,
  };
}

// 1パット率の計算
export function calculateOnePuttRate(rounds: Round[]): number {
  let onePuttHoles = 0;
  let totalHoles = 0;
  
  for (const round of rounds) {
    for (const hole of getPlayedHoles(round)) {
      totalHoles++;
      if (hole.totalPutts === 1) {
        onePuttHoles++;
      }
    }
  }
  
  return totalHoles > 0 ? (onePuttHoles / totalHoles) * 100 : 0;
}

// 3パット率の計算
export function calculateThreePuttRate(rounds: Round[]): number {
  let threePuttHoles = 0;
  let totalHoles = 0;
  
  for (const round of rounds) {
    for (const hole of getPlayedHoles(round)) {
      totalHoles++;
      if (hole.totalPutts >= 3) {
        threePuttHoles++;
      }
    }
  }
  
  return totalHoles > 0 ? (threePuttHoles / totalHoles) * 100 : 0;
}

// カップイン率の計算（1stパット）
export function calculateCupInRate(rounds: Round[]): number {
  const firstPutts = extractFirstPutts(rounds);
  const cupIns = firstPutts.filter(({ putt }) => putt.cupIn).length;
  
  return firstPutts.length > 0 ? (cupIns / firstPutts.length) * 100 : 0;
}

// 距離別統計
// distanceMeters=0 は「距離未記入」（OCR取込等）のため集計対象外にする
export function calculateDistanceStats(rounds: Round[]): DistanceStats[] {
  const firstPutts = extractFirstPutts(rounds).filter(
    ({ putt }) => putt.distanceMeters > 0
  );

  return DISTANCE_RANGES.map(range => {
    const puttsInRange = firstPutts.filter(
      ({ putt }) => putt.distanceMeters >= range.min && putt.distanceMeters < range.max
    );
    const cupIns = puttsInRange.filter(({ putt }) => putt.cupIn).length;
    
    return {
      range: range.label,
      attempts: puttsInRange.length,
      cupIns,
      rate: puttsInRange.length > 0 ? (cupIns / puttsInRange.length) * 100 : 0,
    };
  });
}

// 傾斜別統計（Line U/D）
export function calculateSlopeStats(rounds: Round[]): SlopeStats[] {
  const firstPutts = extractFirstPutts(rounds);
  const slopes: SlopeUpDown[] = ['flat', 'uphill', 'downhill', 'up_down', 'down_up'];
  
  return slopes.map(slope => {
    const puttsWithSlope = firstPutts.filter(({ putt }) => putt.lineUD === slope);
    const cupIns = puttsWithSlope.filter(({ putt }) => putt.cupIn).length;
    
    return {
      slope,
      attempts: puttsWithSlope.length,
      cupIns,
      rate: puttsWithSlope.length > 0 ? (cupIns / puttsWithSlope.length) * 100 : 0,
    };
  });
}

// グリーンスピード別統計
export function calculateGreenSpeedStats(rounds: Round[]): GreenSpeedStats[] {
  return SPEED_RANGES.map(range => {
    const roundsInRange = rounds.filter(
      r => r.stimpmeter >= range.min && r.stimpmeter < range.max && getPlayedHoles(r).length > 0
    );
    
    const playedHoles = roundsInRange.flatMap(getPlayedHoles);
    const totalPutts = playedHoles.reduce((sum, h) => sum + h.totalPutts, 0);
    const totalHoles = playedHoles.length;
    
    return {
      speedRange: range.label,
      averagePutts: totalHoles > 0 ? totalPutts / totalHoles : 0,
      rounds: roundsInRange.length,
    };
  });
}

// 左右傾斜別カップイン率（1stパット）
export function calculateSlopeLeftRightStats(rounds: Round[]): SlopeLeftRightStatsItem[] {
  const firstPutts = extractFirstPutts(rounds);
  const slopes: SlopeLeftRight[] = ['straight', 'left', 'right', 'left_right', 'right_left'];

  return slopes.map(slope => {
    const puttsWithSlope = firstPutts.filter(({ putt }) => putt.lineLR === slope);
    const cupIns = puttsWithSlope.filter(({ putt }) => putt.cupIn).length;

    return {
      slope,
      attempts: puttsWithSlope.length,
      cupIns,
      rate: puttsWithSlope.length > 0 ? (cupIns / puttsWithSlope.length) * 100 : 0,
    };
  });
}

// メタデータ別平均パット/H の汎用ヘルパー
function calculateMetadataAvgPutts(
  rounds: Round[],
  groupBy: (r: Round) => string,
): MetadataAvgPuttsItem[] {
  const groups = new Map<string, { totalPutts: number; totalHoles: number; rounds: number }>();

  for (const round of rounds) {
    const key = groupBy(round);
    if (!key) continue;

    const played = getPlayedHoles(round);
    if (played.length === 0) continue;

    const existing = groups.get(key) ?? { totalPutts: 0, totalHoles: 0, rounds: 0 };
    existing.totalPutts += played.reduce((sum, hole) => sum + hole.totalPutts, 0);
    existing.totalHoles += played.length;
    existing.rounds += 1;
    groups.set(key, existing);
  }

  const result: MetadataAvgPuttsItem[] = [];
  for (const [label, data] of groups) {
    result.push({
      label,
      averagePutts: data.totalHoles > 0 ? data.totalPutts / data.totalHoles : 0,
      rounds: data.rounds,
    });
  }

  // ラウンド数の降順でソート
  return result.sort((a, b) => b.rounds - a.rounds);
}

// パター別平均パット/H
export function calculatePutterStats(rounds: Round[]): MetadataAvgPuttsItem[] {
  return calculateMetadataAvgPutts(rounds, r => r.putterName || '不明');
}

// 芝の種類別平均パット/H
export function calculateGrassTypeStats(rounds: Round[]): MetadataAvgPuttsItem[] {
  return calculateMetadataAvgPutts(rounds, r => LABELS.grassType[r.grassType] || r.grassType);
}

// 天候別平均パット/H
export function calculateWeatherStats(rounds: Round[]): MetadataAvgPuttsItem[] {
  return calculateMetadataAvgPutts(rounds, r => LABELS.weather[r.weather] || r.weather);
}

// コース別平均パット/H
export function calculateCourseStats(rounds: Round[]): MetadataAvgPuttsItem[] {
  return calculateMetadataAvgPutts(rounds, r => r.courseName || '不明');
}

// ラウンドごとの推移（日付昇順）。時系列グラフ用。
export function calculateRoundTrend(rounds: Round[]): RoundTrendItem[] {
  return [...rounds]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .flatMap((round) => {
      const played = getPlayedHoles(round);
      const holeCount = played.length;
      if (holeCount === 0) return [];

      const totalPutts = played.reduce((sum, hole) => sum + hole.totalPutts, 0);
      const onePuttHoles = played.filter((h) => h.totalPutts === 1).length;
      const d = new Date(round.date);
      return [{
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        avgPutts: totalPutts / holeCount,
        onePuttRate: (onePuttHoles / holeCount) * 100,
      }];
    });
}

// 2ndパットの distPrev は1stパット後の残り距離（yd）。これを使って
// ロングパットの寄せ距離と3パット発生率の関係を分析する。
export function calculateLagAnalysis(rounds: Round[]): LagAnalysis {
  const outcomes = rounds.flatMap((round) =>
    getPlayedHoles(round).flatMap((hole) => {
      const secondPutt = hole.putts.find((putt) => putt.strokeNumber === 2);
      if (!secondPutt?.distPrev || secondPutt.distPrev <= 0) return [];
      return [{
        leaveMeters: secondPutt.distPrev * 0.9144,
        threePutt: hole.totalPutts >= 3,
      }];
    }),
  );

  const ranges = [
    { min: 0, max: 0.5, label: "〜0.5m" },
    { min: 0.5, max: 1, label: "0.5〜1m" },
    { min: 1, max: 2, label: "1〜2m" },
    { min: 2, max: Infinity, label: "2m〜" },
  ];
  const threePutts = outcomes.filter((outcome) => outcome.threePutt);
  const longLeaves = outcomes.filter((outcome) => outcome.leaveMeters >= 1);

  return {
    recordedHoles: outcomes.length,
    averageLeaveMeters: outcomes.length > 0
      ? outcomes.reduce((sum, outcome) => sum + outcome.leaveMeters, 0) / outcomes.length
      : 0,
    threePuttAverageLeaveMeters: threePutts.length > 0
      ? threePutts.reduce((sum, outcome) => sum + outcome.leaveMeters, 0) / threePutts.length
      : 0,
    longLeaveRate: outcomes.length > 0 ? (longLeaves.length / outcomes.length) * 100 : 0,
    buckets: ranges.map((range) => {
      const matches = outcomes.filter(
        (outcome) => outcome.leaveMeters >= range.min && outcome.leaveMeters < range.max,
      );
      const count = matches.filter((outcome) => outcome.threePutt).length;
      return {
        range: range.label,
        attempts: matches.length,
        threePutts: count,
        threePuttRate: matches.length > 0 ? (count / matches.length) * 100 : 0,
      };
    }),
  };
}

// 記録データから、改善余地の大きい順に課題と練習メニューを返す。
export function generatePracticeInsights(rounds: Round[]): PracticeInsight[] {
  const playedHoles = rounds.flatMap(getPlayedHoles);
  if (playedHoles.length === 0) return [];

  const candidates: PracticeInsight[] = [];
  const threePuttHoles = playedHoles.filter((hole) => hole.totalPutts >= 3).length;
  const threePuttRate = (threePuttHoles / playedHoles.length) * 100;
  candidates.push({
    id: "three-putt",
    title: "3パットを減らす",
    summary: `3パット率 ${threePuttRate.toFixed(1)}%（${threePuttHoles}/${playedHoles.length}H）`,
    practice: "10〜15mから1m以内へ止める距離感ドリルを10球×3セット",
    sampleSize: playedHoles.length,
    priority: threePuttRate * 1.4,
  });

  const distanceStats = calculateDistanceStats(rounds).filter((stat) => stat.attempts > 0);
  if (distanceStats.length > 0) {
    const weakest = [...distanceStats].sort(
      (a, b) => a.rate - b.rate || b.attempts - a.attempts,
    )[0];
    candidates.push({
      id: "distance",
      title: `${weakest.range}の決定率を上げる`,
      summary: `カップイン率 ${weakest.rate.toFixed(1)}%（n=${weakest.attempts}）`,
      practice: `${weakest.range}から傾斜を変えて5球ずつ、合計30球のカップイン練習`,
      sampleSize: weakest.attempts,
      priority: 100 - weakest.rate,
    });
  } else {
    candidates.push({
      id: "record-distance",
      title: "1stパット距離を記録する",
      summary: "距離別の判定に必要なデータがまだありません",
      practice: "次のラウンドでは各ホールの1stパット距離を優先して記録",
      sampleSize: 0,
      priority: 35,
    });
  }

  const slopeCandidates = [
    ...calculateSlopeStats(rounds).map((stat) => ({
      id: `slope-ud-${stat.slope}`,
      label: LABELS.slopeUpDown[stat.slope],
      ...stat,
    })),
    ...calculateSlopeLeftRightStats(rounds).map((stat) => ({
      id: `slope-lr-${stat.slope}`,
      label: LABELS.slopeLeftRight[stat.slope],
      ...stat,
    })),
  ].filter((stat) => stat.attempts > 0);

  if (slopeCandidates.length > 0) {
    const weakest = [...slopeCandidates].sort(
      (a, b) => a.rate - b.rate || b.attempts - a.attempts,
    )[0];
    candidates.push({
      id: weakest.id,
      title: `${weakest.label}ラインを強化する`,
      summary: `カップイン率 ${weakest.rate.toFixed(1)}%（n=${weakest.attempts}）`,
      practice: `${weakest.label}ラインにゲートを2か所置き、スタート方向を確認しながら20球`,
      sampleSize: weakest.attempts,
      priority: (100 - weakest.rate) * 0.9,
    });
  }

  const onePuttRate = calculateOnePuttRate(rounds);
  candidates.push({
    id: "one-putt",
    title: "1パットで決め切る",
    summary: `1パット率 ${onePuttRate.toFixed(1)}%`,
    practice: "1〜2mを時計方向8地点から連続成功するまで繰り返すサークルドリル",
    sampleSize: playedHoles.length,
    priority: (100 - onePuttRate) * 0.65,
  });

  return candidates.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

// 総合分析サマリー
export function calculateAnalyticsSummary(rounds: Round[]): AnalyticsSummary {
  const basicStats = calculateBasicStats(rounds);
  
  return {
    totalRounds: basicStats.totalRounds,
    averagePutts: basicStats.averagePuttsPerHole,
    onePuttRate: calculateOnePuttRate(rounds),
    threePuttRate: calculateThreePuttRate(rounds),
    cupInRate: calculateCupInRate(rounds),
    distanceStats: calculateDistanceStats(rounds),
    slopeStats: calculateSlopeStats(rounds),
    greenSpeedStats: calculateGreenSpeedStats(rounds),
    slopeLeftRightStats: calculateSlopeLeftRightStats(rounds),
    trend: calculateRoundTrend(rounds),
    lagAnalysis: calculateLagAnalysis(rounds),
    putterStats: calculatePutterStats(rounds),
    grassTypeStats: calculateGrassTypeStats(rounds),
    weatherStats: calculateWeatherStats(rounds),
    courseStats: calculateCourseStats(rounds),
  };
}

// 期間でフィルタリング
export function filterRoundsByPeriod(
  rounds: Round[],
  period: AnalyticsPeriod
): Round[] {
  const cutoffDate = getPeriodCutoffDate(period);
  if (!cutoffDate) return rounds;

  return rounds.filter(r => new Date(r.date) >= cutoffDate);
}

export function getPeriodCutoffDate(
  period: AnalyticsPeriod,
  now: Date = new Date(),
): Date | null {
  switch (period) {
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case 'year':
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case 'all':
      return null;
  }
}

// 歩数から距離を計算
export function calculateDistance(steps: number, strideLength: number): number {
  return steps * strideLength;
}

// 日付フォーマット
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

// パーセンテージフォーマット
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// 距離範囲を取得
export function getDistanceRange(distanceMeters: number): 'short' | 'medium' | 'long' {
  if (distanceMeters < 2) return 'short';
  if (distanceMeters < 5) return 'medium';
  return 'long';
}

// 統計計算（互換関数）
export function calculateStats(rounds: Round[]): {
  totalRounds: number;
  avgPuttsPerRound: number;
  avgPuttsPerHole: number;
  onePuttRate: number;
  threePuttRate: number;
} {
  const basicStats = calculateBasicStats(rounds);
  return {
    totalRounds: basicStats.totalRounds,
    avgPuttsPerRound: basicStats.averagePuttsPerRound,
    avgPuttsPerHole: basicStats.averagePuttsPerHole,
    onePuttRate: calculateOnePuttRate(rounds),
    threePuttRate: calculateThreePuttRate(rounds),
  };
}

// 距離別分析（互換関数）
export function analyzeByDistance(rounds: Round[]): {
  short: { successRate: number; count: number };
  medium: { successRate: number; count: number };
  long: { successRate: number; count: number };
} {
  // distanceMeters=0 は「距離未記入」（OCR取込等）のため集計対象外にする
  const firstPutts = extractFirstPutts(rounds).filter(
    ({ putt }) => putt.distanceMeters > 0
  );

  const categories = {
    short: { attempts: 0, cupIns: 0 },
    medium: { attempts: 0, cupIns: 0 },
    long: { attempts: 0, cupIns: 0 },
  };

  for (const { putt } of firstPutts) {
    const range = getDistanceRange(putt.distanceMeters);
    categories[range].attempts++;
    if (putt.cupIn) {
      categories[range].cupIns++;
    }
  }
  
  return {
    short: {
      successRate: categories.short.attempts > 0 
        ? (categories.short.cupIns / categories.short.attempts) * 100 
        : 0,
      count: categories.short.attempts,
    },
    medium: {
      successRate: categories.medium.attempts > 0 
        ? (categories.medium.cupIns / categories.medium.attempts) * 100 
        : 0,
      count: categories.medium.attempts,
    },
    long: {
      successRate: categories.long.attempts > 0 
        ? (categories.long.cupIns / categories.long.attempts) * 100 
        : 0,
      count: categories.long.attempts,
    },
  };
}

// 傾斜別分析（互換関数）
export function analyzeBySlope(rounds: Round[]): {
  flat: { successRate: number; count: number };
  uphill: { successRate: number; count: number };
  downhill: { successRate: number; count: number };
  up_down: { successRate: number; count: number };
  down_up: { successRate: number; count: number };
} {
  const firstPutts = extractFirstPutts(rounds);
  
  const categories: Record<SlopeUpDown, { attempts: number; cupIns: number }> = {
    flat: { attempts: 0, cupIns: 0 },
    uphill: { attempts: 0, cupIns: 0 },
    downhill: { attempts: 0, cupIns: 0 },
    up_down: { attempts: 0, cupIns: 0 },
    down_up: { attempts: 0, cupIns: 0 },
  };
  
  for (const { putt } of firstPutts) {
    categories[putt.lineUD].attempts++;
    if (putt.cupIn) {
      categories[putt.lineUD].cupIns++;
    }
  }
  
  const result: Record<string, { successRate: number; count: number }> = {};
  for (const slope of Object.keys(categories) as SlopeUpDown[]) {
    result[slope] = {
      successRate: categories[slope].attempts > 0 
        ? (categories[slope].cupIns / categories[slope].attempts) * 100 
        : 0,
      count: categories[slope].attempts,
    };
  }
  
  return result as {
    flat: { successRate: number; count: number };
    uphill: { successRate: number; count: number };
    downhill: { successRate: number; count: number };
    up_down: { successRate: number; count: number };
    down_up: { successRate: number; count: number };
  };
}
