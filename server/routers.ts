import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import { ENV } from "./_core/env";
import { golfRouter } from "./golfRouter";
import {
  applyMarkHints,
  compareOcrHoles,
  normalizeOcrHole,
  validateOcrHole,
  type OcrHoleData,
  type OcrMarkHints,
} from "../lib/ocr-utils";
import { SCORECARD_TEMPLATE_BASE64, SCORECARD_TEMPLATE_MIME } from "./_core/scorecard-template";

// ─── OCR 構造化出力スキーマ（Gemini responseSchema / OpenAPI サブセット） ──────
// テキスト指示だけに頼らず、型・列挙値・必須キーをモデル側で強制する。
const OCR_PUTT_SCHEMA = {
  type: "object",
  properties: {
    puttNumber: { type: "integer", description: "1=1st, 2=2nd, 3=3rd" },
    cupIn: { type: "boolean", description: "In チェック枠に手書きの印があるか" },
    result: { type: "string", enum: ["E", "Ba", "P", "Bo", "D+"], nullable: true },
    lengthMeters: { type: "integer", nullable: true, description: "Length 欄の手書き数字(m)。空欄は null" },
    lineUD: { type: "string", enum: ["F", "U", "D"], nullable: true },
    lineLR: { type: "string", enum: ["St", "L", "R"], nullable: true },
  },
  required: ["puttNumber", "cupIn", "result", "lengthMeters", "lineUD", "lineLR"],
} as const;

const OCR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    hole: { type: "integer", nullable: true, description: "Hole 欄の2桁。空欄は null" },
    date: { type: "string", nullable: true, description: "Date 欄の8桁 YYYYMMDD。空欄は null" },
    course: { type: "string", nullable: true },
    putts: { type: "array", items: OCR_PUTT_SCHEMA, minItems: 3, maxItems: 3 },
  },
  required: ["hole", "date", "course", "putts"],
} as const;

// お手本（未記入テンプレート）を会話履歴として先に見せる few-shot。
// 「印刷された枠・ラベルは記入ではない」をモデルに実物で示す。
const TEMPLATE_TURNS: Message[] = [
  {
    role: "user",
    content: [
      {
        type: "image_url",
        image_url: { url: `data:${SCORECARD_TEMPLATE_MIME};base64,${SCORECARD_TEMPLATE_BASE64}` },
      },
      {
        type: "text",
        text:
          "これは何も記入していないスコアカードのテンプレートです。ここに印刷されている枠線・ラベル文字（E/Ba/P/Bo/D+、F/U/D、St/L/R など）・罫線・四隅の■は全て「記入なし」です。" +
          "次に送る写真では、このテンプレートに対して手書きで追加された印や数字だけを読み取ってください。",
      },
    ],
  },
  {
    role: "assistant",
    content:
      "了解しました。テンプレートに元から印刷されている要素は無視し、手書きで追加されたチェック・塗りつぶし・丸・数字だけを記入データとして読み取ります。",
  },
];

const OCR_USER_TEXT = "このスコアカード画像(v2)を読み取ってJSON形式で返してください。\n注意点:\n- 手書きで記入されていない枠は必ずnullにすること（印刷文字のみの枠は空欄扱い）\n- Length(m)欄の手書き数字を必ず確認すること\n- 選択肢の判定: ラベルは枠の上に印刷されている。ユーザーが印（✓・塗りつぶし・丸など）を付けた枠の位置（左から何番目か）で値を決めること";

