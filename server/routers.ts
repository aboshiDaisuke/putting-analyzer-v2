import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageDelete } from "./storage";
import { golfRouter } from "./golfRouter";

// 空白テンプレート画像のURL（Supabase Storageに恒久保存済み）
const TEMPLATE_IMAGE_URL = "https://ijrrzinlhqhinlmzunzn.supabase.co/storage/v1/object/public/scorecards/template/scorecard-template.jpg";

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

### 行1: In / Dist(prev) / Putt
- **In（カップイン）**: □ チェックボックス。塗りつぶし/チェック = true、空白 = false
- **Dist(prev)**: □□□ yd — 手書き数字の記入欄（1st Puttのみ。2nd/3rd Puttにはこの欄がない）
  - ★重要: この欄に数字が書かれていれば必ず読み取ること
  - 典型値: 1〜30yd（1〜2桁が多い）
  - 空欄ならnull
- **Putt（結果）**: 5つの□枠が横一列に並び、各枠内に印刷文字がある
  - 左から順に: [E] [Ba] [P] [Bo] [D+]
  - ユーザーは選択した枠に丸囲み・チェック・塗りつぶしで印をつける

### 行2: Length
- **Length**: □□□ st（歩数）と □□□ m（メートル）— 手書き数字

### 行3: Missed Direction / Touch
- **Missed Direction**: 5つの□枠が横一列: [1] [2] [3] [4] [5]
- **Touch（弱1-5強）**: 5つの□枠が横一列: [1] [2] [3] [4] [5]

### 行4: Line (U/D) / Line (L/R)
- **Line (U/D)**: 5つの□枠が横一列に並び、各枠内に印刷文字がある
  - 左から順に: [F] [U] [D] [UD] [DU]
- **Line (L/R)**: 5つの□枠が横一列に並び、各枠内に印刷文字がある
  - 左から順に: [St] [L] [R] [LR] [RL]

### 行5: Mental (P/N)
- **Mental**: PとNの間に5つの□枠が横一列: P [1] [2] [3] [4] [5] N
  - Pに印がある場合 → "P"、Nに印がある場合 → "N"、数字枠に印がある場合 → その数字

## 選択肢□枠の判定ルール（★重要★）

カードの選択肢は **□（四角い枠）** の中に印刷された文字で構成されている。
ユーザーは選択した枠に以下のいずれかの方法で印をつける:
- 枠の塗りつぶし（枠全体が黒くなる）
- 枠内に丸囲み・チェック・×印
- 枠を囲む丸や線

### 判定手順
1. 該当行の□枠を **左から右へ順番に** 確認する
2. 印がついている枠の **位置（何番目か）** で選択肢を特定する
3. 枠の位置と対応する選択肢の値は以下の通り:

**Putt**: 1番目=E, 2番目=Ba, 3番目=P, 4番目=Bo, 5番目=D+
**Missed Direction**: 1番目=1, 2番目=2, 3番目=3, 4番目=4, 5番目=5
**Touch**: 1番目=1, 2番目=2, 3番目=3, 4番目=4, 5番目=5
**Line (U/D)**: 1番目=F, 2番目=U, 3番目=D, 4番目=UD, 5番目=DU
**Line (L/R)**: 1番目=St, 2番目=L, 3番目=R, 4番目=LR, 5番目=RL

### ★枠内の文字を読もうとしないこと★
印がついて潰れた枠は文字が読めなくなる。文字を解読するのではなく、**枠の位置（左から何番目か）** で値を決定すること。これが最も正確な方法である。

## 手書き数字の読み取り

カード上の手書き数字は枠（□）内に1桁ずつ記入されている。各枠を個別に読み取ること。

