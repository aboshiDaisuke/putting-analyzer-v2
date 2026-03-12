import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageDelete } from "./storage";
import { golfRouter } from "./golfRouter";

const OCR_SYSTEM_PROMPT = `あなたはゴルフのパッティングスコアカード「Stroke Gained Putting (OCR版)」を読み取る専門のOCRシステムです。
手書き文字・記号の読み取りに全力を尽くし、曖昧な場合は最も可能性の高い値を選んでください。

## 最重要: 読み取り手順
カードには同じ構造のセクションが縦に3段並んでいる。必ず上から順番に3セクション全てを個別に読み取ること。
1. まず最上段セクション（1st Putt）を読み取る
2. 次に中段セクション（2nd Putt）を読み取る ← **ここを必ず確認すること**
3. 最後に最下段セクション（3rd Putt）を読み取る
2パット以上の場合、中段（2nd Putt）セクションには必ずデータが記入されている。
各セクションを「先入観なし」で独立して読み取ること。

## カードの物理的な構造
- 四隅に黒い■マーク（位置合わせ用）
- ヘッダー: Hole番号(2桁 □□), Date(8桁 □□□□□□□□ = YYYYMMDD形式), Course(手書きテキスト)
- 3つのパットセクション（上から順に縦配置）:
  - 最上段: 1st Putt
  - 中段:   2nd Putt（2パット以上ならここにデータあり）
  - 最下段: 3rd Putt（3パット以上ならここにデータあり）
- 各セクションは同じ項目構造を持つ

## 各パットセクションの項目と読み取り方法

### チェックボックス項目
- **In（カップイン）**: □ 1つ。黒く塗りつぶされている・チェックが入っている = true、空白 = false
  - 1st PuttのcupIn=trueは1パット成功（ワンパット）を意味する
  - 2nd PuttのcupIn=trueは2パット成功を意味する

### 数字記入欄（手書き数字）
- **Dist(prev)**: □□□ yd（3桁まで。前のパットからの残り距離。1st Puttには記入なしが多い）
- **Length**: □□ st（歩数）と □□ m（メートル）※どちらか一方または両方が記入される

### 選択式項目（塗りつぶした○で選択）
- **Putt（スコア結果）**: E / Ba / P / Bo / D+ のいずれか1つ
  - E=イーグル, Ba=バーディ, P=パー, Bo=ボギー, D+=ダブルボギー以上
  - JSONでは "result" フィールドに格納
- **Missed Direction（ミス方向）**: 1〜5 のいずれか1つ（Inがtrueなら通常null）
- **Touch（タッチ強度）**: 1〜5 のいずれか1つ（弱1→強5）
- **Line (U/D)**: F=フラット / U=上り / D=下り / UD=上って下る / DU=下って上る
- **Line (L/R)**: St=ストレート / L=左 / R=右 / LR=左から右 / RL=右から左
- **Mental**: P=ポジティブ / 1〜5（中間値）/ N=ネガティブ

## 塗りつぶし判定の厳格なルール

### ○（選択肢）の判定
- **選択されている** = 円の内部が黒インクでしっかり塗りつぶされている（ベタ塗り・濃い丸）
- **選択されていない** = 円の輪郭だけで内部が白い・薄い・空白
- 薄く輪郭をなぞっただけの○は「選択なし」
- 迷う場合は、同じ行の他の選択肢と比べて最も濃い・塗りつぶし面積が大きいものを選択

### □（チェックボックス）の判定
- 塗りつぶし・チェックマーク・×印があれば true、空白なら false

## 手書き数字の読み取りガイド（混同しやすい数字）
- **0 と 6**: 0は楕円形で上が閉じている、6は上部に小さな巻き込みがある
- **1 と 7**: 1は縦線のみ、7は斜めの横棒がある
- **3 と 8**: 3は右側だけ丸い、8は2つの輪を持つ
- **4 と 9**: 4は角ばった形、9は上が丸くて下が直線
- **5 と 6**: 5は上が開いて下が丸い、6は完全に閉じた下の輪
- 文脈も活用（例: Distanceは通常2〜20mの範囲、Stepsは通常2〜25の範囲）

## セクションごとの読み取りルール
- 各セクション（1st/2nd/3rd）を必ず独立して視覚的に確認すること
- **中段（2nd Putt）セクションに文字・数字・塗りつぶしが1つでもあれば**: 全フィールドを1st Puttと同様に読み取る
- 完全に空白のセクションのみ: cupIn=false・全フィールドnull
- 数字欄が空白・判読不能な場合: null
- 選択式で何も塗りつぶされていない場合: null

## パット数の判定
- 1パット: 1st PuttのcupIn=true（1つ目でカップイン） → 2nd/3rdはnull
- 2パット: 1st PuttのcupIn=false かつ 2nd PuttのcupIn=true → **2nd Puttにデータあり**
- 3パット: 1st・2nd PuttのcupIn=false かつ 3rd PuttのcupIn=true → **2nd・3rd両方にデータあり**
- 各パットの長さ・ライン・タッチ情報は記入があれば必ず読み取る

## その他の注意事項
- Dateは8桁数字をYYYYMMDD形式で（例: 20260311）
- 各選択式項目は最大1つだけ選択（複数選択は存在しない）
- カードの傾きや光の反射があっても、最善の解釈を行う

以下のJSON形式で返してください（JSONのみ、説明文なし）。
- 3つのputtオブジェクトを必ず返すこと
- 画像の中段（2nd Putt）セクションを必ず目視確認してから出力すること
- 2nd Puttが空欄の場合のみ cupIn=false・他はnull（データがあれば必ず読み取る）

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
      "puttNumber": 3,
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
    // base64を直接受け取りGeminiへ送る（Supabase経由不要 → ラウンドトリップ削減で高速化）
    analyzeScorecard: publicProcedure
      .input(
        z.object({
          base64: z.string(),
          mimeType: z.string().default("image/jpeg"),
        })
      )
      .mutation(async ({ input }) => {
        // data: URI を構築して llm.ts の inline image パスを使う
        const dataUri = `data:${input.mimeType};base64,${input.base64}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: OCR_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "このスコアカード画像を読み取ってください。各セクションを丁寧に確認し、塗りつぶされた○と空白の○を正確に判定して、JSON形式で返してください。",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: dataUri,
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
          return { success: true as const, data: parsed };
        } catch {
          return { success: false as const, data: null, rawContent: content };
        }
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
                      text: "このスコアカード画像を読み取ってください。各セクションを丁寧に確認し、塗りつぶされた○と空白の○を正確に判定して、JSON形式で返してください。",
                    },
                    {
                      type: "image_url",
                      image_url: { url: image.url, detail: "high" },
                    },
                  ],
                },
              ],
              response_format: { type: "json_object" },
              thinkingBudget: 5000,
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
