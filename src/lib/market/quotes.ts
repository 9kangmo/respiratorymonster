import { cached, fetchText } from "./cache";

export interface Quote {
  symbol: string;
  price: number;
  /** Previous session's close; absent when the history is too short to tell. */
  prevClose?: number;
  currency?: string;
  /** When `price` was observed (ISO). */
  asOf: string;
  /** Daily closes, oldest first, for sparklines. */
  history: number[];
}

interface YahooChart {
  chart?: {
    result?: {
      meta: {
        symbol: string;
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        previousClose?: number;
        gmtoffset?: number;
      };
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
}

const dayKey = (epochSec: number, offsetSec: number) => new Date((epochSec + offsetSec) * 1000).toISOString().slice(0, 10);

/** Parses Yahoo's v8 chart response (daily candles). */
export function parseYahooChart(json: unknown): Quote {
  const data = json as YahooChart;
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(data.chart?.error?.description ?? "시세 없음");
  const { meta } = result;
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points = (result.timestamp ?? [])
    .map((t, i) => ({ t, c: closes[i] }))
    .filter((p): p is { t: number; c: number } => typeof p.c === "number" && Number.isFinite(p.c));
  const price = meta.regularMarketPrice ?? points.at(-1)?.c;
  if (price === undefined) throw new Error("시세 없음");
  const time = meta.regularMarketTime ?? points.at(-1)?.t ?? Date.now() / 1000;
  const offset = meta.gmtoffset ?? 0;

  // The last candle is usually the current session; the one before it is the previous close.
  let prevClose: number | undefined;
  const last = points.at(-1);
  if (last && dayKey(last.t, offset) === dayKey(time, offset)) prevClose = points.at(-2)?.c;
  else prevClose = last?.c;
  prevClose ??= meta.previousClose;

  const history = points.map((p) => p.c);
  if (last && dayKey(last.t, offset) === dayKey(time, offset)) history[history.length - 1] = price;
  else history.push(price);

  return { symbol: meta.symbol, price, prevClose, currency: meta.currency, asOf: new Date(time * 1000).toISOString(), history };
}

export function fetchQuote(symbol: string): Promise<Quote> {
  return cached(`yahoo:${symbol}`, 5 * 60_000, async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    return parseYahooChart(JSON.parse(await fetchText(url)));
  });
}

export interface RatePoint {
  value: number;
  /** YYYY-MM-DD */
  date: string;
  prev?: { value: number; date: string };
}

/** Parses FRED's fredgraph.csv; `prev` is the last observation with a different value (i.e. the previous rate). */
export function parseFredCsv(csv: string): RatePoint {
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(","))
    .filter(([date, v]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && v !== undefined && /^-?[\d.]+$/.test(v.trim()) && v.trim() !== ".")
    .map(([date, v]) => ({ date, value: Number(v) }));
  const last = rows.at(-1);
  if (!last) throw new Error("FRED 데이터 없음");
  const prev = [...rows].reverse().find((r) => r.value !== last.value);
  return { ...last, prev };
}

export function fetchFred(series: string): Promise<RatePoint> {
  return cached(`fred:${series}`, 6 * 60 * 60_000, async () => {
    const start = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10);
    const csv = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}&cosd=${start}`);
    return parseFredCsv(csv);
  });
}

// ---------- Bank of Korea ECOS (optional, needs a free API key) ----------

interface EcosRow {
  KEYSTAT_NAME?: string;
  DATA_VALUE?: string;
  CYCLE?: string;
  TIME?: string;
}

function ecosRows(json: unknown, root: string): EcosRow[] {
  const data = json as Record<string, { row?: EcosRow[] } | { CODE?: string; MESSAGE?: string } | undefined>;
  const body = data[root] as { row?: EcosRow[] } | undefined;
  if (body?.row) return body.row;
  const result = data.RESULT as { CODE?: string; MESSAGE?: string } | undefined;
  if (result?.CODE === "INFO-200") return [];
  throw new Error(result?.MESSAGE ?? "ECOS 응답 오류");
}

/** YYYYMMDD / YYYYMM → YYYY-MM-DD */
function ecosDate(raw = ""): string {
  const d = raw.replace(/\D/g, "");
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d.length >= 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-01` : raw;
}

/** Picks a stat from ECOS KeyStatisticList (100대 통계지표) by name. */
export function pickKeyStat(json: unknown, match: RegExp): RatePoint | undefined {
  const row = ecosRows(json, "KeyStatisticList").find((r) => match.test(r.KEYSTAT_NAME ?? ""));
  const value = Number(row?.DATA_VALUE);
  return row && Number.isFinite(value) ? { value, date: ecosDate(row.CYCLE) } : undefined;
}

/** Last two observations of an ECOS StatisticSearch series. */
export function parseEcosSeries(json: unknown): RatePoint | undefined {
  const rows = ecosRows(json, "StatisticSearch")
    .map((r) => ({ date: ecosDate(r.TIME), value: Number(r.DATA_VALUE) }))
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = rows.at(-1);
  return last ? { ...last, prev: rows.at(-2) } : undefined;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export function fetchKoreanRates(apiKey: string): Promise<{ base?: RatePoint; ktb10?: RatePoint }> {
  return cached("ecos:rates", 60 * 60_000, async () => {
    const root = `https://ecos.bok.or.kr/api`;
    const key = encodeURIComponent(apiKey);
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    const [keyStats, ktb] = await Promise.all([
      fetchText(`${root}/KeyStatisticList/${key}/json/kr/1/100`).then(JSON.parse),
      // 817Y002 시장금리(일별) / 010210000 국고채(10년)
      fetchText(`${root}/StatisticSearch/${key}/json/kr/1/100/817Y002/D/${ymd(start)}/${ymd(end)}/010210000`)
        .then(JSON.parse)
        .catch(() => null),
    ]);
    return {
      base: pickKeyStat(keyStats, /기준금리/),
      ktb10: (ktb && parseEcosSeries(ktb)) || pickKeyStat(keyStats, /국고채.*10년/),
    };
  });
}
