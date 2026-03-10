/**
 * api-golf.ts
 *
 * Vanilla (non-hook) tRPC client for golf data.
 * Exports async functions with the same names as lib/storage.ts so screens can
 * import from either file without changing call sites.
 *
 * ID strategy:
 *  - The DB uses numeric serial IDs.
 *  - The client types (lib/types.ts) use string IDs.
 *  - We convert: numeric → string on read, string → number on write.
 */

import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import {
  UserProfile,
  Putter,
  GolfCourse,
  Round,
  HoleData,
  PuttData,
  DEFAULT_USER_PROFILE,
} from "./types";

// ─── Low-level tRPC HTTP helpers ──────────────────────────────────────────────

async function trpcQuery<T>(path: string, input?: unknown): Promise<T> {
  const token = await Auth.getSessionToken();
  const baseUrl = getApiBaseUrl();
  // tRPC batch format: input must be keyed by batch index "0"
  const inputParam = encodeURIComponent(JSON.stringify({ "0": { json: input ?? null } }));
  const url = `${baseUrl}/api/trpc/${path}?input=${inputParam}&batch=1`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
  });
  const data = await res.json();
  if (data[0]?.error) {
    // superjson wraps error in { json: { message, code, data } }
    const e = data[0].error;
    const msg = e?.json?.message ?? e?.message ?? JSON.stringify(e);
    throw new Error(msg);
  }
  return data[0]?.result?.data?.json ?? data[0]?.result?.data;
}

