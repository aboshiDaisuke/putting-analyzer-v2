import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { golfRouter } from "./golfRouter";

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
    // LLMを使ってスコアカード画像を解析する
    // base64を直接受け取りGeminiへ送る（Supabase経由不要 → ラウンドトリップ削減で高速化）
    // 認証必須: Gemini APIコストを伴うため未認証の呼び出しを禁止する
    analyzeScorecard: protectedProcedure
      .input(
        z.object({
          base64: z.string(),
          mimeType: z.string().default("image/jpeg"),
        })
      )
      .mutation(async ({ input }) => {
        const dataUri = `data:${input.mimeType};base64,${input.base64}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: OCR_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: OCR_USER_TEXT },
                // NOTE: detail パラメータはOpenAI互換用で、Gemini変換時には無視される
                { type: "image_url", image_url: { url: dataUri } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          thinkingBudget: 2048, // Gemini 2.5系に切り替えた場合のみ使用
          thinkingLevel: "high", // Gemini 3系: 視覚タスクのため high（思考トークンは出力単価に含まれ低コスト）
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
  }),
});

export type AppRouter = typeof appRouter;
