-- 同一ラウンド・同一ホール番号の重複行があるとユニークインデックスを作れないため、
-- 先に「最新（id が最大）の行」だけを残して重複を削除する（putts は FK cascade で消える）。
DELETE FROM "holes" h
USING "holes" newer
WHERE h."roundId" = newer."roundId"
  AND h."holeNumber" = newer."holeNumber"
  AND h."id" < newer."id";--> statement-breakpoint
CREATE INDEX "courses_userId_idx" ON "courses" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "holes_roundId_holeNumber_unique" ON "holes" USING btree ("roundId","holeNumber");--> statement-breakpoint
CREATE INDEX "putters_userId_idx" ON "putters" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "putts_holeId_idx" ON "putts" USING btree ("holeId");--> statement-breakpoint
CREATE INDEX "rounds_userId_idx" ON "rounds" USING btree ("userId");