/**
 * パッティングカード v3 の SVG を layout.ts の mm 座標から生成する（純粋関数・DOM 非依存）。
 *
 * 用途:
 *  - 印刷用シート public/scorecard/putting-card-v3.html（scripts/scorecard/build-card.ts）
 *  - シートに載せる「記入例」
 *  - OCR テスト用の合成写真（scripts/scorecard/gen-fixtures.js）
 *
 * `fill` を渡すと手書き風の記入を重ねて描く（✓・塗りつぶし・×・○、数字）。
 */
import {
  CARD_H,
  CARD_W,
  COLUMNS,
  COURSE_LINE,
  DATE_BOXES,
  GROUP_DIVIDERS,
  HEADER_BAND,
  MARKER_CENTERS,
  MARKER_SIZE,
  OPTION_PRINT_LABELS,
  ORIENTATION_KEY,
  ROWS,
  ROWS_BOTTOM,
  ROWS_TOP,
  ROW_COUNT,
  ROW_PITCH,
  SIDE_CODE,
  decimalDotCenter,
  holeNumberFor,
  rowCenterY,
  type CardSide,
  type MmRect,
  LR_OPTIONS,
  MISS_OPTIONS,
  PUTT_FOR_OPTIONS,
  UD_OPTIONS,
} from "./layout";
import type { OcrCard, OcrRow } from "./ocr";

export type MarkStyle = "check" | "fill" | "cross" | "circle" | "slash";

export type FillRow = {
  puttFor?: number;
  p1?: { dist?: string; ud?: number; lr?: number; miss?: number };
  /** "1.5" のように小数1桁。"2" なら整数部だけ記入 */
  p2?: { dist?: string; ud?: number; lr?: number };
  p3?: { dist?: string };
  total?: string;
};

export type CardFill = {
  date?: string; // "0925"
  course?: string;
  rows: (FillRow | null)[];
  /** 既定の印の書き方。行ごとに変えたいときは markStyles で上書き */
  markStyle?: MarkStyle;
  /** 例: { "0.puttFor": "fill", "2.p1.ud": "circle" } */
  markStyles?: Record<string, MarkStyle>;
  /** ペン（濃紺）か鉛筆（灰色） */
  ink?: "pen" | "pencil";
  /**
   * 雑な書き方を再現する（テスト用）。数字の字体・傾き・大きさ・位置、印の位置と大きさをばらつかせる。
   * 値は乱数の種。
   */
  messy?: number;
};

const FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif";
const HAND = "'Caveat', 'Bradley Hand', 'Comic Sans MS', cursive";

const f = (n: number) => Number(n.toFixed(3)).toString();

function rect(r: MmRect, attrs: string): string {
  return `<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" ${attrs}/>`;
}

