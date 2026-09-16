import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodePng } from "../../tests/helpers/png";
import {
  applyHomography,
  canonicalFrame,
  detectCellMarks,
  laplacianVariance,
  rectifyScorecard,
  rgbaToGray,
  solveHomography,
  type Quad,
  type RgbaImage,
} from "../ocr-image-core";
import { SCORECARD_LAYOUT } from "../ocr-layout";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures");

type Truth = {
  sections: Array<{
    cupIn: boolean;
    result: number | null;
    lineUD: number | null;
    lineLR: number | null;
    styles?: Record<string, string>;
  }>;
};

function loadFixture(name: string): { image: RgbaImage; truth: Truth } {
  const image = decodePng(readFileSync(path.join(FIXTURES, `${name}.png`)));
  const truth = JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8")) as Truth;
  return { image, truth };
}

describe("solveHomography", () => {
  it("maps the source quad onto the destination quad", () => {
    const src: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }];
    const dst: Quad = [{ x: 10, y: 20 }, { x: 130, y: 25 }, { x: 120, y: 260 }, { x: 5, y: 240 }];
    const H = solveHomography(src, dst)!;
    expect(H).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(H, src[i]);
      expect(p.x).toBeCloseTo(dst[i].x, 6);
      expect(p.y).toBeCloseTo(dst[i].y, 6);
    }
  });
});

describe("rectifyScorecard + detectCellMarks (synthetic photos)", () => {
  // フィクスチャは scorecard-v2.html に手書き風の記入を入れ、CSS 3D 変形で
  // 斜めから撮った写真風にしたもの（scratchpad/pw/gen-fixture.js で生成）。
  for (const name of ["scorecard-photo-1", "scorecard-photo-2"]) {
    it(`${name}: finds the corner markers and reads the checkbox marks`, () => {
      const { image, truth } = loadFixture(name);
      const result = rectifyScorecard(image, SCORECARD_LAYOUT);
      expect(result).not.toBeNull();
      const { image: rect, frame } = result!;
      expect(rect.width).toBe(canonicalFrame(SCORECARD_LAYOUT).width);

      const marks = detectCellMarks(rgbaToGray(rect), SCORECARD_LAYOUT, frame);
      truth.sections.forEach((sec, i) => {
        const m = marks.sections[i];
        // ✓ や塗りつぶしは確実に検出できる。○囲みは枠の外側を通るため「なし/不明」になりうる
        expect(m.cupIn.marked).toBe(sec.cupIn);
        for (const key of ["result", "lineUD", "lineLR"] as const) {
          const expected = sec[key];
          const got = m[key].index;
          const style = sec.styles?.[key] ?? "check";
          if (expected === null) {
            expect(got).toBeNull();
          } else if (style === "circle") {
            // 誤った別の枠を選ばないことだけ保証する
            expect(got === expected || got === null || got === undefined).toBe(true);
          } else {
            expect(got).toBe(expected);
          }
        }
      });
    });
  }

  it("returns null when there are no markers (plain white image)", () => {
    const w = 400;
    const h = 600;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    expect(rectifyScorecard({ width: w, height: h, data }, SCORECARD_LAYOUT)).toBeNull();
  });
});

describe("laplacianVariance", () => {
  it("is zero for a flat image and larger for a detailed one", () => {
    const flat = { width: 50, height: 50, data: new Uint8ClampedArray(2500).fill(200) };
    expect(laplacianVariance(flat)).toBe(0);
    const { image } = loadFixture("scorecard-photo-1");
    expect(laplacianVariance(rgbaToGray(image))).toBeGreaterThan(50);
  });
});