const OCR_SYSTEM_PROMPT = `あなたはゴルフのパッティングスコアカード「Stroke Gained Putting v2」を読み取る専門のOCRシステムです。

## 最重要: 読み取り手順
カードには同じ構造のセクションが縦に3段並んでいる。必ず上から順番に3セクション全てを個別に読み取ること。
1. まず最上段セクション（1st Putt）を読み取る
2. 次に中段セクション（2nd Putt）を読み取る ← **ここを必ず確認すること**
3. 最後に最下段セクション（3rd Putt）を読み取る

## カードの物理的な構造
- 四隅に黒い■マーク（位置合わせ用）
- ヘッダー: Hole番号(□□), Date(□□□□□□□□ = YYYYMMDD), Course(手書きテキスト)
- 3つのパットセクション（上から順に縦配置）

## 各セクション内の項目（上から順に配置）

各セクションには以下の3行が **この順番** で縦に並んでいる:

### 行1: In / Putt/Result
- **In（カップイン）**: □ チェックボックス。チェック/塗りつぶし = true、空白 = false
- **Putt/Result（結果）**: 5つの空の□枠が横一列に並び、各枠の **上に小さくラベルが印字** されている
  - 左から順に: 上にE / Ba / P / Bo / D+
  - ユーザーは該当する枠の中に✓・塗りつぶし・丸などで印をつける

### 行2: Length
- **Length**: □□ m — 2桁の手書き数字（メートル）。空枠はnull

### 行3: Line(U/D) / Line(L/R)
- **Line(U/D)**: 3つの空の□枠が横一列、上にラベル印字
  - 左から順に: 上にF / U / D
- **Line(L/R)**: 3つの空の□枠が横一列、上にラベル印字
  - 左から順に: 上にSt / L / R

## 選択肢□枠の判定ルール（★重要★）

選択肢の□枠は **空（中身なし）** で、上にラベル文字（E, Ba, P, F, U, St など）が印字されている。
ユーザーは選択した枠に以下のいずれかの方法で印をつける:
- 枠内の✓やチェック
- 枠の塗りつぶし
- 枠を囲む丸

### 判定手順
1. 該当行の□枠を **左から右へ順番に** 確認する
2. 印がついている枠の **位置（何番目か）** で選択肢を特定する
3. 枠の位置と対応する選択肢の値は以下の通り:

**Putt/Result**: 1番目=E, 2番目=Ba, 3番目=P, 4番目=Bo, 5番目=D+
**Line(U/D)**: 1番目=F, 2番目=U, 3番目=D
**Line(L/R)**: 1番目=St, 2番目=L, 3番目=R

### ★枠の上のラベル文字を選択値と誤判定しないこと★
ラベルは印刷された印字物であり、ユーザーの記入ではない。**枠の中に手書きの印があるか** だけで判定すること。

## 手書き数字の読み取り

カード上の手書き数字は枠（□）内に1桁ずつ記入されている。各枠を個別に読み取ること。

### 読み取り対象の数字欄
- **Hole（□□）**: 2桁。例: □1□7 → 17
- **Date（□□□□□□□□）**: 8桁 YYYYMMDD
- **Lengthの□□ m**: 2桁。例: □8 → 8、12 → 12

### 数字の判別ガイド
- **1**: 縦棒1本。セリフ（上下の横線）がある場合もある
- **2**: 上が丸く下に横線。曲線→斜め→横線
- **3**: 右側に2つの膨らみ。上下とも右向きカーブ
- **4**: 縦と横が交差。角ばった形
- **5**: 上に横線→下に丸み。上部は直線的
- **6**: 上部が丸く巻いて下に閉じた輪
- **7**: 上に横線→斜めの縦線。横棒が目印
- **8**: 上下2つの閉じた輪
- **9**: 上に閉じた輪→下に直線またはカーブ
- **0**: 閉じた楕円形

### よくある誤読パターン
- 1 ↔ 7: 横棒の有無で判断
- 3 ↔ 8: 左側が閉じているか（8）開いているか（3）
- 4 ↔ 9: 角ばっているか（4）丸いか（9）
- 5 ↔ 6: 上部が開いているか（5）巻いているか（6）
- 0 ↔ 6: 上部がまっすぐ閉じているか（0）巻き込みがあるか（6）

## 空欄の判定（★重要★）
- 枠の中に手書きの数字・チェック・塗りつぶし・丸が **一切ない** 場合は **null** にすること
- 印刷された罫線・枠線・ラベル文字（E, Ba, F, U など）を手書きの記入と間違えないこと
- 手書きのインク跡（塗りつぶし・丸囲み・チェック・手書き数字）だけが記入データである
- **迷ったらnullにする** — 存在しないデータを推測・捏造してはならない

## 数値の範囲チェック
- Length Meters: 1〜20m
- Hole: 1〜18
- 範囲外は読み間違いの可能性が高いので再確認し、それでも範囲外なら null

## セクション判定
- データが1つでもあるセクション → 全フィールドを読み取る
- 完全に空白のセクション → cupIn=false、他は全てnull
- 2パット: 1st=false + 2nd=true → 2ndにデータあり
- 3パット: 1st=false + 2nd=false + 3rd=true → 2nd・3rd両方にデータあり

以下のJSON形式で返してください（JSONのみ、説明文なし）:
{
  "hole": number | null,
  "date": "YYYYMMDD" | null,
  "course": string | null,
  "putts": [
    {
      "puttNumber": 1,
      "cupIn": boolean,
      "result": "E" | "Ba" | "P" | "Bo" | "D+" | null,
      "lengthMeters": number | null,
      "lineUD": "F" | "U" | "D" | null,
      "lineLR": "St" | "L" | "R" | null
    },
    { "puttNumber": 2, ... },
    { "puttNumber": 3, ... }
  ]
}`;

