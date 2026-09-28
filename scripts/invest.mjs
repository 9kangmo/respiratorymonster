#!/usr/bin/env node
// CLI used by the Claude Code investment skills, so every number is computed in code.
//
//   node scripts/invest.mjs check <bundle.json>   validate a bundle exactly like the app will
//   node scripts/invest.mjs dcf <bundle.json>     reverse DCF + sensitivity + history checks for each valuation
//   node scripts/invest.mjs save <bundle.json>    validate, then copy into the inbox folder the app imports from
//
// Requires Node 22.18+ (runs the app's TypeScript modules directly).
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { applyBundle, extractBundleJson } from "../src/lib/invest/bundle.ts";
import { baseFcfCheck, cagr, findAnomalies, reverseDcf, sensitivity } from "../src/lib/invest/calc.ts";
import { emptyInvestDB } from "../src/lib/invest/types.ts";

const [cmd, file] = process.argv.slice(2);
if (!cmd || !file) {
  console.error("usage: node scripts/invest.mjs <check|dcf|save> <bundle.json>");
  process.exit(2);
}

const pct = (x) => `${(x * 100).toFixed(2)}%`;
const bundle = extractBundleJson(await readFile(file, "utf8"));
const db = emptyInvestDB();
const result = applyBundle(db, bundle, "claude-code");

if (cmd === "check" || cmd === "save") {
  const { warnings, ...counts } = result;
  console.log(JSON.stringify(counts));
  for (const w of warnings) console.log(`WARN ${w}`);
  if (cmd === "save") {
    const dir = path.resolve(process.env.INVEST_INBOX_DIR ?? "invest-inbox");
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, path.basename(file));
    if (path.resolve(file) !== target) await copyFile(file, target);
    console.log(`saved ${target}`);
  }
} else if (cmd === "dcf") {
  if (db.valuations.length === 0) console.log("no valid valuations in bundle");
  for (const v of db.valuations) {
    const i = v.inputs;
    const r = reverseDcf(i);
    console.log(`\n## ${v.ticker} (${i.currency}, 금액 백만 단위)`);
    console.log(`시가총액 ${(i.price * i.sharesOutstanding).toFixed(0)} · 순부채 ${i.netDebt} · 기업가치 ${(i.price * i.sharesOutstanding + i.netDebt).toFixed(0)}`);
    console.log(r.ok ? `요구 FCF 성장률: 연 ${pct(r.impliedGrowth)} (향후 ${i.years}년, WACC ${pct(i.wacc)}, 영구성장 ${pct(i.terminalGrowth)}), 영구가치 비중 ${pct(r.terminalShare)}` : `계산 불가: ${r.reason}`);
    for (const [label, h] of [["FCF", i.fcfHistory], ["매출", i.revenueHistory]]) {
      for (const span of [3, 5]) {
        const c = cagr(h, span);
        if (c) console.log(`과거 ${label} CAGR ${c.from}→${c.to}: ${pct(c.rate)}`);
      }
    }
    for (const a of findAnomalies(i.fcfHistory)) console.log(`이상치: ${a.year} FCF ${a.value} (직전 3년 평균 ${a.baseline.toFixed(0)} 대비 ${pct(a.deviation)})`);
    const b = baseFcfCheck(i);
    if (b) console.log(`기준 FCF가 최근 3년 평균 대비 ${pct(b.deviation)} 벗어남`);
    const t = sensitivity(i);
    console.log(`\n| WACC \\ 영구성장 | ${t.terminalGrowths.map(pct).join(" | ")} |`);
    console.log(`|---|${t.terminalGrowths.map(() => "---").join("|")}|`);
    t.waccs.forEach((w, k) => console.log(`| ${pct(w)} | ${t.rows[k].map((x) => (x === null ? "–" : pct(x))).join(" | ")} |`));
  }
  for (const w of result.warnings) console.log(`WARN ${w}`);
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}
