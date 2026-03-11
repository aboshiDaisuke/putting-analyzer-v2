import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageDelete } from "./storage";
import { golfRouter } from "./golfRouter";

const OCR_SYSTEM_PROMPT = `あなたはゴルフのパッティングスコアカード「Stroke Gained Putting (OCR版)」を読み取る専門のOCRシステムです。

## カードの物理的な構造
- 四隅に黒い■マーク（位置合わせ用）
- ヘッダー: Hole番号(2桁 □□), Date(8桁 □□□□□□□□ = YYYYMMDD形式), Course(手書きテキスト)
- 3つのパットセクション: 1st Putt, 2nd Putt, 3rd Putt（それぞれ同じ構造）

## 各パットセクションの項目と読み取り方法

### チェックボックス項目（□を塗りつぶしで判定）
- **In**: □ 1つ。塗りつぶされている = true、空白 = false

### 数字記入欄（手書き数字を読み取り）
- **Dist(prev)**: □□□ yd（3桁まで、前のパットからの残り距離をヤードで記入）
- **Length**: □□ st（歩数、2桁）と □□ m（メートル直入力、2桁）
  ※ st（ステップ=歩数）とm（メートル）はどちらか一方または両方が記入される

### 選択式項目（○を塗りつぶして選択。カード上は「Putt:」ラベルで始まる行に記載）
- **Putt（スコア結果）**: E / Ba / P / Bo / D+ のいずれか1つが塗りつぶされている
  - E=イーグル, Ba=バーディ, P=パー, Bo=ボギー, D+=ダブルボギー以上
  ※ カード上では「Putt:」と表記されているが、JSONでは"result"フィールドに格納する
- **Missed Direction（ミス方向）**: 1 / 2 / 3 / 4 / 5 のいずれか1つ
- **Touch（タッチ強度 弱1-5強）**: 1 / 2 / 3 / 4 / 5 のいずれか1つ
- **Line (U/D)（上下の傾斜）**: F / U / D / UD / DU のいずれか1つ
  - F=フラット, U=上り, D=下り, UD=上って下る, DU=下って上る
- **Line (L/R)（左右の曲がり）**: St / L / R / LR / RL のいずれか1つ
  - St=ストレート, L=左, R=右, LR=左から右, RL=右から左
- **Mental (P/N)（心理状態）**: P / 1 / 2 / 3 / 4 / 5 / N のいずれか1つ
  - P=ポジティブ, N=ネガティブ, 1-5は中間値（1が最もポジティブ寄り）

## 塗りつぶし判定のルール
- ○の中が黒く塗りつぶされている、または強く丸で囲まれている → 選択されている
- ○の中が白い（空白）→ 選択されていない
- □の中が塗りつぶされている、またはチェックマークがある → true
- □の中が白い → false

## 重要な注意事項
- 手書き数字は慎重に読み取ってください（0と6、1と7の区別に注意）
- Dateは8桁数字をYYYYMMDD形式で読み取る（例: 20260311 → "20260311"）
- 記入されていないパットセクション（2nd/3rd Putt）は全項目をnullにしてください
- 読み取れない項目はnullとしてください
- 各選択式項目は必ず1つだけ選択されています（複数選択はありません）

以下のJSON形式で返してください（JSONのみ、説明文は不要）:
{
  "hole": number | null,
  "date": "YYYYMMDD" | null,
  "course": string | null,
  "putts": [
    {
      "puttNumber": 1,
      "cupIn": boolean,
      "distPrev": number | null,
      "result": "E" | "Ba" | "P" | "Bo" | "D+" | null,
      "lengthSteps": number | null,
      "lengthMeters": number | null,
      "missedDirection": 1 | 2 | 3 | 4 | 5 | null,
      "touch": 1 | 2 | 3 | 4 | 5 | null,
      "lineUD": "F" | "U" | "D" | "UD" | "DU" | null,
      "lineLR": "St" | "L" | "R" | "LR" | "RL" | null,
      "mental": "P" | 1 | 2 | 3 | 4 | 5 | "N" | null
    },
    {
      "puttNumber": 2,
      "cupIn": false,
      "distPrev": null,
      "result": null,
      "lengthSteps": null,
      "lengthMeters": null,
      "missedDirection": null,
      "touch": null,
      "lineUD": null,
      "lineLR": null,
      "mental": null
    },
    {
      "puttNumber": 3,
      "cupIn": false,
      "distPrev": null,
      "result": null,
      "lengthSteps": null,
      "lengthMeters": null,
      "missedDirection": null,
      "touch": null,
      "lineUD": null,
      "lineLR": null,
      "mental": null
    }
  ]
}`;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(() => {
      // Cookie clearing is handled by REST endpoint /api/auth/logout
      // Mobile clients use supabase.auth.signOut() directly
      return { success: true } as const;
    }),
  }),

  golf: golfRouter,

  ocr: router({
    // スコアカード画像をアップロードしてS3に保存
    uploadImage: publicProcedure
      .input(
        z.object({
          base64: z.string(),
          mimeType: z.string().default("image/jpeg"),
        })
      )
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const timestamp = Date.now();
        const ext = input.mimeType === "image/png" ? "png" : "jpg";
        const key = `scorecard/${timestamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { url } = await storagePut(key, buffer, input.mimeType);
        return { imageUrl: url, imageKey: key };
      }),

    // LLMを使ってスコアカード画像を解析する
    analyzeScorecard: publicProcedure
      .input(
        z.object({
          imageUrl: z.string(),
          imageKey: z.string().optional(), // 解析後に削除するためのストレージキー
        })
      )
      .mutation(async ({ input }) => {
        let result: { success: true; data: unknown } | { success: false; data: null; rawContent: string };

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: OCR_SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "このスコアカード画像を読み取ってください。塗りつぶされた○と空白の○を正確に判定し、手書き数字を読み取って、JSON形式で返してください。",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: input.imageUrl,
                      detail: "high",
                    },
                  },
                ],
              },
            ],
            response_format: { type: "json_object" },
          });

          const rawContent = response.choices[0]?.message?.content;
          if (!rawContent) {
            throw new Error("LLMからの応答が空です");
          }

          const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

          try {
            const parsed = JSON.parse(content);
            result = { success: true as const, data: parsed };
          } catch {
            result = { success: false as const, data: null, rawContent: content };
          }
        } finally {
          // 解析完了後（成功・失敗問わず）、ストレージから画像を削除
          if (input.imageKey) {
            await storageDelete(input.imageKey);
          }
        }

        return result;
      }),

    // 複数枚のスコアカードを一括解析
    analyzeBatch: publicProcedure
      .input(
        z.object({
          images: z.array(
            z.object({
              url: z.string(),
              key: z.string().optional(), // 解析後に削除するためのストレージキー
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        const results = [];
        for (const image of input.images) {
          try {
            const response = await invokeLLM({
              messages: [
                { role: "system", content: OCR_SYSTEM_PROMPT },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "このスコアカード画像を読み取ってください。塗りつぶされた○と空白の○を正確に判定し、手書き数字を読み取って、JSON形式で返してください。",
                    },
                    {
                      type: "image_url",
                      image_url: { url: image.url, detail: "high" },
                    },
                  ],
                },
              ],
              response_format: { type: "json_object" },
            });

            const rawContent = response.choices[0]?.message?.content;
            if (rawContent) {
              const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
              results.push({ imageUrl: image.url, success: true as const, data: JSON.parse(contentStr) });
            } else {
              results.push({ imageUrl: image.url, success: false as const, data: null });
            }
          } catch (error) {
            results.push({ imageUrl: image.url, success: false, data: null, error: String(error) });
          } finally {
            // 解析完了後（成功・失敗問わず）、ストレージから画像を削除
            if (image.key) {
              await storageDelete(image.key);
            }
          }
        }
        return { results };
      }),
  }),
});

export type AppRouter = typeof appRouter;
