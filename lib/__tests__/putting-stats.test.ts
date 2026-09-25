import { describe, expect, it } from "vitest";
import { buildHole, holeToEntry, shiftScore } from "../putting";
import {
  expectedPutts,
  greenPoints,
  holeObservations,
  lagStats,
  lineStats,
  makeCurve,
  missTendency,
  practicePriorities,
  puttForStats,
  roundSgSeries,
  sgSummary,
  wilson,
} from "../putting-stats";
import { generateDemoRounds } from "../demo-data";
import type { Round } from "../types";

function roundWith(holes: ReturnType<typeof buildHole>[]): Round {
  return {
    id: "r1", date: "2026-09-20", weather: "sunny", windSpeed: "calm", courseId: "", courseName: "Test",
    frontNineGreen: "", backNineGreen: "", roundType: "private", competitionFormat: "stroke", grassType: "bent",
    stimpmeter: 9.5, greenCondition: "good", putterId: "", putterName: "P", holes,
    totalPutts: holes.reduce((s, h) => s + h.totalPutts, 0), createdAt: "", updatedAt: "",
  };
}

describe("buildHole", () => {
  it("derives putt-for per stroke, cup-in on the last putt and the final score", () => {
    const hole = buildHole({
      holeNumber: 3, puttFor: "birdie", totalPutts: 3,
      putts: [{ meters: 15, lineUD: "flat", missLength: "long" }, { meters: 2.5 }, { meters: 0.6 }],
    });
    expect(hole.putts.map((p) => p.result)).toEqual(["birdie", "par", "bogey"]);
    expect(hole.putts.map((p) => p.cupIn)).toEqual([false, false, true]);
    expect(hole.scoreResult).toBe("bogey");
    expect(hole.putts[0].missLength).toBe("long");
    expect(holeToEntry(hole).puttFor).toBe("birdie");
  });

  it("keeps the 3rd putt as a miss when the total is 4", () => {
    const hole = buildHole({ holeNumber: 1, puttFor: "par", totalPutts: 4, putts: [{ meters: 9 }, { meters: 3 }, { meters: 1.2 }] });
    expect(hole.putts).toHaveLength(3);
    expect(hole.putts.every((p) => !p.cupIn)).toBe(true);
    expect(hole.scoreResult).toBe("double_bogey_plus");
    expect(shiftScore("eagle", 10)).toBe("double_bogey_plus");
  });
});

describe("strokes gained", () => {
  it("expected putts grow with distance and follow the tour table", () => {
    expect(expectedPutts(0.61, "tour")).toBeCloseTo(1.01, 2);
    expect(expectedPutts(3.05, "tour")).toBeCloseTo(1.61, 2);
    expect(expectedPutts(10, "hc15")).toBeGreaterThan(expectedPutts(10, "tour"));
  });

  it("per-putt SG adds up to the hole SG when every distance is known", () => {
    const hole = buildHole({ holeNumber: 1, puttFor: "par", totalPutts: 3, putts: [{ meters: 12 }, { meters: 2 }, { meters: 0.5 }] });
    const [obs] = holeObservations([roundWith([hole])], "tour");
    const perPutt = obs.putts.reduce((s, p) => s + (p.sg ?? 0), 0);
    expect(perPutt).toBeCloseTo(obs.sg!, 6);
    expect(obs.sg).toBeCloseTo(expectedPutts(12, "tour") - 3, 6);
  });

  it("summarises per 18 holes and splits by distance band", () => {
    const holes = [
      buildHole({ holeNumber: 1, puttFor: "birdie", totalPutts: 1, putts: [{ meters: 3 }] }),
      buildHole({ holeNumber: 2, puttFor: "par", totalPutts: 2, putts: [{ meters: 10 }, { meters: 1 }] }),
    ];
    const s = sgSummary(holeObservations([roundWith(holes)], "tour"));
    expect(s.holes).toBe(2);
    expect(s.actualPer18).toBeCloseTo(27, 6);
    const bandTotal = s.byBand.reduce((a, b) => a + b.sgTotal, 0);
    expect(bandTotal * 9).toBeCloseTo(s.sgPer18, 6);
  });

  it("wilson interval brackets the observed rate", () => {
    const ci = wilson(5, 10);
    expect(ci.low).toBeLessThan(50);
    expect(ci.high).toBeGreaterThan(50);
  });
});

describe("demo data through the whole analysis", () => {
  const rounds = generateDemoRounds();
  const holes = holeObservations(rounds, "hc15");

  it("produces believable numbers", () => {
    const s = sgSummary(holes);
    expect(s.rounds).toBe(22);
    expect(s.actualPer18).toBeGreaterThan(27);
    expect(s.actualPer18).toBeLessThan(38);
    const curve = makeCurve(holes, "hc15");
    expect(curve[0].rate).toBeGreaterThan(curve[curve.length - 1].rate);
    expect(lagStats(holes).attempts).toBeGreaterThan(50);
    expect(puttForStats(holes).length).toBeGreaterThan(2);
    expect(roundSgSeries(holes)).toHaveLength(22);
    expect(greenPoints(holes).length).toBeGreaterThan(300);
  });

  it("finds the built-in weaknesses (downhill / short lag misses)", () => {
    const lines = lineStats(holes);
    expect(lines.ud.downhill.sgPerPutt).toBeLessThan(lines.ud.uphill.sgPerPutt);
    expect(missTendency(holes).shortRate).toBeGreaterThan(50);
    const priorities = practicePriorities(holes, "hc15");
    expect(priorities.length).toBeGreaterThan(0);
  });
});
