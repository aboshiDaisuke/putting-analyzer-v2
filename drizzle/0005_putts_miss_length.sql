CREATE TYPE "public"."missLength" AS ENUM('short', 'long');--> statement-breakpoint
ALTER TABLE "putts" ADD COLUMN "missLength" "missLength";