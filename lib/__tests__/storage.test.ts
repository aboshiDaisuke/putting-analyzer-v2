import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted ensures these are available before vi.mock factories run
const { mockStorage, mockApiGolf } = vi.hoisted(() => {
  const mockStorage: Record<string, string> = {};
  const mockApiGolf = {
    getUserProfile: vi.fn(),
    saveUserProfile: vi.fn(),
    getPutters: vi.fn(),
    getPutter: vi.fn(),
    savePutter: vi.fn(),
    updatePutter: vi.fn(),
    deletePutter: vi.fn(),
    getCourses: vi.fn(),
    saveCourse: vi.fn(),
    deleteCourse: vi.fn(),
    getRounds: vi.fn(),
    getRound: vi.fn(),
    saveRound: vi.fn(),
    updateRound: vi.fn(),
    deleteRound: vi.fn(),
    resetRoundHoles: vi.fn(),
    deleteAllRounds: vi.fn(),
    saveHolesForRound: vi.fn(),
  };
  return { mockStorage, mockApiGolf };
});

// Mock AsyncStorage
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
    multiRemove: vi.fn((keys: string[]) => {
      keys.forEach((key) => delete mockStorage[key]);
      return Promise.resolve();
    }),
  },
}));

// Mock api-golf.ts — storage.ts delegates most calls here
vi.mock("../api-golf", () => mockApiGolf);

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
    // Clear mock storage and reset all mocks
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
  });

  // ─── User Profile (has AsyncStorage fallback) ────────────────────────────────

  describe("User Profile", () => {
    it("should return null when no profile exists (API returns null, no local data)", async () => {
      mockApiGolf.getUserProfile.mockResolvedValue(null);

      const profile = await getUserProfile();
      expect(profile).toBeNull();
    });

    it("should return profile from API when available", async () => {
      const apiProfile: UserProfile = {
        id: "1",
        name: "",
        gender: "male",
        birthDate: "1990-01-01",
        handicap: 15,
        strideLength: 0.75,
        memberCourses: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };
      mockApiGolf.getUserProfile.mockResolvedValue(apiProfile);

      const profile = await getUserProfile();
      expect(profile).not.toBeNull();
      expect(profile?.handicap).toBe(15);
      expect(profile?.strideLength).toBe(0.75);
    });

    it("should merge local name with API profile", async () => {
      // Save a local profile with name to AsyncStorage
      const localProfile = { name: "テストユーザー" };
      mockStorage["putting_analyzer_user_profile"] = JSON.stringify(localProfile);

      const apiProfile: UserProfile = {
        id: "1",
        name: "",
        gender: "male",
        birthDate: "",
        handicap: 15,
        strideLength: 0.75,
        memberCourses: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };
      mockApiGolf.getUserProfile.mockResolvedValue(apiProfile);

      const profile = await getUserProfile();
      expect(profile?.name).toBe("テストユーザー");
      expect(profile?.handicap).toBe(15);
    });

    it("should fall back to AsyncStorage when API is unavailable", async () => {
      mockApiGolf.getUserProfile.mockRejectedValue(new Error("Network error"));

      const localProfile: UserProfile = {
        id: "local-1",
        name: "ローカルユーザー",
        gender: "male",
        birthDate: "",
        handicap: 20,
        strideLength: 0.8,
        memberCourses: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };
      mockStorage["putting_analyzer_user_profile"] = JSON.stringify(localProfile);

      const profile = await getUserProfile();
      expect(profile).not.toBeNull();
      expect(profile?.name).toBe("ローカルユーザー");
      expect(profile?.handicap).toBe(20);
    });

    it("should save profile to both AsyncStorage and API", async () => {
      const serverProfile: UserProfile = {
        id: "1",
        name: "",
        gender: "female",
        birthDate: "",
        handicap: 10,
        strideLength: 0.7,
        memberCourses: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };
      mockApiGolf.saveUserProfile.mockResolvedValue(serverProfile);

      const result = await saveUserProfile({
        name: "テストユーザー",
        handicap: 10,
        strideLength: 0.7,
      });

      // Name comes from local, rest from server
      expect(result.handicap).toBe(10);
      // AsyncStorage should have been called
      expect(mockStorage["putting_analyzer_user_profile"]).toBeDefined();
    });
  });

  // ─── Putters (delegates to API) ───────────────────────────────────────────────

  describe("Putters", () => {
    it("should return empty array when no putters exist", async () => {
      mockApiGolf.getPutters.mockResolvedValue([]);

      const putters = await getPutters();
      expect(putters).toEqual([]);
    });

    it("should save and retrieve putters", async () => {
      const testPutter: Putter = {
        id: "1",
        brandName: "Scotty Cameron",
        productName: "Newport 2",
        length: 34,
        lieAngle: 70,
        weight: 350,
        gripName: "SuperStroke",
        startDate: "2024-01-01",
        usageCount: 0,
        ranking: "ace",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };
      mockApiGolf.savePutter.mockResolvedValue(testPutter);
      mockApiGolf.getPutters.mockResolvedValue([testPutter]);

      const saved = await savePutter({
        brandName: "Scotty Cameron",
        productName: "Newport 2",
        length: 34,
        lieAngle: 70,
        weight: 350,
        gripName: "SuperStroke",
        startDate: "2024-01-01",
        usageCount: 0,
        ranking: "ace",
      });
      expect(saved.id).toBe("1");
      expect(saved.brandName).toBe("Scotty Cameron");

      const putters = await getPutters();
      expect(putters.length).toBe(1);
      expect(putters[0].productName).toBe("Newport 2");
    });

    it("should delete putter", async () => {
      mockApiGolf.deletePutter.mockResolvedValue(true);
      mockApiGolf.getPutters.mockResolvedValue([]);

      const result = await deletePutter("1");
      expect(result).toBe(true);

      const putters = await getPutters();
      expect(putters.length).toBe(0);
    });
  });

  // ─── Rounds (delegates to API) ────────────────────────────────────────────────

  describe("Rounds", () => {
    it("should return empty array when no rounds exist", async () => {
      mockApiGolf.getRounds.mockResolvedValue([]);

      const rounds = await getRounds();
      expect(rounds).toEqual([]);
    });

    it("should save and retrieve rounds", async () => {
      const testRound: Round = {
        id: "1",
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
        createdAt: "2024-01-15T09:00:00.000Z",
        updatedAt: "2024-01-15T09:00:00.000Z",
      };
      mockApiGolf.saveRound.mockResolvedValue(testRound);
      mockApiGolf.getRounds.mockResolvedValue([testRound]);

      const saved = await saveRound({
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
      });
      expect(saved.id).toBe("1");
      expect(saved.courseName).toBe("テストゴルフ場");

      const rounds = await getRounds();
      expect(rounds.length).toBe(1);
      expect(rounds[0].totalPutts).toBe(36);
    });

    it("should delete round", async () => {
      mockApiGolf.deleteRound.mockResolvedValue(true);
      mockApiGolf.getRounds.mockResolvedValue([]);

      const result = await deleteRound("1");
      expect(result).toBe(true);

      const rounds = await getRounds();
      expect(rounds.length).toBe(0);
    });
  });
});
