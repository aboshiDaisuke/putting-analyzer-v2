// パッティング分析システム - データモデル型定義

// ユーザープロフィール
export interface UserProfile {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  birthDate: string; // ISO date string
  handicap: number;
  strideLength: number; // メートル単位
  memberCourses: string[]; // コースIDの配列
  createdAt: string;
  updatedAt: string;
}

// マイパター
export interface Putter {
  id: string;
  brandName: string;
  productName: string;
  length: number; // インチ
  lieAngle: number; // 度
  weight: number; // グラム
  gripName: string;
  startDate: string; // 使用開始日
  usageCount: number; // 使用回数
  ranking: 'ace' | '2nd' | '3rd' | '4th' | '5th';
  createdAt: string;
  updatedAt: string;
}

// ゴルフコース
export interface GolfCourse {
  id: string;
  name: string;
  location?: string;
  greens: string[]; // A/Bグリーンなど
  createdAt: string;
}

// 芝の種類
export type GrassType = 'bent' | 'korai' | 'bermuda' | 'other';

// グリーンコンディション
export type GreenCondition = 'excellent' | 'good' | 'fair';

// 天気
export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'windy';

// 風速
export type WindSpeed = 'calm' | 'light' | 'moderate' | 'strong';

// ラウンド種別
export type RoundType = 'competition' | 'club_competition' | 'private' | 'practice';

// 競技形式
export type CompetitionFormat = 'stroke' | 'match';

// ラウンドデータ
export interface Round {
  id: string;
  date: string; // ISO date string
  weather: Weather;
  temperature?: number; // 摂氏
  windSpeed: WindSpeed;
  courseId: string;
  courseName: string;
  frontNineGreen: string; // 使用グリーン（1-9H）
  backNineGreen: string; // 使用グリーン（10-18H）
  roundType: RoundType;
  competitionFormat: CompetitionFormat;
  grassType: GrassType;
  stimpmeter: number; // フィート
  mowingHeight?: number; // ミリ
  compaction?: number;
  greenCondition: GreenCondition;
  putterId: string;
  putterName: string;
  holes: HoleData[];
  totalPutts: number;
  createdAt: string;
  updatedAt: string;
}

// スコア結果（カードの Result: E, Ba, P, Bo, D+ に対応）
export type ScoreResult = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double_bogey_plus';

// 傾斜（上下）- カードの Line(U/D): F, U, D, UD, DU に対応
export type SlopeUpDown = 'flat' | 'uphill' | 'downhill' | 'up_down' | 'down_up';

// ライン（左右）- カードの Line(L/R): St, L, R, LR, RL に対応
export type SlopeLeftRight = 'straight' | 'left' | 'right' | 'left_right' | 'right_left';

// 心理状態 - カードの Mental(P/N): P, 1, 2, 3, 4, 5, N に対応
export type MentalState = 'P' | 1 | 2 | 3 | 4 | 5 | 'N';

// タッチ強度（1-5: 弱 to 強）- カードの Touch(弱1-5強) に対応
export type PuttStrength = 1 | 2 | 3 | 4 | 5;

// ミス方向（1-5）- カードの Missed Direction に対応
export type MissedDirection = 1 | 2 | 3 | 4 | 5;

// パットデータ - カードの各パットセクションに完全対応
export interface PuttData {
  strokeNumber: 1 | 2 | 3; // 1st/2nd/3rd Putt
  cupIn: boolean; // カードの In チェックボックス
  distPrev: number | null; // カードの Dist(prev) yd - 前回パットからの残り距離
  result: ScoreResult | null; // カードの Result - 塗りつぶし選択
  lengthSteps: number | null; // カードの Length st - 歩数
  lengthYards: number | null; // カードの Length yd - ヤード
  distanceMeters: number; // 計算された距離（メートル）= 歩数 × 歩幅
  missedDirection: MissedDirection | null; // カードの Missed Direction 1-5
  touch: PuttStrength | null; // カードの Touch(弱1-5強)
  lineUD: SlopeUpDown; // カードの Line(U/D): F, U, D, UD, DU
  lineLR: SlopeLeftRight; // カードの Line(L/R): St, L, R, LR, RL
  mental: MentalState; // カードの Mental(P/N): P, 1, 2, 3, 4, 5, N
}

// ホールデータ
export interface HoleData {
  holeNumber: number; // 1-18
  scoreResult: ScoreResult;
  totalPutts: number;
  putts: PuttData[];
}

// 分析用の集計データ
export interface AnalyticsSummary {
  totalRounds: number;
  averagePutts: number;
  onePuttRate: number; // 1パット率
  threePuttRate: number; // 3パット率
  cupInRate: number; // カップイン率
  distanceStats: DistanceStats[];
  slopeStats: SlopeStats[];
  greenSpeedStats: GreenSpeedStats[];
  mentalStats: MentalStatsItem[];
}

export interface DistanceStats {
  range: string; // e.g., "0-1m", "1-2m", etc.
  attempts: number;
  cupIns: number;
  rate: number;
}

export interface SlopeStats {
  slope: SlopeUpDown;
  attempts: number;
  cupIns: number;
  rate: number;
}

export interface GreenSpeedStats {
  speedRange: string; // e.g., "8-9ft", "9-10ft", etc.
  averagePutts: number;
  rounds: number;
}

export interface MentalStatsItem {
  state: MentalState;
  attempts: number;
  cupIns: number;
  rate: number;
}

