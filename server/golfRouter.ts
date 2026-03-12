import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createCourse,
  createPutter,
  createRound,
  deleteCourse,
  deletePutter,
  deleteRound,
  deleteHolesByRound,
  deleteAllRounds,
  getCourse,
  getCourses,
  getHolesByRound,
  getPutter,
  getPutters,
  getPuttsByHoles,
  getRound,
  getRounds,
  getUserProfile,
  updateCourse,
  updatePutter,
  updateRound,
  upsertHole,
  upsertPutts,
  upsertUserProfile,
} from "./db";

// ─── Reusable zod schemas ─────────────────────────────────────────────────────

const genderSchema = z.enum(["male", "female", "other"]);

const rankingSchema = z.enum(["ace", "2nd", "3rd", "4th", "5th"]);

const weatherSchema = z.enum(["sunny", "cloudy", "rainy", "windy"]);

const windSpeedSchema = z.enum(["calm", "light", "moderate", "strong"]);

const roundTypeSchema = z.enum([
  "competition",
  "club_competition",
  "private",
  "practice",
]);

const competitionFormatSchema = z.enum(["stroke", "match"]);

const grassTypeSchema = z.enum(["bent", "korai", "bermuda", "other"]);

const greenConditionSchema = z.enum(["excellent", "good", "fair"]);

const scoreResultSchema = z.enum([
  "eagle",
  "birdie",
  "par",
  "bogey",
  "double_bogey_plus",
]);

const slopeUpDownSchema = z.enum([
  "flat",
  "uphill",
  "downhill",
  "up_down",
  "down_up",
]);

const slopeLeftRightSchema = z.enum([
  "straight",
  "left",
  "right",
  "left_right",
  "right_left",
]);

// ─── Putt input schema (used inside hole input) ───────────────────────────────

const puttInputSchema = z.object({
  strokeNumber: z.number().int().min(1).max(3),
  cupIn: z.boolean().default(false),
  distPrev: z.number().int().nullable().optional(),
  result: scoreResultSchema.nullable().optional(),
  lengthSteps: z.number().int().nullable().optional(),
  lengthMeters: z.number().nullable().optional(),
  distanceMeters: z.number().nullable().optional(),
  missedDirection: z.number().int().min(1).max(5).nullable().optional(),
  touch: z.number().int().min(1).max(5).nullable().optional(),
  lineUD: slopeUpDownSchema.nullable().optional(),
  lineLR: slopeLeftRightSchema.nullable().optional(),
  mental: z.string().max(4).nullable().optional(),
});

// ─── Hole input schema (used in upsertHoles) ─────────────────────────────────

const holeInputSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  totalPutts: z.number().int().min(0).optional(),
  putts: z.array(puttInputSchema).max(3).optional(),
});

// ─── userProfile router ───────────────────────────────────────────────────────

export const userProfileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getUserProfile(ctx.user.id);
    return profile ?? null;
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        gender: genderSchema.optional(),
        birthDate: z.string().max(10).optional(),
        handicap: z.number().optional(),
        strideLength: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return upsertUserProfile(ctx.user.id, input);
    }),
});

// ─── putters router ───────────────────────────────────────────────────────────

export const puttersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getPutters(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const putter = await getPutter(input.id, ctx.user.id);
      if (!putter) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Putter not found" });
      }
      return putter;
    }),

  create: protectedProcedure
    .input(
      z.object({
        brandName: z.string().min(1).max(128),
        productName: z.string().min(1).max(128),
        length: z.number().nullable().optional(),
        lieAngle: z.number().nullable().optional(),
        weight: z.number().nullable().optional(),
        gripName: z.string().max(128).nullable().optional(),
        startDate: z.string().max(10).nullable().optional(),
        usageCount: z.number().int().min(0).optional(),
        ranking: rankingSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createPutter({ userId: ctx.user.id, ...input });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        brandName: z.string().min(1).max(128).optional(),
        productName: z.string().min(1).max(128).optional(),
        length: z.number().nullable().optional(),
        lieAngle: z.number().nullable().optional(),
        weight: z.number().nullable().optional(),
        gripName: z.string().max(128).nullable().optional(),
        startDate: z.string().max(10).nullable().optional(),
        usageCount: z.number().int().min(0).optional(),
        ranking: rankingSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updated = await updatePutter(id, ctx.user.id, data);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Putter not found" });
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before delete
      const putter = await getPutter(input.id, ctx.user.id);
      if (!putter) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Putter not found" });
      }
      await deletePutter(input.id, ctx.user.id);
      return { success: true as const };
    }),
});

// ─── courses router ───────────────────────────────────────────────────────────

export const coursesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getCourses(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const course = await getCourse(input.id, ctx.user.id);
      if (!course) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      return course;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(256),
        location: z.string().max(256).nullable().optional(),
        greens: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createCourse({ userId: ctx.user.id, ...input });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(256).optional(),
        location: z.string().max(256).nullable().optional(),
        greens: z.array(z.string()).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updated = await updateCourse(id, ctx.user.id, data);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const course = await getCourse(input.id, ctx.user.id);
      if (!course) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      await deleteCourse(input.id, ctx.user.id);
      return { success: true as const };
    }),
});

