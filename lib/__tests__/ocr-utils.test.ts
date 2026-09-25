import { describe, expect, it } from "vitest";
import {
  convertOcrPuttToAppPutt,
  convertOcrHoleToAppHole,
  convertOcrBatchToHoles,
  OcrHoleData,
  OcrPuttData,
} from "../ocr-utils";

describe("OCR Utils", () => {
  describe("convertOcrPuttToAppPutt", () => {
    it("should convert a valid 1st putt correctly", () => {
      const ocrPutt: OcrPuttData = {
        puttNumber: 1,
        cupIn: true,
        result: "P",
        lengthMeters: 7,
        lineUD: "U",
        lineLR: "St",
      };

      const result = convertOcrPuttToAppPutt(ocrPutt);
      expect(result).not.toBeNull();
      expect(result!.strokeNumber).toBe(1);
      expect(result!.cupIn).toBe(true);
      expect(result!.lengthMeters).toBe(7);
      expect(result!.distanceMeters).toBeCloseTo(7.0);
      expect(result!.lineUD).toBe("uphill");
      expect(result!.lineLR).toBe("straight");
      expect(result!.result).toBe("par");
    });

    it("should return null for empty putt data", () => {
      const ocrPutt: OcrPuttData = {
        puttNumber: 2,
        cupIn: false,
        result: null,
        lengthMeters: null,
        lineUD: null,
        lineLR: null,
      };

      const result = convertOcrPuttToAppPutt(ocrPutt);
      expect(result).toBeNull();
    });

    it("should handle downhill slope correctly", () => {
      const ocrPutt: OcrPuttData = {
        puttNumber: 1,
        cupIn: false,
        result: "Bo",
        lengthMeters: 4,
        lineUD: "D",
        lineLR: "L",
      };

      const result = convertOcrPuttToAppPutt(ocrPutt);
      expect(result).not.toBeNull();
      expect(result!.lineUD).toBe("downhill");
      expect(result!.lineLR).toBe("left");
      expect(result!.distanceMeters).toBeCloseTo(4.0);
    });

    it("should handle flat slope (lineUD=F, lineLR=St)", () => {
      const ocrPutt: OcrPuttData = {
        puttNumber: 1,
        cupIn: true,
        result: "Ba",
        lengthMeters: 2,
        lineUD: "F",
        lineLR: "St",
      };

      const result = convertOcrPuttToAppPutt(ocrPutt);
      expect(result).not.toBeNull();
      expect(result!.lineUD).toBe("flat");
      expect(result!.lineLR).toBe("straight");
      expect(result!.result).toBe("birdie");
    });
  });

  describe("convertOcrHoleToAppHole", () => {
    it("should convert a complete hole with 2 putts", () => {
      const ocrHole: OcrHoleData = {
        hole: 1,
        date: "20260507",
        course: "テストCC",
        putts: [
          {
            puttNumber: 1,
            cupIn: false,
            result: "P",
            lengthMeters: 6,
            lineUD: "U",
            lineLR: "L",
          },
          {
            puttNumber: 2,
            cupIn: true,
            result: null,
            lengthMeters: 2,
            lineUD: "F",
            lineLR: "St",
          },
          {
            puttNumber: 3,
            cupIn: false,
            result: null,
            lengthMeters: null,
            lineUD: null,
            lineLR: null,
          },
        ],
      };

      const result = convertOcrHoleToAppHole(ocrHole);
      expect(result).not.toBeNull();
      expect(result!.holeNumber).toBe(1);
      expect(result!.scoreResult).toBe("par");
      expect(result!.totalPutts).toBe(2);
      expect(result!.putts).toHaveLength(2);
    });

    it("should return null for hole without number", () => {
      const ocrHole: OcrHoleData = {
        hole: null,
        date: null,
        course: null,
        putts: [],
      };

      const result = convertOcrHoleToAppHole(ocrHole);
      expect(result).toBeNull();
    });
  });

  describe("convertOcrBatchToHoles", () => {
    const makePutt = (
      num: 1 | 2 | 3,
      overrides: Partial<OcrPuttData> = {}
    ): OcrPuttData => ({
      puttNumber: num,
      cupIn: false,
      result: null,
      lengthMeters: null,
      lineUD: null,
      lineLR: null,
      ...overrides,
    });

    it("should convert and sort multiple holes", () => {
      const ocrResults: OcrHoleData[] = [
        {
          hole: 3,
          date: "20260507",
          course: "テストCC",
          putts: [
            makePutt(1, { result: "Bo", lengthMeters: 9, lineUD: "U", lineLR: "L" }),
            makePutt(2),
            makePutt(3),
          ],
        },
        {
          hole: 1,
          date: "20260507",
          course: "テストCC",
          putts: [
            makePutt(1, { cupIn: true, result: "P", lengthMeters: 5, lineUD: "F", lineLR: "St" }),
            makePutt(2),
            makePutt(3),
          ],
        },
      ];

      const result = convertOcrBatchToHoles(ocrResults);
      expect(result).toHaveLength(2);
      expect(result[0].holeNumber).toBe(1); // ソートされている
      expect(result[1].holeNumber).toBe(3);
    });

    it("should filter out invalid holes", () => {
      const ocrResults: OcrHoleData[] = [
        {
          hole: 1,
          date: "20260507",
          course: "テストCC",
          putts: [
            makePutt(1, { result: "P", lengthMeters: 4, lineUD: "F", lineLR: "St" }),
            makePutt(2),
            makePutt(3),
          ],
        },
        {
          hole: null,
          date: null,
          course: null,
          putts: [],
        },
      ];

      const result = convertOcrBatchToHoles(ocrResults);
      expect(result).toHaveLength(1);
      expect(result[0].holeNumber).toBe(1);
    });
  });
});
