import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertCourse,
  InsertHole,
  InsertPutt,
  InsertPutter,
  InsertRound,
  InsertUser,
  InsertUserProfile,
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
      const client = postgres(process.env.DATABASE_URL, { max: 5 });
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

export async function getRounds(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(rounds).where(eq(rounds.userId, userId));
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

export async function upsertHole(
  roundId: number,
  holeNumber: number,
  data: Partial<Omit<InsertHole, "id" | "roundId" | "holeNumber" | "createdAt" | "updatedAt">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const values: InsertHole = { roundId, holeNumber, ...data };
  const updateSet: Partial<InsertHole> & { updatedAt: Date } = {
    ...data,
    updatedAt: new Date(),
  };

  // Drizzle doesn't support composite unique constraints with onConflictDoUpdate
  // without explicit target columns, so we check-then-upsert manually.
  const existing = await db
    .select()
    .from(holes)
    .where(and(eq(holes.roundId, roundId), eq(holes.holeNumber, holeNumber)))
    .limit(1);

  if (existing.length > 0) {
    const updated = await db
      .update(holes)
      .set(updateSet)
      .where(eq(holes.id, existing[0].id))
      .returning();
    return updated[0];
  }

  const inserted = await db.insert(holes).values(values).returning();
  return inserted[0];
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

/**
 * Replace all putts for a hole with the provided array.
 * Deletes existing rows, then inserts fresh ones — keeping it simple and correct.
 */
export async function upsertPutts(
  holeId: number,
  puttsData: Omit<InsertPutt, "id" | "holeId" | "createdAt" | "updatedAt">[],
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(putts).where(eq(putts.holeId, holeId));

  if (puttsData.length === 0) return [];

  const rows: InsertPutt[] = puttsData.map((p) => ({ holeId, ...p }));
  return db.insert(putts).values(rows).returning();
}
