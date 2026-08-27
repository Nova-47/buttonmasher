// Format gate for a buttonmasher report. Reads the report from stdin or a file.
//   claude -p "/buttonmasher demo/server.js" | node demo/check-report.js
// Exits 1 if the report drifts from the format SKILL.md demands.
const fs = require("node:fs");
const text = fs.readFileSync(process.argv[2] || 0, "utf8").trim();
const lines = text.split("\n");
const checks = [
  ["opens with BUTTONMASHER", /^BUTTONMASHER\s*$/.test(lines[0])],
  ["has at least one severity label", /^(BROKE|FRAGILE|ANNOYING|BORING)\b/m.test(text) || /Boring\. Good\./.test(text)],
  ["no markdown headers", !/^#{1,6}\s/m.test(text)],
  ["no emoji", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)],
  ["no preamble before first finding", !/^(Target|Summary|Overview|Happy path)/im.test(lines.slice(1, 4).join("\n"))],
  ["every BROKE has a Retest", (text.match(/^BROKE/gm) || []).length <= (text.match(/^Retest:/gm) || []).length],
  ["no closing recap paragraph", !/^(Recap|Summary|In summary|Overall|To summarize)[: ]/im.test(text)],
  ["ends on the boring line", /boring/i.test(lines.filter((l) => l.trim()).at(-1) || "")],
  ["catches the double charge (demo only)", !process.env.DEMO || /charg/i.test(text)],
];
let bad = 0;
for (const [name, ok] of checks) { console.error(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) bad++; }
process.exitCode = bad ? 1 : 0;