const choiceHintSchema = z.union([z.number().int().min(0).max(4), z.null(), z.literal("unsure")]);
const sectionHintSchema = z.object({
  cupIn: z.union([z.boolean(), z.literal("unsure")]),
  result: choiceHintSchema,
  lineUD: choiceHintSchema,
  lineLR: choiceHintSchema,
});
const markHintsSchema: z.ZodType<OcrMarkHints> = z.object({
  sections: z.tuple([sectionHintSchema, sectionHintSchema, sectionHintSchema]),
});

export const appRouter = router({
  // 認証は Supabase Auth をクライアントが直接使う（ログイン/ログアウト/セッション）。
  // サーバーは Authorization: Bearer <access token> を検証するだけで、
  // 独自の auth エンドポイントは持たない。
  golf: golfRouter,

  ocr: router({
    // LLMを使ってスコアカード画像を解析する
    // base64を直接受け取りGeminiへ送る（Supabase経由不要 → ラウンドトリップ削減で高速化）
    // 認証必須: Gemini APIコストを伴うため未認証の呼び出しを禁止する
    //
    // 精度向上の仕組み:
    //  1. 端末側で四隅■マークから台形補正した画像を受け取る（rectified）
    //  2. 未記入テンプレートを few-shot として同送し、印刷部分と手書きを区別させる
    //  3. responseSchema で出力構造・列挙値を強制する
    //  4. 別モデルで二重読みし、食い違ったフィールドを conflicts として返す
    //  5. 端末側の画素判定（チェック枠）を LLM の結果に重ねる（markHints）
    //  6. 記入ルールの整合性チェックで warnings を返す
    analyzeScorecard: protectedProcedure
      .input(
        z.object({
          base64: z.string(),
          mimeType: z.string().default("image/jpeg"),
          rectified: z.boolean().default(false),
          markHints: markHintsSchema.optional(),
        })
      )
      .mutation(async ({ input }) => {
        const dataUri = `data:${input.mimeType};base64,${input.base64}`;
        const userText = input.rectified
          ? OCR_USER_TEXT + "\n- この画像は四隅の■マークを基準に正面から見た形へ補正済みです。カード全体が写っています。"
          : OCR_USER_TEXT;

        const messages: Message[] = [
          { role: "system", content: OCR_SYSTEM_PROMPT },
          ...TEMPLATE_TURNS,
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: dataUri } },
            ],
          },
        ];

        const runPass = async (model?: string): Promise<OcrHoleData | null> => {
          const response = await invokeLLM({
            messages,
            model,
            responseSchema: OCR_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
            thinkingBudget: 2048, // Gemini 2.5系に切り替えた場合のみ使用
            thinkingLevel: "high", // Gemini 3系: 視覚タスクのため high
          });
          const rawContent = response.choices[0]?.message?.content;
          if (!rawContent) return null;
          const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
          try {
            return normalizeOcrHole(JSON.parse(content));
          } catch {
            return null;
          }
        };

        const verifyModel = ENV.ocrVerifyModel && ENV.ocrVerifyModel !== ENV.geminiModel ? ENV.ocrVerifyModel : null;
        const [primaryResult, verifyResult] = await Promise.allSettled([
          runPass(),
          verifyModel ? runPass(verifyModel) : Promise.resolve(null),
        ]);

        const primary = primaryResult.status === "fulfilled" ? primaryResult.value : null;
        const verify = verifyResult.status === "fulfilled" ? verifyResult.value : null;
        if (primaryResult.status === "rejected" && !verify) {
          throw primaryResult.reason instanceof Error
            ? primaryResult.reason
            : new Error(String(primaryResult.reason));
        }

        let data = primary ?? verify;
        if (!data) {
          return { success: false as const, data: null, conflicts: [], warnings: [], rawContent: "" };
        }

        const conflicts = new Set<string>();
        if (primary && verify) {
          for (const path of compareOcrHoles(primary, verify)) conflicts.add(path);
        }
        if (input.markHints) {
          const merged = applyMarkHints(data, input.markHints);
          data = merged.hole;
          for (const path of merged.conflicts) conflicts.add(path);
        }

        return {
          success: true as const,
          data,
          conflicts: Array.from(conflicts),
          warnings: validateOcrHole(data),
          meta: {
            rectified: input.rectified,
            usedMarkHints: Boolean(input.markHints),
            models: verifyModel ? [ENV.geminiModel, verifyModel] : [ENV.geminiModel],
            verified: Boolean(primary && verify),
          },
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
