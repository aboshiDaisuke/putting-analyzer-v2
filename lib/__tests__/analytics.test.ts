import { describe, it, expect } from "vitest";
import {
  calculateDistance,
  formatDate,
  getDistanceRange,
  calculateStats,
  calculateAnalyticsSummary,
  calculateRoundTrend,
  getPeriodCutoffDate,
  generatePracticeInsights,
  isReferenceSample,
  analyzeByDistance,
  analyzeBySlope,
} from "../analytics";
import type { Round, HoleData, PuttData, SlopeUpDown } from "../types";

// 新しいPuttDataモデルに合わせたヘルパー
const createPutt = (overrides: Partial<PuttData> = {}): PuttData => ({
  strokeNumber: 1,
  cupIn: false,
  distPrev: null,
  result: null,
  lengthSteps: null,
  lengthMeters: null,
  distanceMeters: 0,
  lineUD: "flat",
  lineLR: "straight",
  ...overrides,
});

const createRound = (
  totalPutts: number,
  holes: Partial<HoleData>[]
): Round => ({
  id: "test-round",
  date: "2024-01-15T09:00:00.000Z",
  weather: "sunny",
  windSpeed: "calm",
  courseId: "course-1",
  courseName: "テストゴルフ場",
  frontNineGreen: "A",
  backNineGreen: "A",
  roundType: "private",
  competitionFormat: "stroke",
  grassType: "bent",
  stimpmeter: 9.5,
  greenCondition: "good",
  putterId: "putter-1",
  putterName: "Test Putter",
  holes: holes.map((h, i) => ({
    holeNumber: i + 1,
    scoreResult: "par" as const,
    totalPutts: h.totalPutts ?? 2,
    putts: h.putts ?? [],
  })),
  totalPutts,
  createdAt: "2024-01-15T09:00:00.000Z",
  updatedAt: "2024-01-15T09:00:00.000Z",
});