function text(x: number, y: number, s: string, attrs: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<text x="${f(x)}" y="${f(y)}" ${attrs}>${esc}</text>`;
}

function centerText(r: MmRect, s: string, size: number, attrs = ""): string {
  return text(r.x + r.w / 2, r.y + r.h / 2 + size * 0.36, s, `font-size="${f(size)}" text-anchor="middle" ${attrs}`);
}

/** 手書きの印 */
// 雑な手書きの再現用（handwriting() の間だけ有効）
let messyRand: (() => number) | null = null;
const MESSY_FONTS = ["Caveat", "Kalam", "Patrick Hand", "Reenie Beanie", "Nanum Pen Script"];

function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

function jitter(r: MmRect, body: string, amount: { move: number; rot: number; scale: [number, number] }): string {
  if (!messyRand) return body;
  const rnd = messyRand;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = (rnd() - 0.5) * 2 * amount.move * r.w;
  const dy = (rnd() - 0.5) * 2 * amount.move * r.h;
  const rot = (rnd() - 0.5) * 2 * amount.rot;
  const sc = amount.scale[0] + rnd() * (amount.scale[1] - amount.scale[0]);
  return `<g transform="translate(${f(cx + dx)} ${f(cy + dy)}) rotate(${f(rot)}) scale(${f(sc)}) translate(${f(-cx)} ${f(-cy)})">${body}</g>`;
}

function mark(r: MmRect, style: MarkStyle, ink: string): string {
  return jitter(r, markBody(r, style, ink), { move: 0.22, rot: 15, scale: [0.9, 1.35] });
}

function markBody(r: MmRect, style: MarkStyle, ink: string): string {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const s = r.w;
  const sw = f(Math.max(0.35, s * 0.11));
  switch (style) {
    case "fill":
      return rect({ x: r.x + s * 0.12, y: r.y + s * 0.12, w: s * 0.76, h: r.h * 0.76 }, `fill="${ink}" rx="0.3"`);
    case "cross":
      return `<path d="M${f(r.x + s * 0.15)} ${f(r.y + s * 0.15)} L${f(r.x + s * 0.85)} ${f(r.y + r.h * 0.85)} M${f(r.x + s * 0.85)} ${f(r.y + s * 0.15)} L${f(r.x + s * 0.15)} ${f(r.y + r.h * 0.85)}" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`;
    case "slash":
      return `<path d="M${f(r.x + s * 0.2)} ${f(r.y + r.h * 0.85)} L${f(r.x + s * 0.82)} ${f(r.y + s * 0.12)}" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`;
    case "circle":
      return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(s * 0.62)}" ry="${f(r.h * 0.6)}" stroke="${ink}" stroke-width="${sw}" fill="none"/>`;
    case "check":
    default:
      return `<path d="M${f(r.x + s * 0.12)} ${f(cy)} L${f(r.x + s * 0.42)} ${f(r.y + r.h * 0.86)} L${f(r.x + s * 0.95)} ${f(r.y + r.h * 0.05)}" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  }
}

function digit(r: MmRect, ch: string, ink: string): string {
  if (!ch.trim()) return "";
  const font = messyRand ? `'${MESSY_FONTS[Math.floor(messyRand() * MESSY_FONTS.length)]}', ${HAND}` : HAND;
  const body = text(r.x + r.w / 2, r.y + r.h * 0.84, ch, `font-family="${font}" font-size="${f(r.h * 1.05)}" font-weight="700" text-anchor="middle" fill="${ink}"`);
  return jitter(r, body, { move: 0.14, rot: 14, scale: [0.8, 1.25] });
}

/** "12" → 2枠。"1.5" → [1][5]。"0.8" → [0][8]。".5" → [ ][5] */
function writeDigits(boxes: MmRect[], value: string | undefined, ink: string, decimalField: boolean): string {
  if (!value) return "";
  if (decimalField) {
    const [intPart, decPart = ""] = value.split(".");
    return digit(boxes[0], intPart ?? "", ink) + digit(boxes[1], decPart.slice(0, 1), ink);
  }
  const padded = value.padStart(boxes.length, " ");
  return boxes.map((b, i) => digit(b, padded[i] ?? "", ink)).join("");
}

// ─── 印刷部分 ────────────────────────────────────────────────────────────────

function printedHeader(side: CardSide): string {
  const out: string[] = [];
  out.push(text(15.2, 7.9, "PUTTING CARD", `font-size="2.5" font-weight="700" letter-spacing="0.25"`));
  out.push(text(15.2, 10.4, "Stroke Gained Putting v3", `font-size="1.5" fill="#555"`));
  out.push(text(42.5, 9.0, side === "out" ? "OUT" : "IN", `font-size="5.2" font-weight="900"`));
  out.push(text(side === "out" ? 53.6 : 50.4, 9.0, side === "out" ? "1–9H" : "10–18H", `font-size="2.3" font-weight="700"`));
  // 面コード（OCR 用）
  SIDE_CODE.forEach((r, i) => {
    const filled = (side === "out" && i === 0) || (side === "in" && i === 1);
    out.push(rect(r, filled ? `fill="#000"` : `fill="#fff" stroke="#000" stroke-width="0.25"`));
  });
  if (side === "out") {
    out.push(text(97.6, 8.4, "日付", `font-size="2.2" font-weight="700" text-anchor="end"`));
    DATE_BOXES.forEach((r) => out.push(rect(r, `fill="#fff" stroke="#000" stroke-width="0.3"`)));
    out.push(text(111.7, 8.6, "/", `font-size="3.2" text-anchor="middle"`));
    out.push(text(99 + 2.9, 3.3, "月", `font-size="1.5" fill="#555" text-anchor="middle"`));
    out.push(text(113.1 + 5.8, 3.3, "日", `font-size="1.5" fill="#555" text-anchor="middle"`));
    out.push(text(COURSE_LINE.x - 1.2, 8.4, "コース", `font-size="2.2" font-weight="700" text-anchor="end"`));
    out.push(`<line x1="${COURSE_LINE.x}" y1="${f(COURSE_LINE.y + COURSE_LINE.h)}" x2="${f(COURSE_LINE.x + COURSE_LINE.w)}" y2="${f(COURSE_LINE.y + COURSE_LINE.h)}" stroke="#000" stroke-width="0.3"/>`);
  } else {
    out.push(text(97.6, 8.4, "メモ", `font-size="2.2" font-weight="700" text-anchor="end"`));
    out.push(`<line x1="99" y1="9.6" x2="165" y2="9.6" stroke="#999" stroke-width="0.25" stroke-dasharray="0.8 0.8"/>`);
  }
  return out.join("");
}

function printedColumnHeader(): string {
  const out: string[] = [];
  const g = HEADER_BAND;
  const groupLabel = (x0: number, x1: number, s: string) =>
    centerText({ x: x0, y: g.groupY, w: x1 - x0, h: g.groupH }, s, 2.3, `font-weight="700"`);
  const optionLabels = (x0: number, pitch: number, labels: readonly string[], size = 2.3) =>
    labels.map((l, i) => centerText({ x: x0 + i * pitch, y: g.optionY, w: pitch, h: g.optionH }, l, size, `font-weight="700"`)).join("");

  // グループ見出しの背景
  out.push(rect({ x: 4, y: g.groupY, w: 162.5, h: g.groupH + g.optionH }, `fill="#E9E9E9"`));
  out.push(centerText({ x: 4, y: g.groupY, w: 9.5, h: g.groupH + g.optionH }, "H", 3, `font-weight="900"`));
  out.push(groupLabel(13.5, 39.3, "何のパット？"));
  out.push(groupLabel(39.3, 95.4, "1st パット"));
  out.push(groupLabel(95.4, 142.2, "2nd パット"));
  out.push(groupLabel(142.2, 157.7, "3rd"));
  out.push(groupLabel(157.7, 166.5, "計"));

  out.push(optionLabels(COLUMNS.puttFor, 4.8, OPTION_PRINT_LABELS.puttFor, 2.1));
  out.push(centerText({ x: COLUMNS.p1Dist, y: g.optionY, w: 11.6, h: g.optionH }, "距離 m", 2.1, `font-weight="700"`));
  out.push(optionLabels(COLUMNS.p1UD, 4.8, OPTION_PRINT_LABELS.ud));
  out.push(optionLabels(COLUMNS.p1LR, 4.8, OPTION_PRINT_LABELS.lr));
  out.push(optionLabels(COLUMNS.p1Miss, 4.8, OPTION_PRINT_LABELS.miss));
  out.push(centerText({ x: COLUMNS.p2Dist, y: g.optionY, w: 13, h: g.optionH }, "距離 m", 2.1, `font-weight="700"`));
  out.push(optionLabels(COLUMNS.p2UD, 4.8, OPTION_PRINT_LABELS.ud));
  out.push(optionLabels(COLUMNS.p2LR, 4.8, OPTION_PRINT_LABELS.lr));
  out.push(centerText({ x: COLUMNS.p3Dist, y: g.optionY, w: 13, h: g.optionH }, "距離 m", 2.1, `font-weight="700"`));
  out.push(centerText({ x: COLUMNS.total, y: g.optionY, w: 6.4, h: g.optionH }, "打", 2.1, `font-weight="700"`));

  // 小見出しの細い下線（傾斜 / 曲がり / 外れ の区切り）
  const underline = (x0: number, x1: number) =>
    `<line x1="${f(x0 + 0.5)}" y1="${f(g.optionY + 0.2)}" x2="${f(x1 - 0.5)}" y2="${f(g.optionY + 0.2)}" stroke="#777" stroke-width="0.2"/>`;
  out.push(underline(COLUMNS.p1UD, COLUMNS.p1UD + 14.4));
  out.push(underline(COLUMNS.p1LR, COLUMNS.p1LR + 14.4));
  out.push(underline(COLUMNS.p1Miss, COLUMNS.p1Miss + 9.6));
  out.push(underline(COLUMNS.p2UD, COLUMNS.p2UD + 14.4));
  out.push(underline(COLUMNS.p2LR, COLUMNS.p2LR + 14.4));
  return out.join("");
}

function printedRows(side: CardSide): string {
  const out: string[] = [];
  const box = `fill="#fff" stroke="#000" stroke-width="0.3"`;
  ROWS.forEach((row, i) => {
    if (i % 2 === 1) out.push(rect({ x: 4, y: row.band.y, w: 162.5, h: row.band.h }, `fill="#F1F1F1"`));
    out.push(centerText({ x: 4, y: row.band.y, w: 9.5, h: row.band.h }, String(holeNumberFor(side, i)), 4.2, `font-weight="900"`));
    for (const r of [...row.puttFor, ...row.p1.ud, ...row.p1.lr, ...row.p1.miss, ...row.p2.ud, ...row.p2.lr]) out.push(rect(r, box));
    for (const r of [...row.p1.dist, ...row.p2.dist, ...row.p3.dist, row.total]) out.push(rect(r, box));
    const cy = rowCenterY(i);
    for (const x0 of [COLUMNS.p2Dist, COLUMNS.p3Dist]) {
      const d = decimalDotCenter(x0, cy);
      out.push(`<circle cx="${f(d.x)}" cy="${f(d.y)}" r="0.45" fill="#000"/>`);
    }
  });
  // 行の区切り
  for (let i = 0; i <= ROW_COUNT; i++) {
    const y = ROWS_TOP + ROW_PITCH * i;
    out.push(`<line x1="4" y1="${f(y)}" x2="166.5" y2="${f(y)}" stroke="${i === 0 || i === ROW_COUNT ? "#000" : "#BBB"}" stroke-width="${i === 0 || i === ROW_COUNT ? 0.35 : 0.15}"/>`);
  }
  // グループの区切り
  for (const x of GROUP_DIVIDERS) {
    out.push(`<line x1="${f(x)}" y1="${f(HEADER_BAND.groupY)}" x2="${f(x)}" y2="${f(ROWS_BOTTOM)}" stroke="#000" stroke-width="0.3"/>`);
  }
  return out.join("");
}