async function trpcMutate<T>(path: string, input?: unknown): Promise<T> {
  const token = await Auth.getSessionToken();
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/trpc/${path}?batch=1`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ "0": { json: input ?? null } }),
  });
  const data = await res.json();
  if (data[0]?.error) {
    const e = data[0].error;
    const msg = e?.json?.message ?? e?.message ?? JSON.stringify(e);
    throw new Error(msg);
  }
  return data[0]?.result?.data?.json ?? data[0]?.result?.data;
}

// ─── Type-conversion helpers ──────────────────────────────────────────────────

/** Convert any value to a string ID. */
function toStringId(id: number | string | null | undefined): string {
  return String(id ?? "");
}

/** Parse a string ID to a number. Returns NaN if not parseable. */
function toNumericId(id: string): number {
  return parseInt(id, 10);
}

/** Timestamp fields from the DB are ISO strings after JSON serialisation. */
function toISOString(v: string | Date | null | undefined): string {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  return v;
}

// ─── DB response shapes (what tRPC actually returns) ─────────────────────────

interface DbUserProfile {
  id: number;
  userId: number;
  gender: "male" | "female" | "other" | null;
  birthDate: string | null;
  handicap: number | null;
  strideLength: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface DbPutter {
  id: number;
  userId: number;
  brandName: string;
  productName: string;
  length: number | null;
  lieAngle: number | null;
  weight: number | null;
  gripName: string | null;
  startDate: string | null;
  usageCount: number;
  ranking: "ace" | "2nd" | "3rd" | "4th" | "5th" | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface DbCourse {
  id: number;
  userId: number;
  name: string;
  location: string | null;
  greens: string[] | null;
  createdAt: string | Date;
}

interface DbRound {
  id: number;
  userId: number;
  date: string;
  courseId: number | null;
  courseName: string;
  frontNineGreen: string | null;
  backNineGreen: string | null;
  weather: string | null;
  temperature: number | null;
  windSpeed: string | null;
  roundType: string | null;
  competitionFormat: string | null;
  grassType: string | null;
  stimpmeter: number | null;
  mowingHeight: number | null;
  compaction: number | null;
  greenCondition: string | null;
  putterId: number | null;
  putterName: string | null;
  totalPutts: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  // When fetched via rounds.get, holes are included:
  holes?: DbHole[];
}

interface DbHole {
  id: number;
  roundId: number;
  holeNumber: number;
  totalPutts: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  putts?: DbPutt[];
}

interface DbPutt {
  id: number;
  holeId: number;
  strokeNumber: number;
  cupIn: boolean;
  distPrev: number | null;
  result: string | null;
  lengthSteps: number | null;
  lengthYards: number | null;
  distanceMeters: number | null;
  missedDirection: number | null;
  touch: number | null;
  lineUD: string | null;
  lineLR: string | null;
  mental: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ─── Conversion: DB → Client types ───────────────────────────────────────────

function dbUserProfileToClient(db: DbUserProfile): UserProfile {
  return {
    id: toStringId(db.id),
    name: "", // name is stored on the users table, not userProfiles
    gender: db.gender ?? DEFAULT_USER_PROFILE.gender,
    birthDate: db.birthDate ?? DEFAULT_USER_PROFILE.birthDate,
    handicap: db.handicap ?? DEFAULT_USER_PROFILE.handicap,
    strideLength: db.strideLength ?? DEFAULT_USER_PROFILE.strideLength,
    memberCourses: DEFAULT_USER_PROFILE.memberCourses,
    createdAt: toISOString(db.createdAt),
    updatedAt: toISOString(db.updatedAt),
  };
}

function dbPutterToClient(db: DbPutter): Putter {
  return {
    id: toStringId(db.id),
    brandName: db.brandName,
    productName: db.productName,
    length: db.length ?? 34,
    lieAngle: db.lieAngle ?? 70,
    weight: db.weight ?? 350,
    gripName: db.gripName ?? "",
    startDate: db.startDate ?? "",
    usageCount: db.usageCount,
    ranking: db.ranking ?? "ace",
    createdAt: toISOString(db.createdAt),
    updatedAt: toISOString(db.updatedAt),
  };
}

function dbCourseToClient(db: DbCourse): GolfCourse {
  return {
    id: toStringId(db.id),
    name: db.name,
    location: db.location ?? undefined,
    greens: db.greens ?? [],
    createdAt: toISOString(db.createdAt),
  };
}

function dbPuttToClient(db: DbPutt): PuttData {
  return {
    strokeNumber: (db.strokeNumber as 1 | 2 | 3) ?? 1,
    cupIn: db.cupIn,
    distPrev: db.distPrev,
    result: (db.result as PuttData["result"]) ?? null,
    lengthSteps: db.lengthSteps,
    lengthYards: db.lengthYards,
    distanceMeters: db.distanceMeters ?? 0,
    missedDirection: (db.missedDirection as PuttData["missedDirection"]) ?? null,
    touch: (db.touch as PuttData["touch"]) ?? null,
    lineUD: (db.lineUD as PuttData["lineUD"]) ?? "flat",
    lineLR: (db.lineLR as PuttData["lineLR"]) ?? "straight",
    mental: parseMentalState(db.mental),
  };
}

function parseMentalState(v: string | null | undefined): PuttData["mental"] {
  if (v === null || v === undefined) return 3;
  if (v === "P") return "P";
  if (v === "N") return "N";
  const n = parseInt(v, 10);
  if (n >= 1 && n <= 5) return n as 1 | 2 | 3 | 4 | 5;
  return 3;
}

function dbHoleToClient(db: DbHole): HoleData {
  return {
    holeNumber: db.holeNumber,
    scoreResult: "par", // scoreResult is not stored in DB; default to "par"
    totalPutts: db.totalPutts ?? 0,
    putts: (db.putts ?? []).map(dbPuttToClient),
  };
}

function dbRoundToClient(db: DbRound): Round {
  // Build 18 holes: merge DB holes into a full 18-hole array
  const dbHoles = (db.holes ?? []).map(dbHoleToClient);
  const holesMap = new Map<number, HoleData>(dbHoles.map((h) => [h.holeNumber, h]));

  const holes: HoleData[] = Array.from({ length: 18 }, (_, i) => {
    const num = i + 1;
    return holesMap.get(num) ?? {
      holeNumber: num,
      scoreResult: "par",
      totalPutts: 0,
      putts: [],
    };
  });

  return {
    id: toStringId(db.id),
    date: db.date,
    weather: (db.weather as Round["weather"]) ?? "sunny",
    temperature: db.temperature ?? undefined,
    windSpeed: (db.windSpeed as Round["windSpeed"]) ?? "calm",
    courseId: toStringId(db.courseId),
    courseName: db.courseName,
    frontNineGreen: db.frontNineGreen ?? "",
    backNineGreen: db.backNineGreen ?? "",
    roundType: (db.roundType as Round["roundType"]) ?? "private",
    competitionFormat: (db.competitionFormat as Round["competitionFormat"]) ?? "stroke",
    grassType: (db.grassType as Round["grassType"]) ?? "bent",
    stimpmeter: db.stimpmeter ?? 9.0,
    mowingHeight: db.mowingHeight ?? undefined,
    compaction: db.compaction ?? undefined,
    greenCondition: (db.greenCondition as Round["greenCondition"]) ?? "good",
    putterId: toStringId(db.putterId),
    putterName: db.putterName ?? "",
    holes,
    totalPutts: db.totalPutts ?? 0,
    createdAt: toISOString(db.createdAt),
    updatedAt: toISOString(db.updatedAt),
  };
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const db = await trpcQuery<DbUserProfile | null>("golf.userProfile.get");
    if (!db) return null;
    return dbUserProfileToClient(db);
  } catch (error) {
    console.error("[api-golf] getUserProfile error:", error);
    throw error;
  }
}

export async function saveUserProfile(
  profile: Partial<UserProfile>,
): Promise<UserProfile> {
  try {
    const input: Record<string, unknown> = {};
    if (profile.gender !== undefined) input.gender = profile.gender;
    if (profile.birthDate !== undefined) input.birthDate = profile.birthDate;
    if (profile.handicap !== undefined) input.handicap = profile.handicap;
    if (profile.strideLength !== undefined) input.strideLength = profile.strideLength;

    const db = await trpcMutate<DbUserProfile>("golf.userProfile.upsert", input);
    const client = dbUserProfileToClient(db);
    // Preserve the name from the incoming profile if provided
    if (profile.name !== undefined) client.name = profile.name;
    return client;
  } catch (error) {
    console.error("[api-golf] saveUserProfile error:", error);
    throw error;
  }
}

// ─── Putters ──────────────────────────────────────────────────────────────────

export async function getPutters(): Promise<Putter[]> {
  try {
    const list = await trpcQuery<DbPutter[]>("golf.putters.list");
    return (list ?? []).map(dbPutterToClient);
  } catch (error) {
    console.error("[api-golf] getPutters error:", error);
    throw error;
  }
}

export async function getPutter(id: string): Promise<Putter | null> {
  try {
    const numId = toNumericId(id);
    if (isNaN(numId)) return null;
    const db = await trpcQuery<DbPutter>("golf.putters.get", { id: numId });
    return db ? dbPutterToClient(db) : null;
  } catch (error) {
    console.error("[api-golf] getPutter error:", error);
    throw error;
  }
}

/**
 * savePutter — creates a new putter (matches the lib/storage.ts signature).
 * The `id`, `createdAt`, `updatedAt` fields are omitted as the server generates them.
 */
export async function savePutter(
  putter: Omit<Putter, "id" | "createdAt" | "updatedAt">,
): Promise<Putter> {
  try {
    const db = await trpcMutate<DbPutter>("golf.putters.create", {
      brandName: putter.brandName,
      productName: putter.productName,
      length: putter.length ?? null,
      lieAngle: putter.lieAngle ?? null,
      weight: putter.weight ?? null,
      gripName: putter.gripName || null,
      startDate: putter.startDate || null,
      usageCount: putter.usageCount ?? 0,
      ranking: putter.ranking ?? "ace",
    });
    return dbPutterToClient(db);
  } catch (error) {
    console.error("[api-golf] savePutter error:", error);
    throw error;
  }
}

/**
 * updatePutter — updates an existing putter (matches lib/storage.ts signature).
 */
export async function updatePutter(
  id: string,
  updates: Partial<Putter>,
): Promise<Putter | null> {
  try {
    const numId = toNumericId(id);
    if (isNaN(numId)) return null;

    const input: Record<string, unknown> = { id: numId };
    if (updates.brandName !== undefined) input.brandName = updates.brandName;
    if (updates.productName !== undefined) input.productName = updates.productName;
    if (updates.length !== undefined) input.length = updates.length;
    if (updates.lieAngle !== undefined) input.lieAngle = updates.lieAngle;
    if (updates.weight !== undefined) input.weight = updates.weight;
    if (updates.gripName !== undefined) input.gripName = updates.gripName || null;
    if (updates.startDate !== undefined) input.startDate = updates.startDate || null;
    if (updates.usageCount !== undefined) input.usageCount = updates.usageCount;
    if (updates.ranking !== undefined) input.ranking = updates.ranking;

    const db = await trpcMutate<DbPutter>("golf.putters.update", input);
    return db ? dbPutterToClient(db) : null;
  } catch (error) {
    console.error("[api-golf] updatePutter error:", error);
    throw error;
  }
}

export async function deletePutter(id: string): Promise<boolean> {
  try {
    const numId = toNumericId(id);
    if (isNaN(numId)) return false;
    await trpcMutate<{ success: true }>("golf.putters.delete", { id: numId });
    return true;
  } catch (error) {
    console.error("[api-golf] deletePutter error:", error);
    return false;
  }
}

// ─── Courses ──────────────────────────────────────────────────────────────────

export async function getCourses(): Promise<GolfCourse[]> {
  try {
    const list = await trpcQuery<DbCourse[]>("golf.courses.list");
    return (list ?? []).map(dbCourseToClient);
  } catch (error) {
    console.error("[api-golf] getCourses error:", error);
    throw error;
  }
}

/**
 * saveCourse — creates a new course (matches lib/storage.ts signature).
 */
export async function saveCourse(
  course: Omit<GolfCourse, "id" | "createdAt">,
): Promise<GolfCourse> {
  try {
    const db = await trpcMutate<DbCourse>("golf.courses.create", {
      name: course.name,
      location: course.location ?? null,
      greens: course.greens ?? [],
    });
    return dbCourseToClient(db);
  } catch (error) {
    console.error("[api-golf] saveCourse error:", error);
    throw error;
  }
}

export async function deleteCourse(id: string): Promise<boolean> {
  try {
    const numId = toNumericId(id);
    if (isNaN(numId)) return false;
    await trpcMutate<{ success: true }>("golf.courses.delete", { id: numId });
    return true;
  } catch (error) {
    console.error("[api-golf] deleteCourse error:", error);
    return false;
  }
}

// ─── Rounds ───────────────────────────────────────────────────────────────────

export async function getRounds(): Promise<Round[]> {
  try {
    const list = await trpcQuery<DbRound[]>("golf.rounds.list");
    if (!list || list.length === 0) return [];
    // The list endpoint does NOT include holes; add empty holes array
    const rounds = list.map((r) => dbRoundToClient(r));
    // Sort descending by date (same as original AsyncStorage implementation)
    return rounds.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  } catch (error) {
    console.error("[api-golf] getRounds error:", error);
    throw error;
  }
}

export async function getRound(id: string): Promise<Round | null> {
  try {
    const numId = toNumericId(id);
    if (isNaN(numId)) return null;
    // rounds.get returns round with nested holes + putts
    const db = await trpcQuery<DbRound & { holes: DbHole[] }>(
      "golf.rounds.get",
      { id: numId },
    );
    return db ? dbRoundToClient(db) : null;
  } catch (error) {
    console.error("[api-golf] getRound error:", error);
    throw error;
  }
}

/**
 * saveRound — creates a new round (matches lib/storage.ts signature).
 * The `holes` array from the client type is NOT sent to the DB rounds table
 * (holes are stored in a separate table). We send hole data via saveHolesForRound.
 */
export async function saveRound(
  round: Omit<Round, "id" | "createdAt" | "updatedAt">,
): Promise<Round> {
  try {
    // Convert courseId and putterId from strings to numbers (or null)
    const courseIdNum = round.courseId ? toNumericId(round.courseId) : null;
    const putterIdNum = round.putterId ? toNumericId(round.putterId) : null;

    const input: Record<string, unknown> = {
      date: round.date.split("T")[0], // Ensure YYYY-MM-DD format
      courseName: round.courseName,
      courseId: !isNaN(courseIdNum ?? NaN) ? courseIdNum : null,
      frontNineGreen: round.frontNineGreen || null,
      backNineGreen: round.backNineGreen || null,
      weather: round.weather ?? null,
      temperature: round.temperature ?? null,
      windSpeed: round.windSpeed ?? null,
      roundType: round.roundType ?? null,
      competitionFormat: round.competitionFormat ?? null,
      grassType: round.grassType ?? null,
      stimpmeter: round.stimpmeter ?? null,
      mowingHeight: round.mowingHeight ?? null,
      compaction: round.compaction ?? null,
      greenCondition: round.greenCondition ?? null,
      putterId: !isNaN(putterIdNum ?? NaN) ? putterIdNum : null,
      putterName: round.putterName || null,
      totalPutts: round.totalPutts ?? 0,
    };

    const db = await trpcMutate<DbRound>("golf.rounds.create", input);
    const clientRound = dbRoundToClient(db);

    // If there are holes with data, persist them
    if (round.holes && round.holes.length > 0) {
      const saved = await saveHolesForRound(clientRound.id, round.holes);
      // Merge holes into the returned round
      return { ...clientRound, holes: saved.holes };
    }

    return clientRound;
  } catch (error) {
    console.error("[api-golf] saveRound error:", error);
    throw error;
  }
}

/**
 * updateRound — updates an existing round.
 * Handles both metadata updates and holes updates.
 */
export async function updateRound(
  id: string,
  updates: Partial<Round>,
): Promise<Round | null> {
  try {
    const numId = toNumericId(id);
    if (isNaN(numId)) return null;

    const input: Record<string, unknown> = { id: numId };

    if (updates.date !== undefined) input.date = updates.date.split("T")[0];
    if (updates.courseName !== undefined) input.courseName = updates.courseName;
    if (updates.courseId !== undefined) {
      const n = toNumericId(updates.courseId);
      input.courseId = isNaN(n) ? null : n;
    }
    if (updates.frontNineGreen !== undefined)
      input.frontNineGreen = updates.frontNineGreen || null;
    if (updates.backNineGreen !== undefined)
      input.backNineGreen = updates.backNineGreen || null;
    if (updates.weather !== undefined) input.weather = updates.weather ?? null;
    if (updates.temperature !== undefined)
      input.temperature = updates.temperature ?? null;
    if (updates.windSpeed !== undefined) input.windSpeed = updates.windSpeed ?? null;
    if (updates.roundType !== undefined) input.roundType = updates.roundType ?? null;
    if (updates.competitionFormat !== undefined)
      input.competitionFormat = updates.competitionFormat ?? null;
    if (updates.grassType !== undefined) input.grassType = updates.grassType ?? null;
    if (updates.stimpmeter !== undefined)
      input.stimpmeter = updates.stimpmeter ?? null;
    if (updates.mowingHeight !== undefined)
      input.mowingHeight = updates.mowingHeight ?? null;
    if (updates.compaction !== undefined)
      input.compaction = updates.compaction ?? null;
    if (updates.greenCondition !== undefined)
      input.greenCondition = updates.greenCondition ?? null;
    if (updates.putterId !== undefined) {
      const n = toNumericId(updates.putterId);
      input.putterId = isNaN(n) ? null : n;
    }
    if (updates.putterName !== undefined)
      input.putterName = updates.putterName || null;
    if (updates.totalPutts !== undefined) input.totalPutts = updates.totalPutts ?? 0;

    // Update the round metadata
    const db = await trpcMutate<DbRound>("golf.rounds.update", input);
    if (!db) return null;

    const clientRound = dbRoundToClient(db);

    // If holes are included in the update, persist them too
    if (updates.holes && updates.holes.length > 0) {
      const saved = await saveHolesForRound(id, updates.holes);
      return { ...clientRound, holes: saved.holes };
    }

    // Re-fetch the full round (with holes) to return up-to-date state
    return await getRound(id);
  } catch (error) {
    console.error("[api-golf] updateRound error:", error);
    throw error;
  }
}

export async function deleteRound(id: string): Promise<boolean> {
  try {
    const numId = toNumericId(id);
    if (isNaN(numId)) return false;
    await trpcMutate<{ success: true }>("golf.rounds.delete", { id: numId });
    return true;
  } catch (error) {
    console.error("[api-golf] deleteRound error:", error);
    return false;
  }
}

/** Clear all hole/putt data for a round while keeping the round metadata. */
export async function resetRoundHoles(id: string): Promise<boolean> {
  try {
    const numId = toNumericId(id);
    if (isNaN(numId)) return false;
    await trpcMutate<{ success: true }>("golf.rounds.resetHoles", { id: numId });
    return true;
  } catch (error) {
    console.error("[api-golf] resetRoundHoles error:", error);
    return false;
  }
}

/** Delete all rounds (and their hole/putt data) for the current user. */
export async function deleteAllRounds(): Promise<boolean> {
  try {
    await trpcMutate<{ success: true }>("golf.rounds.deleteAll");
    return true;
  } catch (error) {
    console.error("[api-golf] deleteAllRounds error:", error);
    return false;
  }
}

// ─── Holes ────────────────────────────────────────────────────────────────────

interface SaveHolesResult {
  roundId: string;
  holes: HoleData[];
}

/**
 * saveHolesForRound — upserts all holes (and their putts) for a round.
 * Matches the interface expected by hole-input screen.
 */
export async function saveHolesForRound(
  roundId: string,
  holes: HoleData[],
): Promise<SaveHolesResult> {
  const numRoundId = toNumericId(roundId);
  if (isNaN(numRoundId)) throw new Error(`Invalid roundId: ${roundId}`);

  // Map client HoleData → the shape expected by holes.upsertHoles
  const holesInput = holes.map((hole) => ({
    holeNumber: hole.holeNumber,
    totalPutts: hole.totalPutts,
    putts: hole.putts.map((putt) => ({
      strokeNumber: putt.strokeNumber,
      cupIn: putt.cupIn,
      distPrev: putt.distPrev,
      result: putt.result ?? null,
      lengthSteps: putt.lengthSteps,
      lengthYards: putt.lengthYards,
      distanceMeters: putt.distanceMeters,
      missedDirection: putt.missedDirection,
      touch: putt.touch,
      lineUD: putt.lineUD,
      lineLR: putt.lineLR,
      mental: putt.mental !== null && putt.mental !== undefined
        ? String(putt.mental)
        : null,
    })),
  }));

  interface UpsertHolesResult {
    roundId: number;
    holes: DbHole[];
  }

  const result = await trpcMutate<UpsertHolesResult>("golf.holes.upsertHoles", {
    roundId: numRoundId,
    holes: holesInput,
  });

  // Map DB holes back to client HoleData, preserving scoreResult from input
  const clientHoles: HoleData[] = (result?.holes ?? []).map((dbHole) => {
    const inputHole = holes.find((h) => h.holeNumber === dbHole.holeNumber);
    return {
      holeNumber: dbHole.holeNumber,
      scoreResult: inputHole?.scoreResult ?? "par",
      totalPutts: dbHole.totalPutts ?? 0,
      putts: (dbHole.putts ?? []).map(dbPuttToClient),
    };
  });

  // Ensure all 18 holes are present
  const holesMap = new Map<number, HoleData>(clientHoles.map((h) => [h.holeNumber, h]));
  const allHoles: HoleData[] = Array.from({ length: 18 }, (_, i) => {
    const num = i + 1;
    return (
      holesMap.get(num) ?? {
        holeNumber: num,
        scoreResult: "par",
        totalPutts: 0,
        putts: [],
      }
    );
  });

  return { roundId, holes: allHoles };
}
