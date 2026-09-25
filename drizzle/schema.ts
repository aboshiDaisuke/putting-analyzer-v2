import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

export const rankingEnum = pgEnum("ranking", ["ace", "2nd", "3rd", "4th", "5th"]);

export const weatherEnum = pgEnum("weather", ["sunny", "cloudy", "rainy", "windy"]);

export const windSpeedEnum = pgEnum("windSpeed", ["calm", "light", "moderate", "strong"]);

export const roundTypeEnum = pgEnum("roundType", [
  "competition",
  "club_competition",
  "private",
  "practice",
]);

export const competitionFormatEnum = pgEnum("competitionFormat", ["stroke", "match"]);

export const grassTypeEnum = pgEnum("grassType", ["bent", "korai", "bermuda", "other"]);

export const greenConditionEnum = pgEnum("greenCondition", ["excellent", "good", "fair"]);

export const scoreResultEnum = pgEnum("scoreResult", [
  "eagle",
  "birdie",
  "par",
  "bogey",
  "double_bogey_plus",
]);

export const slopeUpDownEnum = pgEnum("slopeUpDown", [
  "flat",
  "uphill",
  "downhill",
  "up_down",
  "down_up",
]);

export const slopeLeftRightEnum = pgEnum("slopeLeftRight", [
  "straight",
  "left",
  "right",
  "left_right",
  "right_left",
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── User Profiles ────────────────────────────────────────────────────────────

export const userProfiles = pgTable("userProfiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  gender: genderEnum("gender").default("male"),
  birthDate: varchar("birthDate", { length: 10 }), // YYYY-MM-DD
  handicap: real("handicap").default(0),
  strideLength: real("strideLength").default(0.7), // メートル単位
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// ─── Putters ──────────────────────────────────────────────────────────────────

export const putters = pgTable("putters", {
  id: serial("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  brandName: varchar("brandName", { length: 128 }).notNull(),
  productName: varchar("productName", { length: 128 }).notNull(),
  length: real("length"), // インチ
  lieAngle: real("lieAngle"), // 度
  weight: real("weight"), // グラム
  gripName: varchar("gripName", { length: 128 }),
  startDate: varchar("startDate", { length: 10 }), // YYYY-MM-DD
  usageCount: integer("usageCount").default(0).notNull(),
  ranking: rankingEnum("ranking").default("ace"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Putter = typeof putters.$inferSelect;
export type InsertPutter = typeof putters.$inferInsert;

// ─── Courses ──────────────────────────────────────────────────────────────────

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 256 }).notNull(),
  location: varchar("location", { length: 256 }),
  greens: text("greens").array(), // ["A", "B"] など
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Course = typeof courses.$inferSelect;
export type InsertCourse = typeof courses.$inferInsert;

// ─── Rounds ───────────────────────────────────────────────────────────────────

export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  courseId: integer("courseId").references(() => courses.id, { onDelete: "set null" }),
  courseName: varchar("courseName", { length: 256 }).notNull(),
  frontNineGreen: varchar("frontNineGreen", { length: 32 }),
  backNineGreen: varchar("backNineGreen", { length: 32 }),
  weather: weatherEnum("weather"),
  temperature: real("temperature"),
  windSpeed: windSpeedEnum("windSpeed"),
  roundType: roundTypeEnum("roundType"),
  competitionFormat: competitionFormatEnum("competitionFormat"),
  grassType: grassTypeEnum("grassType"),
  stimpmeter: real("stimpmeter"),
  mowingHeight: real("mowingHeight"),
  compaction: real("compaction"),
  greenCondition: greenConditionEnum("greenCondition"),
  putterId: integer("putterId").references(() => putters.id, { onDelete: "set null" }),
  putterName: varchar("putterName", { length: 256 }),
  totalPutts: integer("totalPutts").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Round = typeof rounds.$inferSelect;
export type InsertRound = typeof rounds.$inferInsert;

// ─── Holes ────────────────────────────────────────────────────────────────────

export const holes = pgTable("holes", {
  id: serial("id").primaryKey(),
  roundId: integer("roundId")
    .notNull()
    .references(() => rounds.id, { onDelete: "cascade" }),
  holeNumber: integer("holeNumber").notNull(), // 1-18
  totalPutts: integer("totalPutts").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Hole = typeof holes.$inferSelect;
export type InsertHole = typeof holes.$inferInsert;

// ─── Putts ────────────────────────────────────────────────────────────────────

export const putts = pgTable("putts", {
  id: serial("id").primaryKey(),
  holeId: integer("holeId")
    .notNull()
    .references(() => holes.id, { onDelete: "cascade" }),
  strokeNumber: integer("strokeNumber").notNull(), // 1, 2, 3
  cupIn: boolean("cupIn").default(false).notNull(),
  distPrev: integer("distPrev"), // 前パットからの残り距離(yd)
  result: scoreResultEnum("result"),
  lengthSteps: integer("lengthSteps"), // 歩数
  lengthMeters: real("lengthMeters"), // メートル直入力
  distanceMeters: real("distanceMeters"), // 計算済み距離(m)
  missedDirection: integer("missedDirection"), // 1-5
  touch: integer("touch"), // 1-5
  lineUD: slopeUpDownEnum("lineUD"),
  lineLR: slopeLeftRightEnum("lineLR"),
  mental: varchar("mental", { length: 4 }), // "P", "1"-"5", "N"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Putt = typeof putts.$inferSelect;
export type InsertPutt = typeof putts.$inferInsert;