function printedFooter(): string {
  const out: string[] = [];
  const small = `font-size="1.95" fill="#222"`;
  out.push(text(10.5, 93.0, "何のパット＝1打目のパットが入れば何のスコアか（E イーグル / Ba バーディ / P パー / Bo ボギー / D+ ダボ以上）", small));
  out.push(text(10.5, 95.9, "平上下＝上り下り　直左右＝曲がる向き　短長＝外れた1stがショートかオーバーか　計＝そのホールの総パット数", small));
  out.push(text(10.5, 100.6, "✓は枠の中に／数字は1枠に1字（2nd・3rd は 1.5 のように小数1桁）／四隅の■を入れて真上から撮影", `font-size="1.95" font-weight="700"`));
  return out.join("");
}

function printedMarkers(): string {
  const out = MARKER_CENTERS.map((c) =>
    rect({ x: c.x - MARKER_SIZE / 2, y: c.y - MARKER_SIZE / 2, w: MARKER_SIZE, h: MARKER_SIZE }, `fill="#000"`),
  );
  out.push(rect(ORIENTATION_KEY, `fill="#000"`));
  return out.join("");
}

// ─── 手書きの重ね描き ─────────────────────────────────────────────────────────

function handwriting(side: CardSide, fill: CardFill): string {
  messyRand = fill.messy ? seeded(fill.messy) : null;
  try {
    return handwritingBody(side, fill);
  } finally {
    messyRand = null;
  }
}

