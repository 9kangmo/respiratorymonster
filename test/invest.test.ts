import { describe, expect, it } from "vitest";
import { applyBundle, checkReport, extractBundleJson, parseConstituents } from "@/lib/invest/bundle";
import { baseFcfCheck, cagr, millions, dcfValue, findAnomalies, hhi, portfolioMetrics, reverseDcf, sensitivity } from "@/lib/invest/calc";
import { actionSignals } from "@/lib/invest/signals";
import { emptyInvestDB, type Holding, type ValuationInputs } from "@/lib/invest/types";

const base: ValuationInputs = {
  currency: "USD",
  price: 0,
  sharesOutstanding: 1000,
  netDebt: 5000,
  baseFcf: 10000,
  fcfHistory: [],
  revenueHistory: [],
  wacc: 0.09,
  terminalGrowth: 0.025,
  years: 10,
  sources: {},
};

function holding(p: Partial<Holding> & Pick<Holding, "ticker">): Holding {
  return {
    id: p.ticker,
    name: p.ticker,
    assetType: "stock",
    currency: "KRW",
    quantity: 1,
    avgCost: 100,
    notes: "",
    createdAt: "",
    updatedAt: "",
    ...p,
  };
}

describe("reverse DCF", () => {
  it("recovers the growth rate that produced the price", () => {
    for (const g of [-0.05, 0, 0.08, 0.25]) {
      const ev = dcfValue(base.baseFcf, g, base.wacc, base.terminalGrowth, base.years);
      const price = (ev - base.netDebt) / base.sharesOutstanding;
      const r = reverseDcf({ ...base, price });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.impliedGrowth).toBeCloseTo(g, 6);
    }
  });

  it("matches a hand-checked DCF value", () => {
    // 1 year, no growth: 100/1.1 + (100*1.0/(0.1-0))/1.1 = 90.909 + 909.09
    expect(dcfValue(100, 0, 0.1, 0, 1)).toBeCloseTo(1000, 6);
  });

  it("refuses unsolvable inputs instead of inventing a number", () => {
    expect(reverseDcf({ ...base, price: 50, baseFcf: -100 }).ok).toBe(false);
    expect(reverseDcf({ ...base, price: 50, wacc: 0.02, terminalGrowth: 0.03 }).ok).toBe(false);
    expect(reverseDcf({ ...base, price: 0 }).ok).toBe(false);
  });

  it("requires more growth when the discount rate is higher", () => {
    const price = (dcfValue(base.baseFcf, 0.06, base.wacc, base.terminalGrowth, base.years) - base.netDebt) / base.sharesOutstanding;
    const t = sensitivity({ ...base, price });
    expect(t.waccs).toEqual([0.07, 0.08, 0.09, 0.1, 0.11]);
    const mid = t.rows.map((row) => row[1]!);
    expect(mid[2]).toBeCloseTo(0.06, 5);
    for (let k = 1; k < mid.length; k++) expect(mid[k]).toBeGreaterThan(mid[k - 1]);
  });
});

describe("history checks", () => {
  const fcf = [
    { year: 2020, value: 100 },
    { year: 2021, value: 110 },
    { year: 2022, value: 121 },
    { year: 2023, value: 133.1 },
    { year: 2024, value: 250 },
  ];

  it("computes CAGR over the latest span", () => {
    expect(cagr(fcf.slice(0, 4))!.rate).toBeCloseTo(0.1, 6);
    expect(cagr(fcf, 2)).toMatchObject({ from: 2022, to: 2024 });
    expect(cagr([{ year: 2020, value: -5 }, { year: 2024, value: 10 }])).toBeNull();
  });

  it("flags years more than 40% off the prior three-year average", () => {
    const a = findAnomalies(fcf);
    expect(a.map((x) => x.year)).toEqual([2024]);
    expect(a[0].deviation).toBeCloseTo(250 / 121.366666 - 1, 4);
    expect(baseFcfCheck({ baseFcf: 300, fcfHistory: fcf })).not.toBeNull();
    expect(baseFcfCheck({ baseFcf: 170, fcfHistory: fcf })).toBeNull();
  });
});

