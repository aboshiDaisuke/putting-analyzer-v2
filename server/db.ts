import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  Hole,
  InsertCourse,
  InsertHole,
  InsertPutt,
  InsertPutter,
  InsertRound,
  InsertUser,
  InsertUserProfile,
  Putt,
  courses,
  holes,
  putts,
  putters,
  rounds,
  userProfiles,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false, // required for Supabase connection pooler (PgBouncer)
      });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.openId,
        set: updateSet,
      });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

/** users.name を更新する（プロフィール画面の表示名）。 */
export async function updateUserName(userId: number, name: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ name, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── User Profiles ────────────────────────────────────────────────────────────

export async function getUserProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function upsertUserProfile(
  userId: number,
  data: Omit<InsertUserProfile, "userId" | "id" | "createdAt" | "updatedAt">,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const values: InsertUserProfile = { userId, ...data };
  const updateSet: Partial<InsertUserProfile> & { updatedAt: Date } = {
    ...data,
    updatedAt: new Date(),
  };

  const result = await db
    .insert(userProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: updateSet,
    })
    .returning();

  return result[0];
}

// ─── Putters ──────────────────────────────────────────────────────────────────

export async function getPutters(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(putters).where(eq(putters.userId, userId));
}

export async function getPutter(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(putters)
    .where(and(eq(putters.id, id), eq(putters.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createPutter(
  data: Omit<InsertPutter, "id" | "createdAt" | "updatedAt">,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(putters).values(data).returning();
  return result[0];
}

export async function updatePutter(
  id: number,
  userId: number,
  data: Partial<Omit<InsertPutter, "id" | "userId" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(putters)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(putters.id, id), eq(putters.userId, userId)))
    .returning();

  return result.length > 0 ? result[0] : undefined;
}

export async function deletePutter(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(putters)
    .where(and(eq(putters.id, id), eq(putters.userId, userId)));
}

// ─── Courses ──────────────────────────────────────────────────────────────────

export async function getCourses(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(courses).where(eq(courses.userId, userId));
}

export async function getCourse(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createCourse(
  data: Omit<InsertCourse, "id" | "createdAt">,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(courses).values(data).returning();
  return result[0];
}

export async function updateCourse(
  id: number,
  userId: number,
  data: Partial<Omit<InsertCourse, "id" | "userId" | "createdAt">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(courses)
    .set(data)
    .where(and(eq(courses.id, id), eq(courses.userId, userId)))
    .returning();

  return result.length > 0 ? result[0] : undefined;
}

export async function deleteCourse(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(courses)
    .where(and(eq(courses.id, id), eq(courses.userId, userId)));
}

// ─── Rounds ───────────────────────────────────────────────────────────────────

/**
 * ラウンド一覧。ホールは含めず、代わりにパットが入力済みのホール数 `holesPlayed` を
 * 付けて返す（一覧・ホームで「平均パット/H」を正しい分母で出すため）。
 */
export async function getRounds(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const holesPlayedSubquery = sql<number>`(
    SELECT COUNT(*)::int FROM ${holes}
    WHERE ${holes.roundId} = ${rounds.id} AND ${holes.totalPutts} > 0
  )`;

  return db
    .select({
      id: rounds.id,
      userId: rounds.userId,
      date: rounds.date,
      courseId: rounds.courseId,
      courseName: rounds.courseName,
      frontNineGreen: rounds.frontNineGreen,
      backNineGreen: rounds.backNineGreen,
      weather: rounds.weather,
      temperature: rounds.temperature,
      windSpeed: rounds.windSpeed,
      roundType: rounds.roundType,
      competitionFormat: rounds.competitionFormat,
      grassType: rounds.grassType,
      stimpmeter: rounds.stimpmeter,
      mowingHeight: rounds.mowingHeight,
      compaction: rounds.compaction,
      greenCondition: rounds.greenCondition,
      putterId: rounds.putterId,
      putterName: rounds.putterName,
      totalPutts: rounds.totalPutts,
      createdAt: rounds.createdAt,
      updatedAt: rounds.updatedAt,
      holesPlayed: holesPlayedSubquery,
    })
    .from(rounds)
    .where(eq(rounds.userId, userId));
}

/**
 * Returns all of a user's rounds with their holes and putts hydrated.
 * Uses 3 batched queries (rounds, holes, putts) to avoid N+1. Intended for
 * the analytics screen, where per-hole/per-putt data is required.
 */
export async function getRoundsWithHoles(userId: number, fromDate?: string) {
  const db = await getDb();
  if (!db) return [];

  const roundRows = await db
    .select()
    .from(rounds)
    .where(
      fromDate
        ? and(eq(rounds.userId, userId), gte(rounds.date, fromDate))
        : eq(rounds.userId, userId),
    );
  if (roundRows.length === 0) return [];

  const roundIds = roundRows.map((r) => r.id);
  const holeRows = await db.select().from(holes).where(inArray(holes.roundId, roundIds));

  const holeIds = holeRows.map((h) => h.id);
  const puttRows =
    holeIds.length > 0
      ? await db.select().from(putts).where(inArray(putts.holeId, holeIds))
      : [];

  const puttsByHole = new Map<number, typeof puttRows>();
  for (const p of puttRows) {
    const arr = puttsByHole.get(p.holeId);
    if (arr) arr.push(p);
    else puttsByHole.set(p.holeId, [p]);
  }

  const holesByRound = new Map<number, Array<(typeof holeRows)[number] & { putts: typeof puttRows }>>();
  for (const h of holeRows) {
    const withPutts = { ...h, putts: puttsByHole.get(h.id) ?? [] };
    const arr = holesByRound.get(h.roundId);
    if (arr) arr.push(withPutts);
    else holesByRound.set(h.roundId, [withPutts]);
  }

  return roundRows.map((r) => ({ ...r, holes: holesByRound.get(r.id) ?? [] }));
}

export async function getRound(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, id), eq(rounds.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createRound(
  data: Omit<InsertRound, "id" | "createdAt" | "updatedAt">,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(rounds).values(data).returning();
  return result[0];
}

export async function updateRound(
  id: number,
  userId: number,
  data: Partial<Omit<InsertRound, "id" | "userId" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(rounds)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(rounds.id, id), eq(rounds.userId, userId)))
    .returning();

  return result.length > 0 ? result[0] : undefined;
}

export async function deleteRound(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(rounds)
    .where(and(eq(rounds.id, id), eq(rounds.userId, userId)));
}

// ─── Holes ────────────────────────────────────────────────────────────────────

export async function getHolesByRound(roundId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(holes).where(eq(holes.roundId, roundId));
}

export type HoleSaveInput = {
  holeNumber: number;
  scoreResult: InsertHole["scoreResult"];
  totalPutts: number;
  putts: Omit<InsertPutt, "id" | "holeId" | "createdAt" | "updatedAt">[];
};

/**
 * 複数ホール（とそのパット）を1トランザクションで保存し、ラウンドの totalPutts を
 * DB上の全ホール合計から再計算する。
 *  - ホールは (roundId, holeNumber) のユニーク制約で upsert（並行保存でも重複しない）
 *  - パットは delete → insert で全置換
 *  - 途中で失敗した場合は全てロールバックされる
 */
export async function saveHoles(roundId: number, holesInput: HoleSaveInput[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.transaction(async (tx) => {
    const now = new Date();
    const saved: Array<Hole & { putts: Putt[] }> = [];

    for (const holeInput of holesInput) {
      const [hole] = await tx
        .insert(holes)
        .values({
          roundId,
          holeNumber: holeInput.holeNumber,
          scoreResult: holeInput.scoreResult,
          totalPutts: holeInput.totalPutts,
        })
        .onConflictDoUpdate({
          target: [holes.roundId, holes.holeNumber],
          set: {
            scoreResult: holeInput.scoreResult,
            totalPutts: holeInput.totalPutts,
            updatedAt: now,
          },
        })
        .returning();

      await tx.delete(putts).where(eq(putts.holeId, hole.id));
      const savedPutts =
        holeInput.putts.length > 0
          ? await tx
              .insert(putts)
              .values(holeInput.putts.map((p) => ({ holeId: hole.id, ...p })))
              .returning()
          : [];

      saved.push({ ...hole, putts: savedPutts });
    }

    // ラウンド合計はクライアントの値を信用せず、DB上の全ホールから再計算する
    const [{ total }] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${holes.totalPutts}), 0)::int` })
      .from(holes)
      .where(eq(holes.roundId, roundId));

    await tx
      .update(rounds)
      .set({ totalPutts: total, updatedAt: now })
      .where(eq(rounds.id, roundId));

    return { holes: saved, totalPutts: total };
  });
}

// ─── Putts ────────────────────────────────────────────────────────────────────

export async function getPuttsByHole(holeId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(putts).where(eq(putts.holeId, holeId));
}

/** Fetch all putts for multiple holes in a single query (avoids N+1). */
export async function getPuttsByHoles(holeIds: number[]) {
  const db = await getDb();
  if (!db || holeIds.length === 0) return [];

  return db.select().from(putts).where(inArray(putts.holeId, holeIds));
}

/** Delete all holes (and cascade putts) for a round, then reset totalPutts to 0. */
export async function deleteHolesByRound(roundId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    // Delete holes — putts cascade automatically via FK onDelete: "cascade"
    await tx.delete(holes).where(eq(holes.roundId, roundId));

    // Reset totalPutts on the round
    await tx
      .update(rounds)
      .set({ totalPutts: 0, updatedAt: new Date() })
      .where(eq(rounds.id, roundId));
  });
}

/** Delete all rounds for a user — holes and putts cascade automatically. */
export async function deleteAllRounds(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(rounds).where(eq(rounds.userId, userId));
}