### 読み取り対象の数字欄（すべて必ず確認すること）
- **Dist(prev)の□□□**: 3つの枠。数字が書かれた枠だけ読む（空枠は無視）。例: □1□5□ → 15
- **Lengthの□□□ st**: 3つの枠。歩数。例: □□1□2 → 12
- **Lengthの□□□ m**: 3つの枠。メートル。例: □□□8 → 8

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
- 枠の中に手書きの数字・チェック・塗りつぶしが **一切ない** 場合は **null** にすること
- 印刷された罫線・枠線・ラベル文字を手書きの記入と間違えないこと
- テンプレート（空白カード）と比較して、テンプレートにもある線や文字は印刷であり、記入ではない
- **迷ったらnullにする** — 存在しないデータを推測・捏造してはならない

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
        const templateUrl = TEMPLATE_IMAGE_URL;

        // ユーザーメッセージ: テンプレート参照画像（あれば）+ 記入済みカード
        const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }> = [
          {
            type: "text",
            text: templateUrl
              ? "1枚目は空白テンプレート（参照用）、2枚目が記入済みカードです。テンプレートと比較して、印がついている枠を特定してください。\n注意点:\n- Dist(prev)欄の手書き数字を必ず確認すること（枠内に数字があれば読み取る）\n- Length(st/m)欄の手書き数字も必ず確認すること\n- 選択肢は□枠の位置（左から何番目か）で判定すること。塗りつぶされた枠内の文字を読もうとしないこと"
              : "このスコアカード画像を読み取ってJSON形式で返してください。\n注意点:\n- Dist(prev)欄の手書き数字を必ず確認すること（枠内に数字があれば読み取る）\n- Length(st/m)欄の手書き数字も必ず確認すること\n- 選択肢は□枠の位置（左から何番目か）で判定すること。塗りつぶされた枠内の文字を読もうとしないこと",
          },
        ];
        // テンプレート参照画像を先に追加（比較の基準）
        if (templateUrl) {
          userContent.push({ type: "image_url", image_url: { url: templateUrl, detail: "high" } });
        }
        // 記入済みカード
        userContent.push({ type: "image_url", image_url: { url: dataUri, detail: "high" } });

        const response = await invokeLLM({
          messages: [
            { role: "system", content: OCR_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
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

    // 複数枚のスコアカードを一括解析（並列処理）
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
        const templateUrl = TEMPLATE_IMAGE_URL;
        const CONCURRENCY = 3; // Gemini API レート制限を考慮して同時3件

        // 1枚のカードを解析する関数
        async function analyzeOne(image: { url: string; key?: string }) {
          try {
            const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }> = [
              {
                type: "text",
                text: templateUrl
                  ? "1枚目は空白テンプレート（参照用）、2枚目が記入済みカードです。テンプレートと比較して、印がついている枠を特定してください。\n注意点:\n- Dist(prev)欄の手書き数字を必ず確認すること（枠内に数字があれば読み取る）\n- Length(st/m)欄の手書き数字も必ず確認すること\n- 選択肢は□枠の位置（左から何番目か）で判定すること。塗りつぶされた枠内の文字を読もうとしないこと"
                  : "このスコアカード画像を読み取ってJSON形式で返してください。\n注意点:\n- Dist(prev)欄の手書き数字を必ず確認すること（枠内に数字があれば読み取る）\n- Length(st/m)欄の手書き数字も必ず確認すること\n- 選択肢は□枠の位置（左から何番目か）で判定すること。塗りつぶされた枠内の文字を読もうとしないこと",
              },
            ];
            if (templateUrl) {
              userContent.push({ type: "image_url", image_url: { url: templateUrl, detail: "high" } });
            }
            userContent.push({ type: "image_url", image_url: { url: image.url, detail: "high" } });

            const response = await invokeLLM({
              messages: [
                { role: "system", content: OCR_SYSTEM_PROMPT },
                { role: "user", content: userContent },
              ],
              response_format: { type: "json_object" },
              thinkingBudget: 2048,
            });

            const rawContent = response.choices[0]?.message?.content;
            if (rawContent) {
              const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
              return { imageUrl: image.url, success: true as const, data: JSON.parse(contentStr) };
            }
            return { imageUrl: image.url, success: false as const, data: null };
          } catch (error) {
            return { imageUrl: image.url, success: false as const, data: null, error: String(error) };
          } finally {
            if (image.key) {
              await storageDelete(image.key);
            }
          }
        }

        // 並列実行（同時CONCURRENCY件ずつ）
        const results: Awaited<ReturnType<typeof analyzeOne>>[] = [];
        for (let i = 0; i < input.images.length; i += CONCURRENCY) {
          const chunk = input.images.slice(i, i + CONCURRENCY);
          const chunkResults = await Promise.all(chunk.map(analyzeOne));
          results.push(...chunkResults);
        }
        return { results };
      }),
  }),
});

export type AppRouter = typeof appRouter;