// ─── rounds router ────────────────────────────────────────────────────────────

export const roundsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getRounds(ctx.user.id);
  }),

  /** Returns the round with all nested holes and putts. */
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const round = await getRound(input.id, ctx.user.id);
      if (!round) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });
      }

      const holesData = await getHolesByRound(round.id);

      // Batch-fetch all putts in one query instead of N separate queries
      const holeIds = holesData.map((h) => h.id);
      const allPutts = await getPuttsByHoles(holeIds);
      const holesWithPutts = holesData.map((hole) => ({
        ...hole,
        putts: allPutts.filter((p) => p.holeId === hole.id),
      }));

      return { ...round, holes: holesWithPutts };
    }),

  create: protectedProcedure
    .input(
      z.object({
        date: z.string().min(1).max(10),
        courseId: z.number().int().nullable().optional(),
        courseName: z.string().min(1).max(256),
        frontNineGreen: z.string().max(32).nullable().optional(),
        backNineGreen: z.string().max(32).nullable().optional(),
        weather: weatherSchema.nullable().optional(),
        temperature: z.number().nullable().optional(),
        windSpeed: windSpeedSchema.nullable().optional(),
        roundType: roundTypeSchema.nullable().optional(),
        competitionFormat: competitionFormatSchema.nullable().optional(),
        grassType: grassTypeSchema.nullable().optional(),
        stimpmeter: z.number().nullable().optional(),
        mowingHeight: z.number().nullable().optional(),
        compaction: z.number().nullable().optional(),
        greenCondition: greenConditionSchema.nullable().optional(),
        putterId: z.number().int().nullable().optional(),
        putterName: z.string().max(256).nullable().optional(),
        totalPutts: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createRound({ userId: ctx.user.id, ...input });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        date: z.string().min(1).max(10).optional(),
        courseId: z.number().int().nullable().optional(),
        courseName: z.string().min(1).max(256).optional(),
        frontNineGreen: z.string().max(32).nullable().optional(),
        backNineGreen: z.string().max(32).nullable().optional(),
        weather: weatherSchema.nullable().optional(),
        temperature: z.number().nullable().optional(),
        windSpeed: windSpeedSchema.nullable().optional(),
        roundType: roundTypeSchema.nullable().optional(),
        competitionFormat: competitionFormatSchema.nullable().optional(),
        grassType: grassTypeSchema.nullable().optional(),
        stimpmeter: z.number().nullable().optional(),
        mowingHeight: z.number().nullable().optional(),
        compaction: z.number().nullable().optional(),
        greenCondition: greenConditionSchema.nullable().optional(),
        putterId: z.number().int().nullable().optional(),
        putterName: z.string().max(256).nullable().optional(),
        totalPutts: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updated = await updateRound(id, ctx.user.id, data);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const round = await getRound(input.id, ctx.user.id);
      if (!round) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });
      }
      await deleteRound(input.id, ctx.user.id);
      return { success: true as const };
    }),

  /** Clear all hole/putt data for a round, keeping the round metadata. */
  resetHoles: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const round = await getRound(input.id, ctx.user.id);
      if (!round) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });
      }
      await deleteHolesByRound(input.id);
      return { success: true as const };
    }),

  /** Delete all rounds (and their holes/putts) for the authenticated user. */
  deleteAll: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteAllRounds(ctx.user.id);
    return { success: true as const };
  }),
});

// ─── holes router ─────────────────────────────────────────────────────────────

export const holesRouter = router({
  /**
   * Saves all holes (up to 18) for a round in one call.
   * Each hole's putts are fully replaced.
   * Verifies the round belongs to the authenticated user before writing.
   */
  upsertHoles: protectedProcedure
    .input(
      z.object({
        roundId: z.number().int(),
        holes: z.array(holeInputSchema).max(18),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Authorization check: round must belong to this user
      const round = await getRound(input.roundId, ctx.user.id);
      if (!round) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });
      }

      const savedHoles = await Promise.all(
        input.holes.map(async (holeInput) => {
          const { holeNumber, totalPutts, putts: puttsInput } = holeInput;

          const hole = await upsertHole(input.roundId, holeNumber, {
            totalPutts: totalPutts ?? 0,
          });

          const savedPutts =
            puttsInput && puttsInput.length > 0
              ? await upsertPutts(hole.id, puttsInput)
              : await upsertPutts(hole.id, []);

          return { ...hole, putts: savedPutts };
        }),
      );

      return { roundId: input.roundId, holes: savedHoles };
    }),
});

// ─── Combined golf router ─────────────────────────────────────────────────────

export const golfRouter = router({
  userProfile: userProfileRouter,
  putters: puttersRouter,
  courses: coursesRouter,
  rounds: roundsRouter,
  holes: holesRouter,
});
