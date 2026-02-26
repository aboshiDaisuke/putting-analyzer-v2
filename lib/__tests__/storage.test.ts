import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] || null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

import {
  getUserProfile,
  saveUserProfile,
  getPutters,
  savePutter,
  deletePutter,
  getRounds,
  saveRound,
  deleteRound,
} from "../storage";
import type { UserProfile, Putter, Round } from "../types";

describe("Storage Functions", () => {
  beforeEach(() => {
    // Clear mock storage before each test
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  describe("User Profile", () => {
    it("should return null when no profile exists", async () => {
      const profile = await getUserProfile();
      expect(profile).toBeNull();
    });

    it("should save and retrieve user profile", async () => {
      const testProfile: Partial<UserProfile> = {
        name: "テストユーザー",
        handicap: 15,
        strideLength: 0.75,
      };

      await saveUserProfile(testProfile);
      const retrieved = await getUserProfile();

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe("テストユーザー");
      expect(retrieved?.handicap).toBe(15);
      expect(retrieved?.strideLength).toBe(0.75);
    });
  });

  describe("Putters", () => {
    it("should return empty array when no putters exist", async () => {
      const putters = await getPutters();
      expect(putters).toEqual([]);
    });

    it("should save and retrieve putters", async () => {
      const testPutter: Omit<Putter, "id" | "createdAt" | "updatedAt"> = {
        brandName: "Scotty Cameron",
        productName: "Newport 2",
        length: 34,
        lieAngle: 70,
        weight: 350,
        gripName: "SuperStroke",
        startDate: "2024-01-01",
        usageCount: 0,
        ranking: "ace",
      };

      const saved = await savePutter(testPutter);
      expect(saved.id).toBeDefined();
      expect(saved.brandName).toBe("Scotty Cameron");

      const putters = await getPutters();
      expect(putters.length).toBe(1);
      expect(putters[0].productName).toBe("Newport 2");
    });

    it("should delete putter", async () => {
      const testPutter: Omit<Putter, "id" | "createdAt" | "updatedAt"> = {
        brandName: "Odyssey",
        productName: "White Hot",
        length: 33,
        lieAngle: 70,
        weight: 340,
        gripName: "Golf Pride",
        startDate: "2024-06-01",
        usageCount: 0,
        ranking: "2nd",
      };

      const saved = await savePutter(testPutter);
      await deletePutter(saved.id);

      const putters = await getPutters();
      expect(putters.length).toBe(0);
    });
  });

  describe("Rounds", () => {
    it("should return empty array when no rounds exist", async () => {
      const rounds = await getRounds();
      expect(rounds).toEqual([]);
    });

    it("should save and retrieve rounds", async () => {
      const testRound: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
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
        putterName: "Scotty Cameron Newport 2",
        holes: Array.from({ length: 18 }, (_, i) => ({
          holeNumber: i + 1,
          scoreResult: "par" as const,
          totalPutts: 2,
          putts: [],
        })),
        totalPutts: 36,
      };

      const saved = await saveRound(testRound);
      expect(saved.id).toBeDefined();
      expect(saved.courseName).toBe("テストゴルフ場");

      const rounds = await getRounds();
      expect(rounds.length).toBe(1);
      expect(rounds[0].totalPutts).toBe(36);
    });

    it("should delete round", async () => {
      const testRound: Omit<Round, "id" | "createdAt" | "updatedAt"> = {
        date: "2024-02-20T10:00:00.000Z",
        weather: "cloudy",
        windSpeed: "light",
        courseId: "course-2",
        courseName: "別のゴルフ場",
        frontNineGreen: "B",
        backNineGreen: "B",
        roundType: "competition",
        competitionFormat: "stroke",
        grassType: "korai",
        stimpmeter: 8.5,
        greenCondition: "good",
        putterId: "putter-2",
        putterName: "Odyssey White Hot",
        holes: Array.from({ length: 18 }, (_, i) => ({
          holeNumber: i + 1,
          scoreResult: "bogey" as const,
          totalPutts: 2,
          putts: [],
        })),
        totalPutts: 36,
      };

      const saved = await saveRound(testRound);
      await deleteRound(saved.id);

      const rounds = await getRounds();
      expect(rounds.length).toBe(0);
    });
  });
});
