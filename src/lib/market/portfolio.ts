import type { Holding } from "../types";
import { MACRO_QUERY, searchNews, type NewsItem } from "./news";
import { fetchQuote, type Quote } from "./quotes";

/** "005930" → "005930.KS"; anything else is upper-cased and kept (AAPL, 247540.KQ, 7203.T …). */
export function normalizeSymbol(input: string): string {
  const s = input.trim().toUpperCase();
  return /^\d{6}$/.test(s) ? `${s}.KS` : s;
}

export const newsQuery = (h: Holding) => h.keywords?.trim() || h.name;

export interface HoldingView {
  holding: Holding;
  quote?: Quote;
  quoteError?: string;
  news: NewsItem[];
  newsError?: string;
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function loadHoldings(holdings: Holding[]): Promise<HoldingView[]> {
  return Promise.all(
    holdings.map(async (holding) => {
      const [quote, news] = await Promise.allSettled([fetchQuote(holding.symbol), searchNews(newsQuery(holding))]);
      return {
        holding,
        quote: quote.status === "fulfilled" ? quote.value : undefined,
        quoteError: quote.status === "rejected" ? errText(quote.reason) : undefined,
        news: news.status === "fulfilled" ? news.value : [],
        newsError: news.status === "rejected" ? errText(news.reason) : undefined,
      };
    }),
  );
}

export async function loadMacroNews(): Promise<{ news: NewsItem[]; error?: string }> {
  try {
    return { news: await searchNews(MACRO_QUERY, 2, 20) };
  } catch (err) {
    return { news: [], error: errText(err) };
  }
}

export interface Position {
  value: number;
  cost?: number;
  pnl?: number;
  pnlPct?: number;
  dayChange?: number;
  dayChangePct?: number;
}

export function position(holding: Holding, quote?: Quote): Position | undefined {
  if (!quote) return undefined;
  const qty = holding.quantity ?? 0;
  const dayDiff = quote.prevClose === undefined ? undefined : quote.price - quote.prevClose;
  const p: Position = {
    value: quote.price * qty,
    dayChange: dayDiff === undefined ? undefined : dayDiff * qty,
    dayChangePct: dayDiff === undefined || !quote.prevClose ? undefined : (dayDiff / quote.prevClose) * 100,
  };
  if (qty && holding.avgPrice) {
    p.cost = holding.avgPrice * qty;
    p.pnl = p.value - p.cost;
    p.pnlPct = (p.pnl / p.cost) * 100;
  }
  return p;
}
