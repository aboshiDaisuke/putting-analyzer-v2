import { describe, expect, it } from "vitest";
import {
  convertOcrPuttToAppPutt,
  convertOcrHoleToAppHole,
  convertOcrBatchToHoles,
  normalizeOcrHole,
  normalizeOcrResults,
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

  describe("normalizeOcrHole", () => {
    it("always returns exactly 3 putts numbered 1/2/3 even if model omits them", () => {
      const out = normalizeOcrHole({ hole: 5, putts: [{ cupIn: true }] });
      expect(out.putts).toHaveLength(3);
      expect(out.putts.map((p) => p.puttNumber)).toEqual([1, 2, 3]);
      expect(out.putts[0].cupIn).toBe(true);
      expect(out.putts[1].cupIn).toBe(false);
      expect(out.putts[2].cupIn).toBe(false);
    });

    it("truncates extra putts to 3 and forces puttNumber by position", () => {
      const out = normalizeOcrHole({
        hole: 2,
        putts: [
          { puttNumber: 9, result: "P" },
          { puttNumber: 9, result: "Bo" },
          { puttNumber: 9, result: "E" },
          { puttNumber: 9, result: "Ba" },
        ],
      });
      expect(out.putts).toHaveLength(3);
      expect(out.putts.map((p) => p.puttNumber)).toEqual([1, 2, 3]);
      expect(out.putts[2].result).toBe("E");
    });

    it("nullifies out-of-range hole numbers (1-18)", () => {
      expect(normalizeOcrHole({ hole: 0 }).hole).toBeNull();
      expect(normalizeOcrHole({ hole: 19 }).hole).toBeNull();
      expect(normalizeOcrHole({ hole: 7 }).hole).toBe(7);
    });

    it("nullifies out-of-range putt length (1-20m) and rounds valid ones", () => {
      const mk = (lengthMeters: unknown) =>
        normalizeOcrHole({ hole: 1, putts: [{ lengthMeters }] }).putts[0].lengthMeters;
      expect(mk(88)).toBeNull(); // 読み間違いの巨大値
      expect(mk(0)).toBeNull();
      expect(mk(6)).toBe(6);
      expect(mk(6.7)).toBe(7); // 丸め
    });

    it("coerces numeric strings like '8m' and rejects garbage", () => {
      const mk = (lengthMeters: unknown) =>
        normalizeOcrHole({ hole: 1, putts: [{ lengthMeters }] }).putts[0].lengthMeters;
      expect(mk("8m")).toBe(8);
      expect(mk("")).toBeNull();
      expect(mk("abc")).toBeNull();
    });

    it("rejects invalid enum values for result/lineUD/lineLR", () => {
      const out = normalizeOcrHole({
        hole: 1,
        putts: [{ result: "X", lineUD: "Z", lineLR: "Q" }],
      });
      expect(out.putts[0].result).toBeNull();
      expect(out.putts[0].lineUD).toBeNull();
      expect(out.putts[0].lineLR).toBeNull();
    });

    it("treats non-boolean cupIn as false (only literal true is true)", () => {
      const mk = (cupIn: unknown) =>
        normalizeOcrHole({ hole: 1, putts: [{ cupIn }] }).putts[0].cupIn;
      expect(mk(true)).toBe(true);
      expect(mk("true")).toBe(false);
      expect(mk(1)).toBe(false);
    });

    it("handles a non-object or array payload defensively", () => {
      const fromNull = normalizeOcrHole(null);
      expect(fromNull.hole).toBeNull();
      expect(fromNull.putts).toHaveLength(3);
      // 配列で返された場合は先頭要素を採用
      expect(normalizeOcrHole([{ hole: 4 }]).hole).toBe(4);
    });

    it("trims date/course and nullifies empties", () => {
      const out = normalizeOcrHole({ hole: 1, date: "  20260507 ", course: "  " });
      expect(out.date).toBe("20260507");
      expect(out.course).toBeNull();
    });
  });

  describe("normalizeOcrResults", () => {
    it("normalizes a single object into a one-element array", () => {
      const out = normalizeOcrResults({ hole: 3 });
      expect(out).toHaveLength(1);
      expect(out[0].hole).toBe(3);
      expect(out[0].putts).toHaveLength(3);
    });

    it("normalizes each element of an array", () => {
      const out = normalizeOcrResults([{ hole: 1 }, { hole: 99 }]);
      expect(out).toHaveLength(2);
      expect(out[0].hole).toBe(1);
      expect(out[1].hole).toBeNull(); // 範囲外
    });
  });
});
