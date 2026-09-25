import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/market/briefing";
import { changeLabel } from "@/lib/market/indicators";
import { decodeEntities, dedupeNews, googleNewsUrl, parseRss } from "@/lib/market/news";
import { normalizeSymbol, position } from "@/lib/market/portfolio";
import { parseEcosSeries, parseFredCsv, parseYahooChart, pickKeyStat } from "@/lib/market/quotes";
import type { Holding } from "@/lib/types";

const DAY = 86_400;
// 2026-09-22..25 09:00 KST (00:00 UTC), gmtoffset +9h
const T0 = Date.UTC(2026, 8, 22) / 1000;

function chart(closes: (number | null)[], price: number, time: number) {
  return {
    chart: {
      result: [
        {
          meta: { symbol: "005930.KS", currency: "KRW", regularMarketPrice: price, regularMarketTime: time, gmtoffset: 32400 },
          timestamp: closes.map((_, i) => T0 + i * DAY),
          indicators: { quote: [{ close: closes }] },
        },
      ],
      error: null,
    },
  };
}

describe("yahoo chart", () => {
  it("uses the candle before today's as previous close during a session", () => {
    const q = parseYahooChart(chart([100, 101, null, 103, 104.5], 105, T0 + 4 * DAY + 3600));
    expect(q.price).toBe(105);
    expect(q.prevClose).toBe(103);
    expect(q.history).toEqual([100, 101, 103, 105]);
    expect(q.currency).toBe("KRW");
  });

  it("uses the last candle as previous close before today's candle exists", () => {
    const q = parseYahooChart(chart([100, 101], 102, T0 + 2 * DAY + 60));
    expect(q.prevClose).toBe(101);
    expect(q.history).toEqual([100, 101, 102]);
  });

  it("reports Yahoo errors", () => {
    expect(() => parseYahooChart({ chart: { result: null, error: { description: "No data found" } } })).toThrow("No data found");
  });
});

describe("rates", () => {
  it("reads FRED csv and finds the previous distinct rate", () => {
    const csv = "observation_date,DFEDTARU\n2025-12-09,4.00\n2025-12-10,3.75\n2025-12-11,.\n2026-09-24,3.75\n";
    expect(parseFredCsv(csv)).toEqual({ date: "2026-09-24", value: 3.75, prev: { date: "2025-12-09", value: 4 } });
  });

  it("reads ECOS key statistics and series", () => {
    const keyStats = {
      KeyStatisticList: {
        row: [
          { CLASS_NAME: "시장금리", KEYSTAT_NAME: "한국은행 기준금리", DATA_VALUE: "2.5", CYCLE: "20260925", UNIT_NAME: "%" },
          { CLASS_NAME: "시장금리", KEYSTAT_NAME: "국고채수익률(3년)", DATA_VALUE: "2.4", CYCLE: "20260924" },
        ],
      },
    };
    expect(pickKeyStat(keyStats, /기준금리/)).toEqual({ value: 2.5, date: "2026-09-25" });
    expect(pickKeyStat(keyStats, /국고채.*10년/)).toBeUndefined();

    const series = { StatisticSearch: { row: [{ TIME: "20260923", DATA_VALUE: "2.91" }, { TIME: "20260924", DATA_VALUE: "2.87" }] } };
    expect(parseEcosSeries(series)).toEqual({ date: "2026-09-24", value: 2.87, prev: { date: "2026-09-23", value: 2.91 } });
    expect(parseEcosSeries({ RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } })).toBeUndefined();
    expect(() => parseEcosSeries({ RESULT: { CODE: "INFO-100", MESSAGE: "인증키가 유효하지 않습니다." } })).toThrow("인증키");
  });

  it("labels changes in bp for rates and % otherwise", () => {
    expect(changeLabel({ value: 4.12, prev: 4.25, changeIn: "bp" })).toEqual({ text: "−13bp", dir: -1 });
    expect(changeLabel({ value: 1400, prev: 1386, changeIn: "pct" })).toEqual({ text: "+1.01%", dir: 1 });
    expect(changeLabel({ value: 1400, changeIn: "pct" })).toBeUndefined();
  });
});

describe("news", () => {
  const rss = `<?xml version="1.0"?><rss><channel><title>feed</title>
    <item><title>삼성전자, HBM4 공급 확대 - 한국경제</title><link>https://news.google.com/a</link>
      <pubDate>Thu, 24 Sep 2026 23:10:00 GMT</pubDate><source url="https://hankyung.com">한국경제</source></item>
    <item><title><![CDATA[삼성전자 &quot;HBM4&quot; 공급 확대 - 매일경제]]></title><link>https://news.google.com/b</link>
      <pubDate>Thu, 24 Sep 2026 22:00:00 GMT</pubDate><source url="https://mk.co.kr">매일경제</source></item>
    <item><title>코스피 3,000 &amp; 외국인 순매수</title><link>https://news.google.com/c</link><pubDate>bad</pubDate></item>
  </channel></rss>`;

  it("parses Google News RSS and strips the outlet suffix", () => {
    const items = parseRss(rss);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ title: "삼성전자, HBM4 공급 확대", link: "https://news.google.com/a", source: "한국경제", publishedAt: "2026-09-24T23:10:00.000Z" });
    expect(items[1].title).toBe('삼성전자 "HBM4" 공급 확대');
    expect(items[2]).toMatchObject({ title: "코스피 3,000 & 외국인 순매수", publishedAt: undefined });
  });

  it("drops the same story from other outlets", () => {
    const items = dedupeNews(parseRss(rss));
    expect(items.map((i) => i.link)).toEqual(["https://news.google.com/a", "https://news.google.com/c"]);
  });

  it("decodes numeric entities and builds search urls", () => {
    expect(decodeEntities("&#39;A&#x27; &lt;b&gt;")).toBe("'A' <b>");
    expect(googleNewsUrl("삼성전자", 3)).toContain("when%3A3d");
  });
});

describe("portfolio", () => {
  const h: Holding = { id: "h", name: "삼성전자", symbol: "005930.KS", quantity: 10, avgPrice: 70000, createdAt: "" };

  it("normalizes Korean codes", () => {
    expect(normalizeSymbol(" 005930 ")).toBe("005930.KS");
    expect(normalizeSymbol("247540.kq")).toBe("247540.KQ");
    expect(normalizeSymbol("aapl")).toBe("AAPL");
  });

  it("computes value, P&L and day change", () => {
    const p = position(h, { symbol: "005930.KS", price: 77000, prevClose: 70000, asOf: "", history: [] })!;
    expect(p.value).toBe(770000);
    expect(p.pnl).toBe(70000);
    expect(p.pnlPct).toBeCloseTo(10);
    expect(p.dayChange).toBe(70000);
    expect(p.dayChangePct).toBeCloseTo(10);
  });

  it("builds a briefing prompt with indicators and headlines", () => {
    const prompt = buildPrompt(
      [{ holding: h, news: [{ title: "HBM4 공급 확대", link: "x", source: "한국경제", publishedAt: "2026-09-24T00:00:00Z" }] }],
      [{ id: "usdkrw", label: "원/달러", group: "환율", unit: "원", digits: 2, changeIn: "pct", value: 1400, prev: 1386 }],
      [],
    );
    expect(prompt).toContain("원/달러: 1,400.00 원 (+1.01%)");
    expect(prompt).toContain("id=h 삼성전자 (005930.KS)");
    expect(prompt).toContain("- HBM4 공급 확대 (한국경제, 2026-09-24)");
  });
});
