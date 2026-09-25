/**
 * ダミーデータ投入スクリプト
 * 実行: npx tsx scripts/seed-dummy.ts
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. e.g.: DATABASE_URL='postgresql://...' npx tsx scripts/seed-dummy.ts");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  console.log("🌱 ダミーデータ投入開始...");

  // ─── 既存ユーザー確認 ─────────────────────────────────
  const existingUsers = await sql`SELECT id, "openId", email FROM users LIMIT 5`;
  console.log("既存ユーザー:", existingUsers);

  if (existingUsers.length === 0) {
    console.error("❌ ユーザーが見つかりません。先にログインしてください。");
    await sql.end();
    return;
  }

  const userId = existingUsers[0].id;
  console.log(`✅ ユーザーID: ${userId} にデータを投入します`);

  // ─── ユーザープロフィール ─────────────────────────────
  await sql`
    INSERT INTO "userProfiles" ("userId", gender, handicap, "strideLength")
    VALUES (${userId}, 'male', 12.5, 0.72)
    ON CONFLICT ("userId") DO UPDATE SET
      handicap = 12.5,
      "strideLength" = 0.72
  `;
  console.log("✅ プロフィール登録");

  // ─── パター ───────────────────────────────────────────
  const [putter1] = await sql`
    INSERT INTO putters ("userId", "brandName", "productName", length, weight, ranking, "startDate")
    VALUES (${userId}, 'Scotty Cameron', 'Phantom X 5', 34.5, 340, 'ace', '2024-04-01')
    RETURNING id
  `;
  const [putter2] = await sql`
    INSERT INTO putters ("userId", "brandName", "productName", length, weight, ranking, "startDate")
    VALUES (${userId}, 'PING', 'PLD Anser', 35.0, 355, '2nd', '2023-10-01')
    RETURNING id
  `;
  console.log("✅ パター2本登録");

  // ─── コース ───────────────────────────────────────────
  const [course1] = await sql`
    INSERT INTO courses ("userId", name, location, greens)
    VALUES (${userId}, '東京ゴルフ倶楽部', '千葉県', ARRAY['A', 'B'])
    RETURNING id
  `;
  const [course2] = await sql`
    INSERT INTO courses ("userId", name, location, greens)
    VALUES (${userId}, '霞ヶ関カンツリー倶楽部', '埼玉県', ARRAY['A', 'B', 'C'])
    RETURNING id
  `;
  console.log("✅ コース2件登録");

  // ─── ラウンド＋ホール＋パットデータ ──────────────────
  const rounds = [
    {
      date: "2026-03-01",
      courseName: "東京ゴルフ倶楽部",
      courseId: course1.id,
      putterId: putter1.id,
      putterName: "Scotty Cameron Phantom X 5",
      grassType: "bent",
      stimpmeter: 10.5,
      greenCondition: "excellent",
      weather: "sunny",
      temperature: 18,
      windSpeed: "calm",
      roundType: "private",
    },
    {
      date: "2026-02-15",
      courseName: "霞ヶ関カンツリー倶楽部",
      courseId: course2.id,
      putterId: putter1.id,
      putterName: "Scotty Cameron Phantom X 5",
      grassType: "bent",
      stimpmeter: 11.0,
      greenCondition: "good",
      weather: "cloudy",
      temperature: 14,
      windSpeed: "light",
      roundType: "competition",
    },
    {
      date: "2026-02-01",
      courseName: "東京ゴルフ倶楽部",
      courseId: course1.id,
      putterId: putter2.id,
      putterName: "PING PLD Anser",
      grassType: "bent",
      stimpmeter: 9.5,
      greenCondition: "good",
      weather: "sunny",
      temperature: 16,
      windSpeed: "calm",
      roundType: "private",
    },
  ];

  for (const round of rounds) {
    // ホールデータ（18ホール分）を生成
    const holeData = generateHoleData();
    const totalPutts = holeData.reduce((sum, h) => sum + h.putts.length, 0);

    const [newRound] = await sql`
      INSERT INTO rounds (
        "userId", date, "courseId", "courseName", "putterId", "putterName",
        "grassType", stimpmeter, "greenCondition", weather, temperature,
        "windSpeed", "roundType", "totalPutts"
      ) VALUES (
        ${userId}, ${round.date}, ${round.courseId}, ${round.courseName},
        ${round.putterId}, ${round.putterName}, ${round.grassType},
        ${round.stimpmeter}, ${round.greenCondition}, ${round.weather},
        ${round.temperature}, ${round.windSpeed}, ${round.roundType}, ${totalPutts}
      ) RETURNING id
    `;

    for (const hole of holeData) {
      const [newHole] = await sql`
        INSERT INTO holes ("roundId", "holeNumber", "totalPutts")
        VALUES (${newRound.id}, ${hole.holeNumber}, ${hole.putts.length})
        RETURNING id
      `;

      for (const putt of hole.putts) {
        await sql`
          INSERT INTO putts (
            "holeId", "strokeNumber", "cupIn", "distanceMeters",
            "lineUD", "lineLR", "touch", result
          ) VALUES (
            ${newHole.id}, ${putt.strokeNumber}, ${putt.cupIn},
            ${putt.distanceMeters}, ${putt.lineUD}, ${putt.lineLR},
            ${putt.touch}, ${putt.result}
          )
        `;
      }
    }
    console.log(`✅ ラウンド登録: ${round.date} ${round.courseName} (${totalPutts}パット)`);
  }

  console.log("\n🎉 ダミーデータ投入完了！");
  await sql.end();
}

// 18ホール分のリアルなパットデータを生成
function generateHoleData() {
  const lineUDs = ["flat", "uphill", "downhill", "up_down", "down_up"] as const;
  const lineLRs = ["straight", "left", "right", "left_right", "right_left"] as const;
  const results = ["birdie", "par", "par", "bogey", "par"] as const;

  return Array.from({ length: 18 }, (_, i) => {
    const holeNumber = i + 1;
    const rand = Math.random();
    const isOnePutt = rand < 0.25;
    const isThreePutt = rand > 0.80;
    const puttCount = isOnePutt ? 1 : isThreePutt ? 3 : 2;

    const putts = [];
    let dist = Math.round(3 + Math.random() * 9); // 3〜12m

    for (let s = 1; s <= puttCount; s++) {
      const isLast = s === puttCount;
      putts.push({
        strokeNumber: s,
        cupIn: isLast,
        distanceMeters: s === 1 ? dist : s === 2 ? 0.6 + Math.random() * 1.5 : 0.3,
        lineUD: lineUDs[Math.floor(Math.random() * lineUDs.length)],
        lineLR: lineLRs[Math.floor(Math.random() * lineLRs.length)],
        touch: Math.floor(2 + Math.random() * 3), // 2〜4
        result: results[Math.floor(Math.random() * results.length)],
      });
    }

    return { holeNumber, putts };
  });
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