function handwritingBody(side: CardSide, fill: CardFill): string {
  const ink = fill.ink === "pencil" ? "#6E6E6E" : "#1B2A5C";
  const out: string[] = [];
  const styleFor = (key: string) => fill.markStyles?.[key] ?? fill.markStyle ?? "check";
  if (side === "out" && fill.date) {
    DATE_BOXES.forEach((b, i) => out.push(digit(b, fill.date![i] ?? "", ink)));
  }
  if (side === "out" && fill.course) {
    out.push(text(COURSE_LINE.x + 1, COURSE_LINE.y + COURSE_LINE.h - 1, fill.course, `font-family="${HAND}" font-size="4" fill="${ink}"`));
  }
  fill.rows.forEach((r, i) => {
    if (!r) return;
    const row = ROWS[i];
    if (r.puttFor != null) out.push(mark(row.puttFor[r.puttFor], styleFor(`${i}.puttFor`), ink));
    if (r.p1) {
      out.push(writeDigits(row.p1.dist, r.p1.dist, ink, false));
      if (r.p1.ud != null) out.push(mark(row.p1.ud[r.p1.ud], styleFor(`${i}.p1.ud`), ink));
      if (r.p1.lr != null) out.push(mark(row.p1.lr[r.p1.lr], styleFor(`${i}.p1.lr`), ink));
      if (r.p1.miss != null) out.push(mark(row.p1.miss[r.p1.miss], styleFor(`${i}.p1.miss`), ink));
    }
    if (r.p2) {
      out.push(writeDigits(row.p2.dist, r.p2.dist, ink, true));
      if (r.p2.ud != null) out.push(mark(row.p2.ud[r.p2.ud], styleFor(`${i}.p2.ud`), ink));
      if (r.p2.lr != null) out.push(mark(row.p2.lr[r.p2.lr], styleFor(`${i}.p2.lr`), ink));
    }
    if (r.p3) out.push(writeDigits(row.p3.dist, r.p3.dist, ink, true));
    if (r.total) out.push(digit(row.total, r.total, ink));
  });
  return out.join("");
}

