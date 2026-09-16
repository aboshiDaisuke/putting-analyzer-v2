/**
 * export-csv.ts — ラウンド/ホール/パットを1行1パットの CSV に変換して端末へ渡す。
 * Excel で開けるよう UTF-8 BOM 付き。Web はダウンロード、ネイティブは共有シート。
 */
import { Platform, Share } from "react-native";
import { LABELS, type Round } from "./types";
import { getPlayedHoles } from "./analytics";

const HEADER = [
  "date",
  "course",
  "putter",
  "grassType",
  "stimpmeter",
  "greenCondition",
  "weather",
  "hole",
  "holeTotalPutts",
  "scoreResult",
  "stroke",
  "cupIn",
  "lengthMeters",
  "lengthSteps",
  "distanceMeters",
  "distPrevYd",
  "lineUD",
  "lineLR",
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** プレー済みホールのパットを1行ずつ並べた CSV 文字列（BOM 付き）を返す */
export function buildRoundsCsv(rounds: Round[]): string {
  const rows: string[] = [HEADER.join(",")];
  const sorted = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  for (const round of sorted) {
    for (const hole of getPlayedHoles(round)) {
      const putts = hole.putts.length > 0 ? hole.putts : [null];
      for (const putt of putts) {
        rows.push(
          [
            round.date,
            round.courseName,
            round.putterName,
            LABELS.grassType[round.grassType] ?? round.grassType,
            round.stimpmeter,
            LABELS.greenCondition[round.greenCondition] ?? round.greenCondition,
            LABELS.weather[round.weather] ?? round.weather,
            hole.holeNumber,
            hole.totalPutts,
            LABELS.scoreResultShort[hole.scoreResult] ?? hole.scoreResult,
            putt?.strokeNumber ?? "",
            putt ? (putt.cupIn ? 1 : 0) : "",
            putt?.lengthMeters ?? "",
            putt?.lengthSteps ?? "",
            putt ? (putt.distanceMeters > 0 ? putt.distanceMeters : "") : "",
            putt?.distPrev ?? "",
            putt?.lineUD ? LABELS.slopeUpDownShort[putt.lineUD] : "",
            putt?.lineLR ? LABELS.slopeLeftRightShort[putt.lineLR] : "",
          ]
            .map(csvCell)
            .join(","),
        );
      }
    }
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}

function fileName(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `putting-analyzer-${ymd}.csv`;
}

/** CSV を端末へ渡す（Web: ダウンロード / ネイティブ: 共有） */
export async function deliverCsv(csv: string): Promise<void> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ title: fileName(), message: csv });
}
