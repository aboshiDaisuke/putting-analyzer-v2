import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodePng } from "../../tests/helpers/png";
import { applyHomography, laplacianVariance, rgbaToGray, solveHomography, type Quad } from "../ocr-image-core";
import type { CardFill, MarkStyle } from "../scorecard/card-svg";
import type { CardSide } from "../scorecard/layout";
import { CANONICAL_H, CANONICAL_W, processCardPhoto, type ChoiceMark, type InkMark } from "../scorecard/process";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures");

function load(name: string) {
  const image = decodePng(readFileSync(path.join(FIXTURES, `${name}.png`)));
  const truth = JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8")) as { side: CardSide; fill: CardFill };
  return { image, truth };
}

describe("solveHomography", () => {
  it("maps the source quad onto the destination quad", () => {
    const src: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }];
    const dst: Quad = [{ x: 10, y: 20 }, { x: 130, y: 25 }, { x: 120, y: 260 }, { x: 5, y: 240 }];
    const H = solveHomography(src, dst)!;
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(H, src[i]);
      expect(p.x).toBeCloseTo(dst[i].x, 6);
      expect(p.y).toBeCloseTo(dst[i].y, 6);
    }
  });
});

describe("processCardPhoto (synthetic photos of card v3)", () => {
  const cases: [string, number][] = [
    ["card-v3-out-pen", 0],
    ["card-v3-in-pencil-180", 180],
    ["card-v3-out-rot90", 270],
  ];

  for (const [name, rotation] of cases) {
    it(`${name}: finds the card, fixes orientation and side, reads every box`, () => {
      const { image, truth } = load(name);
      const result = processCardPhoto(image);
      expect(result).not.toBeNull();
      const { marks, location, image: rect } = result!;
      expect(rect.width).toBe(CANONICAL_W);
      expect(rect.height).toBe(CANONICAL_H);
      expect(location.orientationConfident).toBe(true);
      expect(location.rotation).toBe(rotation);
      expect(marks.side).toBe(truth.side);

      const styleOf = (key: string): MarkStyle => truth.fill.markStyles?.[key] ?? truth.fill.markStyle ?? "check";
      const expectChoice = (m: ChoiceMark, expected: number | undefined, key: string) => {
        if (expected === undefined) {
          expect(m.hint, `${key} should be blank (${m.ratios.map((r) => r.toFixed(3))})`).toBeNull();
        } else if (styleOf(key) === "circle") {
          // ○ は枠の外側を通るので画素では拾えないことがある。別の枠を選ばないことだけ保証
          expect([expected, null, "unsure"]).toContain(m.hint);
        } else {
          expect(m.hint, `${key} (${m.ratios.map((r) => r.toFixed(3))})`).toBe(expected);
        }
      };
      const expectInk = (m: InkMark, written: boolean, key: string) => {
        expect(m.hint, `${key} ink ratio ${m.ratio.toFixed(3)}`).toBe(written);
      };

      truth.fill.rows.forEach((row, i) => {
        const m = marks.rows[i];
        expectChoice(m.puttFor, row?.puttFor, `${i}.puttFor`);
        expectChoice(m.p1.ud, row?.p1?.ud, `${i}.p1.ud`);
        expectChoice(m.p1.lr, row?.p1?.lr, `${i}.p1.lr`);
        expectChoice(m.p1.miss, row?.p1?.miss, `${i}.p1.miss`);
        expectChoice(m.p2.ud, row?.p2?.ud, `${i}.p2.ud`);
        expectChoice(m.p2.lr, row?.p2?.lr, `${i}.p2.lr`);

        const d1 = (row?.p1?.dist ?? "").padStart(2, " ");
        expectInk(m.p1.dist[0], d1[0] !== " ", `${i}.p1.dist[0]`);
        expectInk(m.p1.dist[1], d1[1] !== " ", `${i}.p1.dist[1]`);
        for (const [key, value] of [["p2", row?.p2?.dist], ["p3", row?.p3?.dist]] as const) {
          const [ip, dp = ""] = (value ?? "").split(".");
          const cells = key === "p2" ? m.p2.dist : m.p3.dist;
          expectInk(cells[0], Boolean(ip), `${i}.${key}.dist[0]`);
          expectInk(cells[1], Boolean(dp), `${i}.${key}.dist[1]`);
        }
        expectInk(m.total, Boolean(row?.total), `${i}.total`);
      });

      if (truth.side === "out") {
        marks.date.forEach((d, i) => expectInk(d, Boolean(truth.fill.date?.[i]), `date[${i}]`));
      }
    });
  }

  it("rejects a photo where a corner marker is out of frame and other squares look like markers", () => {
    const image = decodePng(readFileSync(path.join(FIXTURES, "stress", "stress-steep.png")));
    expect(processCardPhoto(image)).toBeNull();
  });

  it("rejects a photo whose right-hand markers are cut off", () => {
    const image = decodePng(readFileSync(path.join(FIXTURES, "card-v3-clipped.png")));
    expect(processCardPhoto(image)).toBeNull();
  });

  it("returns null when there is no card (plain image)", () => {
    const w = 400;
    const h = 300;
    expect(processCardPhoto({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) })).toBeNull();
  });
});

describe("laplacianVariance", () => {
  it("is zero for a flat image and larger for a detailed one", () => {
    const flat = { width: 50, height: 50, data: new Uint8ClampedArray(2500).fill(200) };
    expect(laplacianVariance(flat)).toBe(0);
    const { image } = load("card-v3-out-pen");
    expect(laplacianVariance(rgbaToGray(image))).toBeGreaterThan(50);
  });
});
