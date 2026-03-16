import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageDelete } from "./storage";
import { golfRouter } from "./golfRouter";

const OCR_SYSTEM_PROMPT = `あなたはゴルフのパッティングスコアカード「Stroke Gained Putting (OCR版)」を読み取る専門のOCRシステムです。

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

各セクションには以下の項目が **この順番** で縦に並んでいる:

1. **In（カップイン）**: □ チェックボックス。塗りつぶし/チェック = true、空白 = false
2. **Dist(prev)**: □□□ yd — **手書き数字の記入欄**（3桁分の四角い枠）
   - ★重要: この欄に数字が書かれていれば必ず読み取ること
   - 2nd/3rd Puttでは前パットからの残り距離が記入されていることが多い
   - 1st Puttでも記入がある場合は読み取る（空欄ならnull）
   - 典型値: 1〜30yd（1〜2桁が多い）
3. **Result**: ○ E / ○ Ba / ○ P / ○ Bo / ○ D+ — 塗りつぶし選択
4. **Length**: □□ st（歩数）と □□ m（メートル）— 手書き数字
5. **Missed Direction**: ○1 / ○2 / ○3 / ○4 / ○5 — 塗りつぶし選択
6. **Touch**: ○1 / ○2 / ○3 / ○4 / ○5 — 塗りつぶし選択（弱1→強5）
7. **Line (U/D)**: ○F / ○U / ○D / ○UD / ○DU — 5択横一列の塗りつぶし選択
8. **Line (L/R)**: ○St / ○L / ○R / ○LR / ○RL — 5択横一列の塗りつぶし選択
9. **Mental**: ○P / ○1〜5 / ○N — 塗りつぶし選択

## 手書き数字の読み取り（★最重要★）

カード上の手書き数字は枠（□）内に1桁ずつ記入されている。各枠を個別に読み取ること。

### 読み取り対象の数字欄（すべて必ず確認すること）
- **Dist(prev)の□□□**: 3つの枠。数字が書かれた枠だけ読む（空枠は無視）。例: □1□5□ → 15
- **Lengthの□□ st**: 2つの枠。歩数。例: □1□2 → 12
- **Lengthの□□ m**: 2つの枠。メートル。例: □□8 → 8

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

## 塗りつぶし判定ルール

### ○（選択肢）の判定
- **選択されている** = 円の内部が黒インクで塗りつぶされている（ベタ塗り・濃い丸）
- **選択されていない** = 円の輪郭だけで内部が白い
- **Line判定の手順**: 5つの○を左から右へ1つずつ確認し、内部が塗りつぶされている○だけを選択
- 迷う場合は同じ行内で最も濃いものを選択

### □（チェックボックス）の判定
- 塗りつぶし・チェック・×印 = true、空白 = false

## 数値の範囲チェック
- Dist(prev): 1〜30yd（100超は稀）
- Length Steps: 1〜30歩
- Length Meters: 0.5〜20m
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
    { "puttNumber": 2, ... },
    { "puttNumber": 3, ... }
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
                  text: "このスコアカード画像を読み取ってJSON形式で返してください。\n注意点:\n- Dist(prev)欄の手書き数字を必ず確認すること（枠内に数字があれば読み取る）\n- Length(st/m)欄の手書き数字も必ず確認すること\n- 塗りつぶし○は内部の黒さで判定すること",
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
          // 思考モード: 塗りつぶし判定・手書き数字の精度向上
          thinkingBudget: 2048,
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
                      text: "このスコアカード画像を読み取ってJSON形式で返してください。\n注意点:\n- Dist(prev)欄の手書き数字を必ず確認すること（枠内に数字があれば読み取る）\n- Length(st/m)欄の手書き数字も必ず確認すること\n- 塗りつぶし○は内部の黒さで判定すること",
                    },
                    {
                      type: "image_url",
                      image_url: { url: image.url, detail: "high" },
                    },
                  ],
                },
              ],
              response_format: { type: "json_object" },
              thinkingBudget: 2048,
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