describe("Analytics Functions", () => {
  describe("hydrated round analytics", () => {
    it("uses only holes with entered putts for 9-hole summary metrics", () => {
      const holes = Array.from({ length: 18 }, (_, i) => ({
        totalPutts: i < 3 ? 1 : i < 9 ? 2 : 0,
      }));
      const round = createRound(999, holes);

      const summary = calculateAnalyticsSummary([round]);

      expect(summary.averagePutts).toBeCloseTo(15 / 9);
      expect(summary.onePuttRate).toBeCloseTo((3 / 9) * 100);
      expect(summary.threePuttRate).toBe(0);
      expect(summary.greenSpeedStats.find((s) => s.rounds > 0)?.averagePutts)
        .toBeCloseTo(15 / 9);
      expect(summary.putterStats[0].averagePutts).toBeCloseTo(15 / 9);
    });

    it("excludes empty rounds from trends and derives totals from played holes", () => {
      const played = createRound(999, [
        { totalPutts: 1 },
        { totalPutts: 2 },
        { totalPutts: 2 },
      ]);
      const empty = createRound(0, Array.from({ length: 18 }, () => ({ totalPutts: 0 })));
      empty.id = "empty";
      empty.date = "2024-01-16T09:00:00.000Z";

      const trend = calculateRoundTrend([empty, played]);

      expect(trend).toHaveLength(1);
      expect(trend[0].avgPutts).toBeCloseTo(5 / 3);
      expect(trend[0].onePuttRate).toBeCloseTo(100 / 3);
    });

    it("creates stable period cutoffs from an injected clock", () => {
      const now = new Date(2026, 6, 17, 12);

      expect(getPeriodCutoffDate("all", now)).toBeNull();
      expect(getPeriodCutoffDate("month", now)).toEqual(new Date(2026, 5, 17));
      expect(getPeriodCutoffDate("year", now)).toEqual(new Date(2025, 6, 17));
    });

    it("returns three prioritized issues with actionable practice menus", () => {
      const round = createRound(12, [
        { totalPutts: 3 },
        { totalPutts: 3 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 1 },
        { totalPutts: 1 },
      ]);

      const insights = generatePracticeInsights([round]);

      expect(insights).toHaveLength(3);
      expect(insights[0].priority).toBeGreaterThanOrEqual(insights[1].priority);
      expect(insights.every((item) => item.practice.length > 0)).toBe(true);
    });

    it("marks samples below the configured minimum as reference values", () => {
      expect(isReferenceSample(9, 10)).toBe(true);
      expect(isReferenceSample(10, 10)).toBe(false);
    });
  });

  describe("calculateDistance", () => {
    it("should calculate distance from steps and stride length", () => {
      expect(calculateDistance(10, 0.7)).toBe(7);
      expect(calculateDistance(5, 0.8)).toBe(4);
      expect(calculateDistance(0, 0.7)).toBe(0);
    });

    it("should handle decimal steps", () => {
      expect(calculateDistance(10.5, 0.7)).toBeCloseTo(7.35);
    });
  });

  describe("formatDate", () => {
    it("should format date string correctly", () => {
      const result = formatDate("2024-01-15T09:00:00.000Z");
      expect(result).toContain("2024");
      expect(result).toContain("1");
      expect(result).toContain("15");
    });
  });

  describe("getDistanceRange", () => {
    it("should categorize distances correctly", () => {
      expect(getDistanceRange(0.5)).toBe("short");
      expect(getDistanceRange(1.5)).toBe("short");
      expect(getDistanceRange(2.5)).toBe("medium");
      expect(getDistanceRange(4.5)).toBe("medium");
      expect(getDistanceRange(6)).toBe("long");
      expect(getDistanceRange(10)).toBe("long");
    });
  });

  describe("calculateStats", () => {
    it("should return zero stats for empty rounds", () => {
      const stats = calculateStats([]);
      expect(stats.totalRounds).toBe(0);
      expect(stats.avgPuttsPerRound).toBe(0);
      expect(stats.avgPuttsPerHole).toBe(0);
    });

    it("should calculate correct stats for single round", () => {
      const round = createRound(
        36,
        Array.from({ length: 18 }, () => ({ totalPutts: 2 }))
      );
      const stats = calculateStats([round]);

      expect(stats.totalRounds).toBe(1);
      expect(stats.avgPuttsPerRound).toBe(36);
      expect(stats.avgPuttsPerHole).toBe(2);
    });

    it("should calculate 1-putt and 3-putt rates", () => {
      const holes = [
        { totalPutts: 1 }, // 1-putt
        { totalPutts: 1 }, // 1-putt
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 3 }, // 3-putt
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
        { totalPutts: 2 },
      ];
      const round = createRound(35, holes);
      const stats = calculateStats([round]);

      // 2 one-putts out of 18 holes = 11.11%
      expect(stats.onePuttRate).toBeCloseTo(11.11, 1);
      // 1 three-putt out of 18 holes = 5.56%
      expect(stats.threePuttRate).toBeCloseTo(5.56, 1);
    });
  });

  describe("analyzeByDistance", () => {
    const createDistancePutt = (distanceMeters: number, cupIn: boolean): PuttData =>
      createPutt({
        distanceMeters,
        lengthSteps: Math.round(distanceMeters / 0.7),
        cupIn,
      });

    const createRoundWithPutts = (putts: PuttData[]): Round => ({
      id: "test-round",
      date: "2024-01-15T09:00:00.000Z",
      weather: "sunny",
      windSpeed: "calm",
      courseId: "course-1",
      courseName: "テストゴルフ場",
      frontNineGreen: "A",
      backNineGreen: "A",
      roundType: "private",
      competitionFormat: "stroke",
      grassType: "bent",
      stimpmeter: 9.5,
      greenCondition: "good",
      putterId: "putter-1",
      putterName: "Test Putter",
      holes: putts.map((p, i) => ({
        holeNumber: i + 1,
        scoreResult: "par" as const,
        totalPutts: p.cupIn ? 1 : 2,
        putts: [p],
      })),
      totalPutts: putts.reduce((sum, p) => sum + (p.cupIn ? 1 : 2), 0),
      createdAt: "2024-01-15T09:00:00.000Z",
      updatedAt: "2024-01-15T09:00:00.000Z",
    });

    it("should analyze success rate by distance", () => {
      const putts = [
        createDistancePutt(1, true),   // short, success
        createDistancePutt(1.5, true), // short, success
        createDistancePutt(1, false),  // short, fail
        createDistancePutt(3, true),   // medium, success
        createDistancePutt(4, false),  // medium, fail
        createDistancePutt(7, false),  // long, fail
      ];
      const round = createRoundWithPutts(putts);
      const analysis = analyzeByDistance([round]);

      // Short: 2/3 = 66.67%
      expect(analysis.short.successRate).toBeCloseTo(66.67, 1);
      // Medium: 1/2 = 50%
      expect(analysis.medium.successRate).toBe(50);
      // Long: 0/1 = 0%
      expect(analysis.long.successRate).toBe(0);
    });
  });

  describe("analyzeBySlope", () => {
    const createSlopePutt = (lineUD: SlopeUpDown, cupIn: boolean): PuttData =>
      createPutt({
        distanceMeters: 7,
        lengthSteps: 10,
        lineUD,
        cupIn,
      });

    const createRoundWithPutts = (putts: PuttData[]): Round => ({
      id: "test-round",
      date: "2024-01-15T09:00:00.000Z",
      weather: "sunny",
      windSpeed: "calm",
      courseId: "course-1",
      courseName: "テストゴルフ場",
      frontNineGreen: "A",
      backNineGreen: "A",
      roundType: "private",
      competitionFormat: "stroke",
      grassType: "bent",
      stimpmeter: 9.5,
      greenCondition: "good",
      putterId: "putter-1",
      putterName: "Test Putter",
      holes: putts.map((p, i) => ({
        holeNumber: i + 1,
        scoreResult: "par" as const,
        totalPutts: p.cupIn ? 1 : 2,
        putts: [p],
      })),
      totalPutts: putts.reduce((sum, p) => sum + (p.cupIn ? 1 : 2), 0),
      createdAt: "2024-01-15T09:00:00.000Z",
      updatedAt: "2024-01-15T09:00:00.000Z",
    });

    it("should analyze success rate by slope", () => {
      const putts = [
        createSlopePutt("flat", true),
        createSlopePutt("flat", true),
        createSlopePutt("uphill", true),
        createSlopePutt("uphill", false),
        createSlopePutt("downhill", false),
        createSlopePutt("downhill", false),
      ];
      const round = createRoundWithPutts(putts);
      const analysis = analyzeBySlope([round]);

      // Flat: 2/2 = 100%
      expect(analysis.flat.successRate).toBe(100);
      // Uphill: 1/2 = 50%
      expect(analysis.uphill.successRate).toBe(50);
      // Downhill: 0/2 = 0%
      expect(analysis.downhill.successRate).toBe(0);
    });
  });
});