// ローカルストレージのキー
export const STORAGE_KEYS = {
  USER_PROFILE: 'putting_analyzer_user_profile',
  PUTTERS: 'putting_analyzer_putters',
  COURSES: 'putting_analyzer_courses',
  ROUNDS: 'putting_analyzer_rounds',
} as const;

// デフォルト値
export const DEFAULT_USER_PROFILE: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  gender: 'male',
  birthDate: '',
  handicap: 0,
  strideLength: 0.7, // デフォルト歩幅70cm
  memberCourses: [],
};

// ラベル定義（日本語表示用）- カードの表記に合わせる
export const LABELS = {
  grassType: {
    bent: 'ベント',
    korai: '高麗',
    bermuda: 'バミューダ',
    other: 'その他',
  },
  greenCondition: {
    excellent: '優',
    good: '良',
    fair: '可',
  },
  weather: {
    sunny: '晴れ',
    cloudy: '曇り',
    rainy: '雨',
    windy: '風',
  },
  windSpeed: {
    calm: '無風',
    light: '弱',
    moderate: '中',
    strong: '強',
  },
  roundType: {
    competition: '競技',
    club_competition: 'クラブ競技',
    private: 'プライベート',
    practice: '練習',
  },
  competitionFormat: {
    stroke: 'ストローク',
    match: 'マッチ',
  },
  scoreResult: {
    eagle: 'E (イーグル)',
    birdie: 'Ba (バーディ)',
    par: 'P (パー)',
    bogey: 'Bo (ボギー)',
    double_bogey_plus: 'D+ (ダブル以上)',
  },
  // カードの短縮表記
  scoreResultShort: {
    eagle: 'E',
    birdie: 'Ba',
    par: 'P',
    bogey: 'Bo',
    double_bogey_plus: 'D+',
  },
  slopeUpDown: {
    flat: 'F (フラット)',
    uphill: 'U (上り)',
    downhill: 'D (下り)',
    up_down: 'UD (上→下)',
    down_up: 'DU (下→上)',
  },
  slopeUpDownShort: {
    flat: 'F',
    uphill: 'U',
    downhill: 'D',
    up_down: 'UD',
    down_up: 'DU',
  },
  slopeLeftRight: {
    straight: 'St (ストレート)',
    left: 'L (左)',
    right: 'R (右)',
    left_right: 'LR (左→右)',
    right_left: 'RL (右→左)',
  },
  slopeLeftRightShort: {
    straight: 'St',
    left: 'L',
    right: 'R',
    left_right: 'LR',
    right_left: 'RL',
  },
  mentalState: {
    P: 'P (+)',
    1: '1',
    2: '2',
    3: '3',
    4: '4',
    5: '5',
    N: 'N (-)',
  },
  puttStrength: {
    1: '1 弱',
    2: '2',
    3: '3',
    4: '4',
    5: '5 強',
  },
  missedDirection: {
    1: '1',
    2: '2',
    3: '3',
    4: '4',
    5: '5',
  },
  putterRanking: {
    ace: 'Ace',
    '2nd': '2nd',
    '3rd': '3rd',
    '4th': '4th',
    '5th': '5th',
  },
} as const;

// OCRカード表記 → アプリ内部値のマッピング
export const CARD_TO_APP = {
  result: {
    E: 'eagle' as ScoreResult,
    Ba: 'birdie' as ScoreResult,
    P: 'par' as ScoreResult,
    Bo: 'bogey' as ScoreResult,
    'D+': 'double_bogey_plus' as ScoreResult,
  },
  lineUD: {
    F: 'flat' as SlopeUpDown,
    U: 'uphill' as SlopeUpDown,
    D: 'downhill' as SlopeUpDown,
    UD: 'up_down' as SlopeUpDown,
    DU: 'down_up' as SlopeUpDown,
  },
  lineLR: {
    St: 'straight' as SlopeLeftRight,
    L: 'left' as SlopeLeftRight,
    R: 'right' as SlopeLeftRight,
    LR: 'left_right' as SlopeLeftRight,
    RL: 'right_left' as SlopeLeftRight,
  },
  mental: {
    P: 'P' as MentalState,
    1: 1 as MentalState,
    2: 2 as MentalState,
    3: 3 as MentalState,
    4: 4 as MentalState,
    5: 5 as MentalState,
    N: 'N' as MentalState,
  },
};

// アプリ内部値 → OCRカード表記のマッピング（逆変換）
export const APP_TO_CARD = {
  result: Object.fromEntries(
    Object.entries(CARD_TO_APP.result).map(([k, v]) => [v, k])
  ) as Record<ScoreResult, string>,
  lineUD: Object.fromEntries(
    Object.entries(CARD_TO_APP.lineUD).map(([k, v]) => [v, k])
  ) as Record<SlopeUpDown, string>,
  lineLR: Object.fromEntries(
    Object.entries(CARD_TO_APP.lineLR).map(([k, v]) => [v, k])
  ) as Record<SlopeLeftRight, string>,
};

// デフォルトのパットデータ
export function createDefaultPutt(strokeNumber: 1 | 2 | 3): PuttData {
  return {
    strokeNumber,
    cupIn: false,
    distPrev: null,
    result: null,
    lengthSteps: null,
    lengthYards: null,
    distanceMeters: 0,
    missedDirection: null,
    touch: null,
    lineUD: 'flat',
    lineLR: 'straight',
    mental: 3,
  };
}
