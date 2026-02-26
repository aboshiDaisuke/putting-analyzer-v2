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
        distPrev: null,
        result: "P",
        lengthSteps: 10,
        lengthYards: null,
        missedDirection: null,
        touch: 3,
        lineUD: "U",
        lineLR: "St",
        mental: "P",
      };

      const result = convertOcrPuttToAppPutt(ocrPutt, 0.7);
      expect(result).not.toBeNull();
      expect(result!.strokeNumber).toBe(1);
      expect(result!.cupIn).toBe(true);
      expect(result!.lengthSteps).toBe(10);
      expect(result!.distanceMeters).toBeCloseTo(7.0);
      expect(result!.lineUD).toBe("uphill");
      expect(result!.lineLR).toBe("straight");
      expect(result!.mental).toBe("P");
      expect(result!.touch).toBe(3);
      expect(result!.result).toBe("par");
    });

    it("should return null for empty putt data", () => {
      const ocrPutt: OcrPuttData = {
        puttNumber: 2,
        cupIn: false,
        distPrev: null,
        result: null,
        lengthSteps: null,
        lengthYards: null,
        missedDirection: null,
        touch: null,
        lineUD: null,
        lineLR: null,
        mental: null,
      };

      const result = convertOcrPuttToAppPutt(ocrPutt, 0.7);
      expect(result).toBeNull();
    });

    it("should handle downhill slope correctly", () => {
      const ocrPutt: OcrPuttData = {
        puttNumber: 1,
        cupIn: false,
        distPrev: 5,
        result: "Bo",
        lengthSteps: 5,
        lengthYards: 4,
        missedDirection: 2,
        touch: 4,
        lineUD: "D",
        lineLR: "L",
        mental: "N",
      };

      const result = convertOcrPuttToAppPutt(ocrPutt, 0.8);
      expect(result).not.toBeNull();
      expect(result!.lineUD).toBe("downhill");
      expect(result!.lineLR).toBe("left");
      expect(result!.mental).toBe("N");
      expect(result!.touch).toBe(4);
      expect(result!.missedDirection).toBe(2);
      expect(result!.distPrev).toBe(5);
      expect(result!.distanceMeters).toBeCloseTo(4.0);
    });

    it("should handle flat slope (lineUD=F, lineLR=St)", () => {
      const ocrPutt: OcrPuttData = {
        puttNumber: 1,
        cupIn: true,
        distPrev: null,
        result: "Ba",
        lengthSteps: 3,
        lengthYards: null,
        missedDirection: null,
        touch: 2,
        lineUD: "F",
        lineLR: "St",
        mental: 3,
      };

      const result = convertOcrPuttToAppPutt(ocrPutt, 0.7);
      expect(result).not.toBeNull();
      expect(result!.lineUD).toBe("flat");
      expect(result!.lineLR).toBe("straight");
      expect(result!.mental).toBe(3);
      expect(result!.result).toBe("birdie");
    });

    it("should handle complex slopes (UD, DU, LR, RL)", () => {
      const ocrPutt: OcrPuttData = {
        puttNumber: 1,
        cupIn: false,
        distPrev: null,
        result: "D+",
        lengthSteps: 15,
        lengthYards: null,
        missedDirection: 4,
        touch: 5,
        lineUD: "UD",
        lineLR: "RL",
        mental: 5,
      };

      const result = convertOcrPuttToAppPutt(ocrPutt, 0.7);
      expect(result).not.toBeNull();
      expect(result!.lineUD).toBe("up_down");
      expect(result!.lineLR).toBe("right_left");
      expect(result!.result).toBe("double_bogey_plus");
    });
  });

  describe("convertOcrHoleToAppHole", () => {
    it("should convert a complete hole with 2 putts", () => {
      const ocrHole: OcrHoleData = {
        hole: 1,
        date: "02/13",
        course: "テストCC",
        putts: [
          {
            puttNumber: 1,
            cupIn: false,
            distPrev: null,
            result: "P",
            lengthSteps: 8,
            lengthYards: null,
            missedDirection: 3,
            touch: 3,
            lineUD: "U",
            lineLR: "LR",
            mental: 2,
          },
          {
            puttNumber: 2,
            cupIn: true,
            distPrev: 2,
            result: null,
            lengthSteps: 2,
            lengthYards: null,
            missedDirection: null,
            touch: 2,
            lineUD: "F",
            lineLR: "St",
            mental: 3,
          },
          {
            puttNumber: 3,
            cupIn: false,
            distPrev: null,
            result: null,
            lengthSteps: null,
            lengthYards: null,
            missedDirection: null,
            touch: null,
            lineUD: null,
            lineLR: null,
            mental: null,
          },
        ],
      };

      const result = convertOcrHoleToAppHole(ocrHole, 0.7);
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

      const result = convertOcrHoleToAppHole(ocrHole, 0.7);
      expect(result).toBeNull();
    });
  });

  describe("convertOcrBatchToHoles", () => {
    it("should convert and sort multiple holes", () => {
      const makePutt = (
        num: 1 | 2 | 3,
        overrides: Partial<OcrPuttData> = {}
      ): OcrPuttData => ({
        puttNumber: num,
        cupIn: false,
        distPrev: null,
        result: null,
        lengthSteps: null,
        lengthYards: null,
        missedDirection: null,
        touch: null,
        lineUD: null,
        lineLR: null,
        mental: null,
        ...overrides,
      });

      const ocrResults: OcrHoleData[] = [
        {
          hole: 3,
          date: "02/13",
          course: "テストCC",
          putts: [
            makePutt(1, { result: "Bo", lengthSteps: 12, touch: 4, lineUD: "UD", lineLR: "L", mental: 4 }),
            makePutt(2),
            makePutt(3),
          ],
        },
        {
          hole: 1,
          date: "02/13",
          course: "テストCC",
          putts: [
            makePutt(1, { cupIn: true, result: "P", lengthSteps: 5, touch: 3, lineUD: "F", lineLR: "St", mental: "P" }),
            makePutt(2),
            makePutt(3),
          ],
        },
      ];

      const result = convertOcrBatchToHoles(ocrResults, 0.7);
      expect(result).toHaveLength(2);
      expect(result[0].holeNumber).toBe(1); // ソートされている
      expect(result[1].holeNumber).toBe(3);
    });

    it("should filter out invalid holes", () => {
      const makePutt = (
        num: 1 | 2 | 3,
        overrides: Partial<OcrPuttData> = {}
      ): OcrPuttData => ({
        puttNumber: num,
        cupIn: false,
        distPrev: null,
        result: null,
        lengthSteps: null,
        lengthYards: null,
        missedDirection: null,
        touch: null,
        lineUD: null,
        lineLR: null,
        mental: null,
        ...overrides,
      });

      const ocrResults: OcrHoleData[] = [
        {
          hole: 1,
          date: "02/13",
          course: "テストCC",
          putts: [
            makePutt(1, { result: "P", lengthSteps: 5, touch: 3, lineUD: "F", lineLR: "St", mental: 3 }),
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

      const result = convertOcrBatchToHoles(ocrResults, 0.7);
      expect(result).toHaveLength(1);
      expect(result[0].holeNumber).toBe(1);
    });
  });
});
