/**
 * デモモード用のサンプルデータ（決定的な擬似乱数で毎回同じ内容）。
 *
 * 「HC12 くらいのゴルファーが半年で22ラウンド」を、カード v3 と同じ粒度で作る。
 * 分析が意味のある結果を出すように、はっきりした癖を持たせてある:
 *   - 下りと右に曲がるラインが苦手 / ロングパットはショートしがち / 2m以内は安定
 *   - 後半のラウンドほど少しずつ上達している
 */
import { buildHole, type PuttEntry } from "./putting";
import { baselineMakeRate } from "./putting-stats";
import type { GolfCourse, HoleData, MissLength, Putter, Round, ScoreResult, SlopeLeftRight, SlopeUpDown, UserProfile } from "./types";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(r: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
}

function lognormal(r: () => number, median: number, sigma: number): number {
  const u = Math.max(1e-9, r());
  const v = r();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
}

export const DEMO_PROFILE: UserProfile = {
  id: "demo",
  name: "デモ ゴルファー",
  gender: "male",
  birthDate: "1985-04-12",
  handicap: 12,
  strideLength: 0.8,
  memberCourses: [],
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
};

export const DEMO_PUTTERS: Putter[] = [
  {
    id: "demo-p1",
    brandName: "Demo Golf",
    productName: "Blade 350",
    length: 34,
    lieAngle: 70,
    weight: 350,
    gripName: "Pistol Mid",
    startDate: "2025-10-01",
    usageCount: 15,
    ranking: "ace",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  },
  {
    id: "demo-p2",
    brandName: "Demo Golf",
    productName: "Mallet 7",
    length: 33,
    lieAngle: 71,
    weight: 365,
    gripName: "Oversize",
    startDate: "2026-06-01",
    usageCount: 7,
    ranking: "2nd",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
];

const COURSES = [
  { name: "富士見ヶ丘CC", grass: "bent" as const, stimp: 9.5 },
  { name: "湘南シーサイドGC", grass: "bent" as const, stimp: 10.5 },
  { name: "那須高原GC", grass: "bent" as const, stimp: 8.5 },
  { name: "南房総カントリー", grass: "korai" as const, stimp: 8.0 },
];

export const DEMO_COURSES: GolfCourse[] = COURSES.map((c, i) => ({
  id: `demo-c${i + 1}`,
  name: c.name,
  greens: ["A", "B"],
  createdAt: "2026-03-01T00:00:00.000Z",
}));

type Skill = { improvement: number };

/** このゴルファーの1パット確率（下り・右曲がりが苦手、上達で少しずつ良くなる） */
function makeProbability(d: number, ud: SlopeUpDown, lr: SlopeLeftRight, skill: Skill): number {
  const base = (baselineMakeRate(d, "scratch") * 0.85 + baselineMakeRate(d, "hc15") * 0.15) / 100;
  let p = base * (1 + skill.improvement * 0.12);
  if (d > 1.2 && ud === "downhill") p *= 0.8;
  if (d > 1.2 && lr === "right") p *= 0.87;
  if (ud === "uphill") p *= 1.1;
  return Math.min(0.995, p);
}

function simulateHole(r: () => number, holeNumber: number, skill: Skill): HoleData {
  const puttFor = pickWeighted<ScoreResult>(r, [
    ["eagle", 1],
    ["birdie", 30],
    ["par", 52],
    ["bogey", 15],
    ["double_bogey_plus", 2],
  ]);
  const median = { eagle: 9, birdie: 7.5, par: 3.2, bogey: 2.6, double_bogey_plus: 2.2 }[puttFor];
  let d = Math.min(30, Math.max(0.6, lognormal(r, median, 0.62)));
  d = d >= 1 ? Math.round(d) : 1; // カードの 1st は整数 m

  const putts: PuttEntry[] = [];
  let total = 0;
  while (total < 6) {
    total++;
    const ud = pickWeighted<SlopeUpDown>(r, [["flat", 30], ["uphill", 35], ["downhill", 35]]);
    const lr = pickWeighted<SlopeLeftRight>(r, [["straight", 26], ["left", 37], ["right", 37]]);
    const holed = r() < makeProbability(d, ud, lr, skill);
    const entry: PuttEntry = { meters: d, lineUD: total <= 2 ? ud : null, lineLR: total <= 2 ? lr : null };
    if (holed) {
      putts.push(entry);
      break;
    }
    // 外れ: ロングはショートしがち。下りはオーバーしやすい
    const shortBias = (d >= 6 ? 0.68 : 0.5) - (ud === "downhill" ? 0.18 : 0) + (ud === "uphill" ? 0.12 : 0);
    const miss: MissLength = r() < shortBias ? "short" : "long";
    if (total === 1) entry.missLength = miss;
    putts.push(entry);
    const ratio = d >= 6 ? lognormal(r, 0.13 * (1 - skill.improvement * 0.2), 0.5) : lognormal(r, 0.28, 0.5);
    d = Math.max(0.2, Math.round(Math.min(d * ratio + (miss === "long" && ud === "downhill" ? 0.4 : 0), 9.9) * 10) / 10);
  }
  return buildHole({ holeNumber, puttFor, totalPutts: total, putts: putts.slice(0, 3) });
}

export function generateDemoRounds(count = 22, seed = 20260925): Round[] {
  const r = rng(seed);
  const start = new Date(2026, 2, 8); // 2026-03-08
  const rounds: Round[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(start.getTime() + i * 8.6 * 24 * 3600 * 1000);
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const course = COURSES[Math.floor(r() * COURSES.length)];
    const putter = i >= 15 && r() < 0.6 ? DEMO_PUTTERS[1] : DEMO_PUTTERS[0];
    const skill: Skill = { improvement: i / (count - 1) };
    const holes = Array.from({ length: 18 }, (_, h) => simulateHole(r, h + 1, skill));
    const now = `${ymd}T12:00:00.000Z`;
    rounds.push({
      id: `demo-r${i + 1}`,
      date: ymd,
      weather: pickWeighted(r, [["sunny", 6], ["cloudy", 3], ["rainy", 1], ["windy", 1]]),
      windSpeed: pickWeighted(r, [["calm", 3], ["light", 4], ["moderate", 2], ["strong", 1]]),
      temperature: Math.round(12 + r() * 16),
      courseId: DEMO_COURSES[COURSES.indexOf(course)].id,
      courseName: course.name,
      frontNineGreen: "A",
      backNineGreen: "A",
      roundType: i % 5 === 0 ? "club_competition" : "private",
      competitionFormat: "stroke",
      grassType: course.grass,
      stimpmeter: Math.round((course.stimp + (r() - 0.5)) * 2) / 2,
      greenCondition: pickWeighted(r, [["excellent", 2], ["good", 5], ["fair", 2]]),
      putterId: putter.id,
      putterName: `${putter.brandName} ${putter.productName}`,
      holes,
      totalPutts: holes.reduce((s, h) => s + h.totalPutts, 0),
      holesPlayed: 18,
      createdAt: now,
      updatedAt: now,
    });
  }
  return rounds.reverse(); // 一覧は新しい順
}
