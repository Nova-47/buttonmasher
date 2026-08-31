// Format gate for a buttonmasher report. Reads the report from stdin or a file.
//   claude -p "/buttonmasher demo/server.js" | node demo/check-report.js
// Exits 1 if the report drifts from the format SKILL.md demands.
const fs = require("node:fs");
const text = fs.readFileSync(process.argv[2] || 0, "utf8").trim();
const lines = text.split("\n");
// split the report into per-finding blocks, each starting at a severity label
const findings = () =>
  text.split(/^(?=(?:BROKE|FRAGILE|ANNOYING|BORING)\b)/m).filter((b) => /^(BROKE|FRAGILE|ANNOYING|BORING)\b/.test(b));
// the text of each Retest section (from "Retest:" to the next blank line)
const retests = () =>
  [...text.matchAll(/^Retest:\s*\n([\s\S]*?)(?:\n\s*\n|$)/gm)].map((m) => m[1]);
const checks = [
  ["opens with BUTTONMASHER", /^BUTTONMASHER\s*$/.test(lines[0])],
  ["has at least one severity label", /^(BROKE|FRAGILE|ANNOYING|BORING)\b/m.test(text) || /Boring\. Good\./.test(text)],
  ["no markdown headers", !/^#{1,6}\s/m.test(text)],
  ["no emoji", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)],
  ["no preamble before first finding", !/^(Target|Summary|Overview|Happy path)/im.test(lines.slice(1, 4).join("\n"))],
  ["every BROKE has a Retest", (text.match(/^BROKE/gm) || []).length <= (text.match(/^Retest:/gm) || []).length],
  ["no closing recap paragraph", !/^(Recap|Summary|In summary|Overall|To summarize)[: ]/im.test(text)],
  ["ends on the boring line", /boring/i.test(lines.filter((l) => l.trim()).at(-1) || "")],
  // every Retest section is tagged with the confidence axis, so severity never smuggles it in
  ["every Retest is tagged Reproduced or Traced", retests().every((r) => /\b(Reproduced|Traced)\b/.test(r))],
  // regression for the cal.com wobble: a money/duplicate/lost outcome must not be labeled below BROKE
  ["money or duplicate outcome is BROKE, not FRAGILE/ANNOYING", findings().every((f) => {
    const belowBroke = /^(FRAGILE|ANNOYING)\b/.test(f);
    const badOutcome = /\b(charged?|double[- ]?charge|duplicate|two (orders|bookings|charges|records|payments)|lost record|money)\b/i.test(f);
    return !(belowBroke && badOutcome);
  })],
  ["catches the double charge (demo only)", !process.env.DEMO || /charg/i.test(text)],
];
let bad = 0;
for (const [name, ok] of checks) { console.error(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) bad++; }
process.exitCode = bad ? 1 : 0;