describe("portfolio metrics", () => {
  it("computes weights, HHI and FX exposure in KRW", () => {
    const m = portfolioMetrics(
      [
        holding({ ticker: "005930", quantity: 10, avgCost: 50_000 }),
        holding({ ticker: "AAPL", currency: "USD", quantity: 5, avgCost: 100, avgFx: 1200 }),
      ],
      {
        "005930": { ticker: "005930", price: 60_000, currency: "KRW", asOf: "2026-09-28", source: "x" },
        AAPL: { ticker: "AAPL", price: 120, currency: "USD", asOf: "2026-09-28", source: "x" },
      },
      { rate: 1000, asOf: "2026-09-28", source: "x" },
    );
    // 600,000 KRW + 5*120*1000 = 600,000 KRW
    expect(m.totalKrw).toBe(1_200_000);
    expect(m.positions.map((p) => p.weight)).toEqual([0.5, 0.5]);
    expect(m.hhi).toBeCloseTo(5000);
    expect(m.effectiveN).toBeCloseTo(2);
    expect(m.fxExposure).toBeCloseTo(0.5);
    expect(m.fxShock10Krw).toBeCloseTo(60_000);
    const aapl = m.positions.find((p) => p.holding.ticker === "AAPL")!;
    expect(aapl.costKrw).toBe(600_000); // bought at 1200 KRW/USD
    expect(aapl.returnPct).toBeCloseTo(0);
    expect(aapl.localReturnPct).toBeCloseTo(0.2);
    expect(aapl.fxReturnPct).toBeCloseTo(-1 / 6);
  });

  it("finds exposure hidden inside ETFs", () => {
    const m = portfolioMetrics(
      [
        holding({ ticker: "NVDA", quantity: 1, avgCost: 300 }),
        holding({ ticker: "QQQ", assetType: "index_etf", quantity: 1, avgCost: 700, constituents: [{ ticker: "NVDA", weightPct: 10 }, { ticker: "MSFT", weightPct: 8 }] }),
      ],
      {},
    );
    const nvda = m.exposures.find((e) => e.ticker === "NVDA")!;
    expect(nvda.direct).toBeCloseTo(0.3);
    expect(nvda.viaEtf).toBeCloseTo(0.07);
    expect(m.hiddenOverlap.map((e) => e.ticker)).toEqual(["NVDA"]);
    expect(m.exposures.find((e) => e.ticker === "QQQ")!.direct).toBeCloseTo(0.7 * 0.82);
    expect(m.unpriced).toEqual(["QQQ", "NVDA"]);
  });

  it("formats negative amounts with the sign first", () => {
    expect(millions(-45000, "USD")).toBe("-$45.0B");
    expect(millions(-500, "USD")).toBe("-$500M");
  });

  it("reports missing FX instead of silently pricing dollars", () => {
    const m = portfolioMetrics([holding({ ticker: "AAPL", currency: "USD" })], {});
    expect(m.missingFx).toBe(true);
    expect(hhi([1])).toBe(10000);
  });
});

