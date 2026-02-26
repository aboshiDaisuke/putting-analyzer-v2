import {
  Round,
  HoleData,
  PuttData,
  AnalyticsSummary,
  DistanceStats,
  SlopeStats,
  GreenSpeedStats,
  MentalStatsItem,
  SlopeUpDown,
  MentalState,
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
  let totalHoles = 0;
  let totalPutts = 0;
  
  for (const round of rounds) {
    totalHoles += round.holes.length;
    totalPutts += round.totalPutts;
  }
  
  return {
    totalRounds,
    totalHoles,
    totalPutts,
    averagePuttsPerRound: totalRounds > 0 ? totalPutts / totalRounds : 0,
    averagePuttsPerHole: totalHoles > 0 ? totalPutts / totalHoles : 0,
  };
}

// 1パット率の計算
export function calculateOnePuttRate(rounds: Round[]): number {
  let onePuttHoles = 0;
  let totalHoles = 0;
  
  for (const round of rounds) {
    for (const hole of round.holes) {
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
    for (const hole of round.holes) {
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
export function calculateDistanceStats(rounds: Round[]): DistanceStats[] {
  const firstPutts = extractFirstPutts(rounds);
  
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
      r => r.stimpmeter >= range.min && r.stimpmeter < range.max
    );
    
    const totalPutts = roundsInRange.reduce((sum, r) => sum + r.totalPutts, 0);
    const totalHoles = roundsInRange.reduce((sum, r) => sum + r.holes.length, 0);
    
    return {
      speedRange: range.label,
      averagePutts: totalHoles > 0 ? totalPutts / totalHoles : 0,
      rounds: roundsInRange.length,
    };
  });
}

// 心理状態別統計
export function calculateMentalStats(rounds: Round[]): MentalStatsItem[] {
  const firstPutts = extractFirstPutts(rounds);
  const states: MentalState[] = ['P', 1, 2, 3, 4, 5, 'N'];
  
  return states.map(state => {
    const puttsWithState = firstPutts.filter(({ putt }) => putt.mental === state);
    const cupIns = puttsWithState.filter(({ putt }) => putt.cupIn).length;
    
    return {
      state,
      attempts: puttsWithState.length,
      cupIns,
      rate: puttsWithState.length > 0 ? (cupIns / puttsWithState.length) * 100 : 0,
    };
  });
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
    mentalStats: calculateMentalStats(rounds),
  };
}

// 期間でフィルタリング
export function filterRoundsByPeriod(
  rounds: Round[],
  period: 'week' | 'month' | 'year' | 'all'
): Round[] {
  if (period === 'all') return rounds;
  
  const now = new Date();
  let cutoffDate: Date;
  
  switch (period) {
    case 'week':
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      cutoffDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case 'year':
      cutoffDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
  }
  
  return rounds.filter(r => new Date(r.date) >= cutoffDate);
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
  const firstPutts = extractFirstPutts(rounds);
  
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
