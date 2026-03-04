CREATE TYPE "public"."competitionFormat" AS ENUM('stroke', 'match');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."grassType" AS ENUM('bent', 'korai', 'bermuda', 'other');--> statement-breakpoint
CREATE TYPE "public"."greenCondition" AS ENUM('excellent', 'good', 'fair');--> statement-breakpoint
CREATE TYPE "public"."ranking" AS ENUM('ace', '2nd', '3rd', '4th', '5th');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."roundType" AS ENUM('competition', 'club_competition', 'private', 'practice');--> statement-breakpoint
CREATE TYPE "public"."scoreResult" AS ENUM('eagle', 'birdie', 'par', 'bogey', 'double_bogey_plus');--> statement-breakpoint
CREATE TYPE "public"."slopeLeftRight" AS ENUM('straight', 'left', 'right', 'left_right', 'right_left');--> statement-breakpoint
CREATE TYPE "public"."slopeUpDown" AS ENUM('flat', 'uphill', 'downhill', 'up_down', 'down_up');--> statement-breakpoint
CREATE TYPE "public"."weather" AS ENUM('sunny', 'cloudy', 'rainy', 'windy');--> statement-breakpoint
CREATE TYPE "public"."windSpeed" AS ENUM('calm', 'light', 'moderate', 'strong');--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"location" varchar(256),
	"greens" text[],
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holes" (
	"id" serial PRIMARY KEY NOT NULL,
	"roundId" integer NOT NULL,
	"holeNumber" integer NOT NULL,
	"totalPutts" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "putters" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"brandName" varchar(128) NOT NULL,
	"productName" varchar(128) NOT NULL,
	"length" real,
	"lieAngle" real,
	"weight" real,
	"gripName" varchar(128),
	"startDate" varchar(10),
	"usageCount" integer DEFAULT 0 NOT NULL,
	"ranking" "ranking" DEFAULT 'ace',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "putts" (
	"id" serial PRIMARY KEY NOT NULL,
	"holeId" integer NOT NULL,
	"strokeNumber" integer NOT NULL,
	"cupIn" boolean DEFAULT false NOT NULL,
	"distPrev" integer,
	"result" "scoreResult",
	"lengthSteps" integer,
	"lengthYards" integer,
	"distanceMeters" real,
	"missedDirection" integer,
	"touch" integer,
	"lineUD" "slopeUpDown",
	"lineLR" "slopeLeftRight",
	"mental" varchar(4),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"date" varchar(10) NOT NULL,
	"courseId" integer,
	"courseName" varchar(256) NOT NULL,
	"frontNineGreen" varchar(32),
	"backNineGreen" varchar(32),
	"weather" "weather",
	"temperature" real,
	"windSpeed" "windSpeed",
	"roundType" "roundType",
	"competitionFormat" "competitionFormat",
	"grassType" "grassType",
	"stimpmeter" real,
	"mowingHeight" real,
	"compaction" real,
	"greenCondition" "greenCondition",
	"putterId" integer,
	"putterName" varchar(256),
	"totalPutts" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userProfiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"gender" "gender" DEFAULT 'male',
	"birthDate" varchar(10),
	"handicap" real DEFAULT 0,
	"strideLength" real DEFAULT 0.7,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "userProfiles_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holes" ADD CONSTRAINT "holes_roundId_rounds_id_fk" FOREIGN KEY ("roundId") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "putters" ADD CONSTRAINT "putters_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "putts" ADD CONSTRAINT "putts_holeId_holes_id_fk" FOREIGN KEY ("holeId") REFERENCES "public"."holes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_putterId_putters_id_fk" FOREIGN KEY ("putterId") REFERENCES "public"."putters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userProfiles" ADD CONSTRAINT "userProfiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;