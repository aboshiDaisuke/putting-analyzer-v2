import { describe, expect, it } from "vitest";
import { buildRoundsCsv } from "../export-csv";
import type { HoleData, Round } from "../types";
import { createDefaultPutt } from "../types";

function round(): Round {
  const holes: HoleData[] = Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    scoreResult: "par",
    totalPutts: 0,
    putts: [],
  }));
  holes[0] = {
    holeNumber: 1,
    scoreResult: "bogey",
    totalPutts: 2,
    putts: [
      { ...createDefaultPutt(1), lengthMeters: 6, distanceMeters: 6, lineUD: "uphill", lineLR: "left" },
      { ...createDefaultPutt(2), cupIn: true, lengthMeters: 1, distanceMeters: 1 },
    ],
  };
  return {
    id: "1",
    date: "2026-09-16",
    weather: "sunny",
    windSpeed: "calm",
    courseId: "",
    courseName: 'Fable "GC", East',
    frontNineGreen: "A",
    backNineGreen: "A",
    roundType: "private",
    competitionFormat: "stroke",
    grassType: "bent",
    stimpmeter: 9.5,
    greenCondition: "good",
    putterId: "",
    putterName: "Odyssey #7",
    holes,
    totalPutts: 2,
    createdAt: "",
    updatedAt: "",
  };
}

describe("buildRoundsCsv", () => {
  it("writes one row per putt of played holes only, with BOM and quoting", () => {
    const csv = buildRoundsCsv([round()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 putts (unplayed holes excluded)
    expect(lines[0].startsWith("date,course,putter")).toBe(true);
    expect(lines[1]).toContain('"Fable ""GC"", East"');
    expect(lines[1]).toContain(",1,2,Bo,1,0,6,,6,,U,L");
    expect(lines[2]).toContain(",1,2,Bo,2,1,1,,1,,,");
  });
});
