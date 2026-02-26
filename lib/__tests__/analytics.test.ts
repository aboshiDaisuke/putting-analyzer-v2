import { describe, it, expect } from "vitest";
import {
  calculateDistance,
  formatDate,
  getDistanceRange,
  calculateStats,
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
  lengthYards: null,
  distanceMeters: 0,
  missedDirection: null,
  touch: null,
  lineUD: "flat",
  lineLR: "straight",
  mental: 3,
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
