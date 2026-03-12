ALTER TABLE "putts" RENAME COLUMN "lengthYards" TO "lengthMeters";--> statement-breakpoint
ALTER TABLE "putts" ALTER COLUMN "lengthMeters" TYPE real;
