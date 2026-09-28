export type AssetType = "stock" | "index_etf" | "sector_etf" | "bond_etf" | "commodity_etf" | "cash";
export type Currency = "KRW" | "USD";
export type SkillId = "decoder" | "story" | "price" | "cockpit" | "brief";
export type Origin = "claude-code" | "api" | "manual";

export const ASSET_LABEL: Record<AssetType, string> = {
  stock: "개별 종목",
  index_etf: "지수 ETF",
  sector_etf: "섹터·테마 ETF",
  bond_etf: "채권 ETF",
  commodity_etf: "원자재 ETF",
  cash: "현금성",
};

export const SKILL_LABEL: Record<SkillId, string> = {
  decoder: "기업 해독기",
  story: "스토리 리더",
  price: "가격 판독기",
  cockpit: "포트폴리오 콕핏",
  brief: "일일 브리핑",
};

/** Where a number came from: a URL, "10-K p.45", or "수동 입력". */
export type SourceRef = string;

export interface EtfConstituent {
  ticker: string;
  /** Weight inside the ETF, in percent. */
  weightPct: number;
}

export interface Holding {
  id: string;
  ticker: string;
  name: string;
  assetType: AssetType;
  currency: Currency;
  quantity: number;
  /** Average cost per unit in the holding's currency. */
  avgCost: number;
  /** USD/KRW rate at purchase, for splitting a USD holding's return into price and FX parts. */
  avgFx?: number;
  sector?: string;
  /** Largest ETF constituents, for look-through overlap. */
  constituents?: EtfConstituent[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Quote {
  ticker: string;
  price: number;
  /** Change since the previous close, in percent. */
  changePct?: number;
  currency: Currency;
  asOf: string;
  source: SourceRef;
}

export interface FxQuote {
  /** KRW per 1 USD. */
  rate: number;
  changePct?: number;
  asOf: string;
  source: SourceRef;
}

export interface MacroItem {
  name: string;
  value: string;
  change?: string;
  asOf: string;
  source: SourceRef;
}

export interface NewsItem {
  id: string;
  ticker?: string;
  theme?: string;
  title: string;
  summary: string;
  url?: string;
  /** "fact" = stated in the source; "interpretation" = the AI's reading of it. */
  kind: "fact" | "interpretation";
  asOf: string;
}

export type EventType = "earnings" | "dividend" | "macro" | "other";

export interface InvestEvent {
  id: string;
  ticker?: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  type: EventType;
  source?: SourceRef;
  /** Research-app task created from this event (synced to Google Calendar). */
  taskId?: string;
}

export interface ReportSource {
  label: string;
  url?: string;
  /** Page in an uploaded document. Never set for web sources. */
  page?: number;
}

export interface Report {
  id: string;
  /** Absent for portfolio-wide reports (brief, cockpit). */
  ticker?: string;
  skill: SkillId;
  title: string;
  markdown: string;
  sources: ReportSource[];
  /** Rule checks that failed when the report came in (missing sources, trading language…). */
  warnings: string[];
  origin: Origin;
  createdAt: string;
}

export interface YearValue {
  year: number;
  value: number;
}

/** Inputs to the reverse DCF. Money is in millions of `currency`, shares in millions. */
export interface ValuationInputs {
  currency: Currency;
  price: number;
  sharesOutstanding: number;
  netDebt: number;
  baseFcf: number;
  fcfHistory: YearValue[];
  revenueHistory: YearValue[];
  /** Decimal, e.g. 0.09 */
  wacc: number;
  terminalGrowth: number;
  years: number;
  /** Field name → where the number came from. */
  sources: Record<string, SourceRef>;
}

export interface Valuation {
  id: string;
  ticker: string;
  inputs: ValuationInputs;
  origin: Origin;
  createdAt: string;
}

export interface InvestDB {
  version: 1;
  holdings: Holding[];
  watchlist: string[];
  themes: string[];
  quotes: Record<string, Quote>;
  fx?: FxQuote;
  macro: MacroItem[];
  news: NewsItem[];
  events: InvestEvent[];
  reports: Report[];
  valuations: Valuation[];
  lastRefreshAt?: string;
}

export function emptyInvestDB(): InvestDB {
  return {
    version: 1,
    holdings: [],
    watchlist: [],
    themes: [],
    quotes: {},
    macro: [],
    news: [],
    events: [],
    reports: [],
    valuations: [],
  };
}
