// 手書き風に記入したカードを CSS の 3D 変形で「斜めから撮った写真」風にスクリーンショットし、
// テスト用フィクスチャ（PNG + 正解 JSON）を生成する。
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const HTML = path.resolve(__dirname, "../../scorecard-v2.html");
const OUT_DIR = process.argv[2] || path.resolve(__dirname, "../../tests/fixtures");

// 正解データ。section: 0=1st,1=2nd,2=3rd。index は枠の左からの位置
const CASES = [
  {
    name: "scorecard-photo-1",
    transform: "perspective(1400px) rotateX(9deg) rotateY(-7deg) rotateZ(2deg)",
    truth: {
      hole: "07", date: "20260916", course: "Fable GC",
      sections: [
        { cupIn: false, result: 2, length: "12", lineUD: 1, lineLR: 0, styles: { result: "check", lineUD: "fill", lineLR: "circle" } },
        { cupIn: true, result: null, length: "3", lineUD: 2, lineLR: 2, styles: { lineUD: "check", lineLR: "check" } },
        { cupIn: false, result: null, length: null, lineUD: null, lineLR: null },
      ],
    },
  },
  {
    name: "scorecard-photo-2",
    transform: "perspective(1200px) rotateX(-6deg) rotateY(10deg) rotateZ(-3deg) scale(0.92)",
    truth: {
      hole: "14", date: "20260901", course: "Test CC",
      sections: [
        { cupIn: true, result: 1, length: "5", lineUD: 0, lineLR: 1, styles: { result: "fill", lineUD: "check", lineLR: "fill" } },
        { cupIn: false, result: null, length: null, lineUD: null, lineLR: null },
        { cupIn: false, result: null, length: null, lineUD: null, lineLR: null },
      ],
    },
  },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const c of CASES) {
    const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 1 });
    await page.goto("file://" + HTML, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.evaluate(({ truth, transform }) => {
      const card = document.getElementById("scorecard");
      const mark = (el, style) => {
        el.style.position = "relative";
        const m = document.createElement("div");
        m.style.position = "absolute";
        m.style.color = "#1a1a4a";
        m.style.fontFamily = "'Bradley Hand', 'Comic Sans MS', cursive";
        if (style === "fill") {
          m.style.inset = "3px"; m.style.background = "#1a1a4a"; m.style.borderRadius = "3px";
        } else if (style === "circle") {
          m.style.inset = "-4px"; m.style.border = "2.5px solid #1a1a4a"; m.style.borderRadius = "50%";
        } else {
          m.style.inset = "0"; m.style.fontSize = "26px"; m.style.lineHeight = "26px"; m.style.textAlign = "center"; m.style.fontWeight = "bold";
          m.textContent = "✓";
        }
        el.appendChild(m);
      };
      const write = (el, ch) => {
        el.style.position = "relative";
        const t = document.createElement("div");
        t.style.position = "absolute"; t.style.inset = "0"; t.style.textAlign = "center";
        t.style.fontFamily = "'Bradley Hand', 'Comic Sans MS', cursive"; t.style.fontWeight = "bold";
        t.style.fontSize = (el.offsetHeight * 0.85) + "px"; t.style.lineHeight = el.offsetHeight + "px"; t.style.color = "#1a1a4a";
        t.textContent = ch; el.appendChild(t);
      };
      // header
      const header = card.querySelector(":scope > div.flex.justify-between");
      const sm = Array.from(header.querySelectorAll(".box-sm, .box-sm-right"));
      truth.hole.split("").forEach((ch, i) => write(sm[i], ch));
      truth.date.split("").forEach((ch, i) => write(sm[2 + i], ch));
      const course = header.querySelector(".border-b.border-black");
      course.style.position = "relative";
      const ct = document.createElement("div");
      ct.style.position = "absolute"; ct.style.inset = "0"; ct.style.fontSize = "9px"; ct.style.fontFamily = "'Bradley Hand', cursive"; ct.style.color = "#1a1a4a";
      ct.textContent = truth.course; course.appendChild(ct);
      // sections
      const secs = Array.from(card.querySelectorAll(":scope > div.border.border-black"));
      truth.sections.forEach((s, si) => {
        const sec = secs[si];
        const boxes = Array.from(sec.querySelectorAll(".box, .box-right"));
        const styles = s.styles || {};
        if (s.cupIn) mark(sec.querySelector(".box-check"), "check");
        if (s.result !== null) mark(boxes[s.result], styles.result || "check");
        if (s.length) {
          const digits = s.length.padStart(2, " ");
          if (digits[0] !== " ") write(boxes[5], digits[0]);
          write(boxes[6], digits[1]);
        }
        if (s.lineUD !== null) mark(boxes[7 + s.lineUD], styles.lineUD || "check");
        if (s.lineLR !== null) mark(boxes[10 + s.lineLR], styles.lineLR || "check");
      });
      // 「写真」風: 背景を机っぽい色にし、カードを 3D 変形
      document.querySelectorAll(".no-print").forEach((n) => n.remove());
      const wrapper = document.getElementById("pdf-wrapper");
      wrapper.style.background = "#8a7b6a"; wrapper.style.boxShadow = "none";
      wrapper.style.width = "800px"; wrapper.style.height = "1200px"; wrapper.style.minHeight = "0";
      document.body.style.background = "#8a7b6a"; document.body.style.padding = "0"; document.body.style.margin = "0";
      card.style.border = "none"; card.style.boxShadow = "0 6px 18px rgba(0,0,0,0.45)";
      card.style.transform = transform; card.style.transformOrigin = "center center";
      card.querySelector(".absolute.-top-2\\.5")?.remove();
    }, c);
    await page.waitForTimeout(300);
    const wrapper = await page.$("#pdf-wrapper");
    const png = path.join(OUT_DIR, c.name + ".png");
    await wrapper.screenshot({ path: png, type: "png" });
    fs.writeFileSync(path.join(OUT_DIR, c.name + ".json"), JSON.stringify(c.truth, null, 2));
    console.log("wrote", png, fs.statSync(png).size, "bytes");
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