export type CardSvgOptions = {
  fill?: CardFill;
  /** 面の外形線（切り取り線とは別の細い枠）を描く */
  outline?: boolean;
  /** SVG の width/height 属性（既定は mm 実寸） */
  width?: string;
  height?: string;
  id?: string;
};

export function buildCardSvg(side: CardSide, opts: CardSvgOptions = {}): string {
  const body = [
    rect({ x: 0, y: 0, w: CARD_W, h: CARD_H }, `fill="#fff"`),
    opts.outline ? rect({ x: 0.15, y: 0.15, w: CARD_W - 0.3, h: CARD_H - 0.3 }, `fill="none" stroke="#999" stroke-width="0.2" rx="2"`) : "",
    printedMarkers(),
    printedHeader(side),
    printedColumnHeader(),
    printedRows(side),
    printedFooter(),
    opts.fill ? handwriting(side, opts.fill) : "",
  ].join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ${opts.id ? `id="${opts.id}" ` : ""}viewBox="0 0 ${CARD_W} ${CARD_H}" ` +
    `width="${opts.width ?? `${CARD_W}mm`}" height="${opts.height ?? `${CARD_H}mm`}" ` +
    `font-family="${FONT}" fill="#000">${body}</svg>`
  );
}

// ─── 記入内容 → 正解の読み取り結果（お手本・テスト用） ─────────────────────


export function fillToOcrCard(side: CardSide, fill: CardFill): OcrCard {
  const num = (s: string | undefined) => (s ? Number(s.startsWith(".") ? `0${s}` : s) : null);
  const rows: OcrRow[] = Array.from({ length: ROW_COUNT }, (_, i) => {
    const r = fill.rows[i];
    return {
      puttFor: r?.puttFor != null ? PUTT_FOR_OPTIONS[r.puttFor] : null,
      p1: {
        meters: num(r?.p1?.dist),
        ud: r?.p1?.ud != null ? UD_OPTIONS[r.p1.ud] : null,
        lr: r?.p1?.lr != null ? LR_OPTIONS[r.p1.lr] : null,
        miss: r?.p1?.miss != null ? MISS_OPTIONS[r.p1.miss] : null,
      },
      p2: {
        meters: num(r?.p2?.dist),
        ud: r?.p2?.ud != null ? UD_OPTIONS[r.p2.ud] : null,
        lr: r?.p2?.lr != null ? LR_OPTIONS[r.p2.lr] : null,
      },
      p3: { meters: num(r?.p3?.dist) },
      total: r?.total ? Number(r.total) : null,
    };
  });
  return { side, date: side === "out" ? fill.date ?? null : null, course: side === "out" ? fill.course ?? null : null, rows };
}
