import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { golfRouter } from "./golfRouter";
import { analyzeCard } from "./card-ocr";

export const appRouter = router({
  // 認証は Supabase Auth をクライアントが直接使う（ログイン/ログアウト/セッション）。
  // サーバーは Authorization: Bearer <access token> を検証するだけで、
  // 独自の auth エンドポイントは持たない。
  golf: golfRouter,

  ocr: router({
    /**
     * パッティングカード v3 の1面（OUT または IN）を読み取る。
     * 認証必須: Gemini API のコストを伴うため未認証の呼び出しを禁止する。
     * 前処理（向き・台形補正・画素判定）はサーバーで行うので、端末は JPEG を送るだけでよい。
     */
    analyzeCard: protectedProcedure
      .input(
        z.object({
          base64: z.string().min(1),
          mimeType: z.string().default("image/jpeg"),
          sideHint: z.enum(["out", "in"]).optional(),
        }),
      )
      .mutation(({ input }) => analyzeCard(input)),
  }),
});

export type AppRouter = typeof appRouter;
