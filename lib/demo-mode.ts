/**
 * デモモード（ログインなしでサンプルデータを触れる）。
 *
 * - フラグは端末に保存（Web: localStorage / ネイティブ: AsyncStorage）。
 * - データはメモリ上のストアで持ち、画面から追加・編集・削除もできる（アプリを閉じると元に戻る）。
 * - lib/storage.ts の各関数が isDemoMode() を見てこちらに振り分ける。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEMO_COURSES, DEMO_PROFILE, DEMO_PUTTERS, generateDemoRounds } from "./demo-data";
import type { GolfCourse, HoleData, Putter, Round, UserProfile } from "./types";

const FLAG_KEY = "putting_analyzer_demo_mode";

let demo = false;
const listeners = new Set<(on: boolean) => void>();

export function isDemoMode(): boolean {
  return demo;
}

let loading: Promise<boolean> | null = null;

/** 端末に保存したフラグを読む（何度呼んでも読み込みは1回） */
export function loadDemoFlag(): Promise<boolean> {
  if (!loading) {
    loading = AsyncStorage.getItem(FLAG_KEY)
      .then((v) => {
        demo = v === "1";
        return demo;
      })
      .catch(() => {
        demo = false;
        return false;
      });
  }
  return loading.then(() => demo);
}

export async function setDemoMode(on: boolean): Promise<void> {
  demo = on;
  loading = Promise.resolve(on);
  store = null;
  try {
    if (on) await AsyncStorage.setItem(FLAG_KEY, "1");
    else await AsyncStorage.removeItem(FLAG_KEY);
  } catch {
    // 保存できなくてもこのセッション中は有効
  }
  listeners.forEach((l) => l(on));
}

export function onDemoModeChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── メモリ上のストア ───────────────────────────────────────────────────────

type Store = { profile: UserProfile; putters: Putter[]; courses: GolfCourse[]; rounds: Round[]; seq: number };
let store: Store | null = null;

function s(): Store {
  if (!store) {
    store = {
      profile: { ...DEMO_PROFILE },
      putters: DEMO_PUTTERS.map((p) => ({ ...p })),
      courses: DEMO_COURSES.map((c) => ({ ...c })),
      rounds: generateDemoRounds(),
      seq: 100,
    };
  }
  return store;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const nextId = (prefix: string) => `${prefix}${++s().seq}`;
const nowIso = () => new Date().toISOString();

function padHoles(holes: HoleData[]): HoleData[] {
  return Array.from({ length: 18 }, (_, i) => holes.find((h) => h.holeNumber === i + 1) ?? { holeNumber: i + 1, scoreResult: "par", totalPutts: 0, putts: [] });
}

function withCounts(r: Round): Round {
  const holes = padHoles(r.holes);
  return { ...r, holes, totalPutts: holes.reduce((a, h) => a + h.totalPutts, 0), holesPlayed: holes.filter((h) => h.totalPutts > 0).length };
}

export const DemoStore = {
  getUserProfile: async (): Promise<UserProfile> => clone(s().profile),
  saveUserProfile: async (p: Partial<UserProfile>): Promise<UserProfile> => {
    s().profile = { ...s().profile, ...p, updatedAt: nowIso() };
    return clone(s().profile);
  },

  getPutters: async (): Promise<Putter[]> => clone(s().putters),
  getPutter: async (id: string): Promise<Putter | null> => clone(s().putters.find((p) => p.id === id) ?? null),
  savePutter: async (p: Omit<Putter, "id" | "createdAt" | "updatedAt">): Promise<Putter> => {
    const putter: Putter = { ...p, id: nextId("demo-p"), createdAt: nowIso(), updatedAt: nowIso() };
    s().putters.push(putter);
    return clone(putter);
  },
  updatePutter: async (id: string, u: Partial<Putter>): Promise<Putter | null> => {
    const i = s().putters.findIndex((p) => p.id === id);
    if (i < 0) return null;
    s().putters[i] = { ...s().putters[i], ...u, updatedAt: nowIso() };
    return clone(s().putters[i]);
  },
  deletePutter: async (id: string): Promise<boolean> => {
    s().putters = s().putters.filter((p) => p.id !== id);
    return true;
  },

  getCourses: async (): Promise<GolfCourse[]> => clone(s().courses),
  saveCourse: async (c: Omit<GolfCourse, "id" | "createdAt">): Promise<GolfCourse> => {
    const course: GolfCourse = { ...c, id: nextId("demo-c"), createdAt: nowIso() };
    s().courses.push(course);
    return clone(course);
  },
  deleteCourse: async (id: string): Promise<boolean> => {
    s().courses = s().courses.filter((c) => c.id !== id);
    return true;
  },

  getRounds: async (): Promise<Round[]> =>
    clone([...s().rounds].sort((a, b) => b.date.localeCompare(a.date)).map(withCounts)),
  getRoundsWithHoles: async (fromDate?: string): Promise<Round[]> =>
    clone(
      [...s().rounds]
        .filter((r) => !fromDate || r.date >= fromDate)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(withCounts),
    ),
  getRound: async (id: string): Promise<Round | null> => {
    const r = s().rounds.find((x) => x.id === id);
    return r ? clone(withCounts(r)) : null;
  },
  saveRound: async (r: Omit<Round, "id" | "createdAt" | "updatedAt">): Promise<Round> => {
    const round: Round = withCounts({ ...r, id: nextId("demo-r"), createdAt: nowIso(), updatedAt: nowIso() });
    s().rounds.push(round);
    return clone(round);
  },
  updateRound: async (id: string, u: Partial<Round>): Promise<Round | null> => {
    const i = s().rounds.findIndex((r) => r.id === id);
    if (i < 0) return null;
    s().rounds[i] = withCounts({ ...s().rounds[i], ...u, updatedAt: nowIso() });
    return clone(s().rounds[i]);
  },
  deleteRound: async (id: string): Promise<boolean> => {
    s().rounds = s().rounds.filter((r) => r.id !== id);
    return true;
  },
  resetRoundHoles: async (id: string): Promise<boolean> => {
    const r = s().rounds.find((x) => x.id === id);
    if (r) r.holes = [];
    return true;
  },
  deleteAllRounds: async (): Promise<boolean> => {
    s().rounds = [];
    return true;
  },
  saveHolesForRound: async (roundId: string, holes: HoleData[]) => {
    const r = s().rounds.find((x) => x.id === roundId);
    if (!r) throw new Error("Round not found");
    const map = new Map(padHoles(r.holes).map((h) => [h.holeNumber, h]));
    for (const h of holes) map.set(h.holeNumber, clone(h));
    r.holes = [...map.values()];
    const updated = withCounts(r);
    Object.assign(r, updated);
    return { roundId, holes: clone(updated.holes), totalPutts: updated.totalPutts };
  },
};