describe("bundle import", () => {
  it("keeps only numbers that carry a source", () => {
    const db = emptyInvestDB();
    const r = applyBundle(db, {
      format: "rm-invest-bundle/1",
      quotes: [
        { ticker: "aapl", price: 230, changePct: -1.2, currency: "USD", source: "https://example.com/aapl" },
        { ticker: "MSFT", price: 400, currency: "USD" },
        { ticker: "TSLA", price: 250, currency: "USD", source: "확인 필요" },
      ],
      fx: { rate: 1385, source: "https://example.com/fx" },
      macro: [{ name: "미 10년물", value: "4.1%", source: "https://example.com/ust" }, { name: "유가", value: "80" }],
      news: [
        { ticker: "AAPL", title: "no url fact", kind: "fact" },
        { ticker: "AAPL", title: "with url", url: "https://example.com/n", kind: "fact" },
      ],
    }, "claude-code");
    expect(Object.keys(db.quotes)).toEqual(["AAPL"]);
    expect(db.quotes.AAPL.changePct).toBe(-1.2);
    expect(db.fx?.rate).toBe(1385);
    expect(db.macro.map((m) => m.name)).toEqual(["미 10년물"]);
    expect(db.news.map((n) => n.title)).toEqual(["with url"]);
    expect(r.warnings.length).toBeGreaterThanOrEqual(4);
    expect(db.lastRefreshAt).toBeDefined();
  });

  it("flags trading language and guessed page numbers in reports", () => {
    expect(checkReport("[해석] 지금 매수 추천합니다", [{ label: "x", url: "https://a" }])).toHaveLength(1);
    expect(checkReport("You should buy now", [{ label: "x" }]).length).toBe(1);
    expect(checkReport("[사실] 매출이 늘었다", [])).toHaveLength(1);
    expect(checkReport("정상", [{ label: "web", url: "https://a", page: 3 }])).toHaveLength(1);
    expect(checkReport("[해석] 매수 추천은 하지 않음. 비중 확대 권고 없음", [{ label: "x" }])).toHaveLength(0);
    expect(checkReport("매수 추천합니다. 없는 게 없다", [{ label: "x" }])).toHaveLength(1);
    expect(checkReport("[사실] 매출 증가. 매수·매도 판단은 하지 않는다.", [{ label: "10-K", page: 45 }])).toHaveLength(0);
  });

  it("stores valuations with rates normalised and merges earnings dates per quarter", () => {
    const db = emptyInvestDB();
    applyBundle(db, {
      valuations: [{ ticker: "AAPL", currency: "USD", price: 230, sharesOutstanding: 15000, baseFcf: 100000, wacc: 9, terminalGrowth: 0.025, sources: { price: "https://a" } }],
      events: [{ ticker: "AAPL", date: "2026-10-29", type: "earnings", title: "Q4" }],
    }, "api");
    applyBundle(db, { events: [{ ticker: "AAPL", date: "2026-10-30", type: "earnings", title: "Q4 (확정)" }] }, "api");
    expect(db.valuations[0].inputs.wacc).toBeCloseTo(0.09);
    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({ date: "2026-10-30", title: "Q4 (확정)" });
  });

  it("extracts the last json block from a full response", () => {
    const raw = "분석...\n```json\n{\"a\":1}\n```\n더...\n```json\n{\"format\":\"rm-invest-bundle/1\"}\n```";
    expect(extractBundleJson(raw)).toEqual({ format: "rm-invest-bundle/1" });
    expect(() => extractBundleJson("no json here")).toThrow();
  });

  it("parses ETF constituents", () => {
    expect(parseConstituents("nvda 7.2\nAAPL: 6.8%\nbad\nMSFT 0")).toEqual([
      { ticker: "NVDA", weightPct: 7.2 },
      { ticker: "AAPL", weightPct: 6.8 },
    ]);
  });
});

describe("action signals", () => {
  it("points to the skill to run, never to a trade", () => {
    const db = emptyInvestDB();
    db.holdings = [holding({ ticker: "AAPL", currency: "USD" })];
    db.fx = { rate: 1400, changePct: 1.5, asOf: "2026-09-28", source: "x" };
    db.quotes.AAPL = { ticker: "AAPL", price: 200, changePct: -6.1, currency: "USD", asOf: "2026-09-28", source: "x" };
    db.events = [{ id: "e", ticker: "AAPL", date: "2026-09-30", type: "earnings", title: "Q4" }];
    const signals = actionSignals(db, portfolioMetrics(db.holdings, db.quotes, db.fx), "2026-09-28");
    const keys = signals.map((s) => `${s.key}:${s.skill}`);
    expect(keys).toContain("earn:AAPL:2026-09-30:story");
    expect(keys).toContain("move:AAPL:price");
    expect(keys).toContain("decoder:AAPL:decoder");
    expect(keys).toContain("fx:cockpit");
    expect(signals[0].level).toBe("high");
    expect(signals.every((s) => !/매수|매도|사라|팔아/.test(s.title + s.reason))).toBe(true);
  });
});
