import type {
  Currency,
  EtfConstituent,
  EventType,
  InvestDB,
  InvestEvent,
  MacroItem,
  NewsItem,
  Origin,
  Quote,
  Report,
  ReportSource,
  SkillId,
  Valuation,
  ValuationInputs,
  YearValue,
} from "./types";

/**
 * A research bundle is how results get into the app — from a Claude Code skill (file or paste)
 * or from an in-app Claude run. Everything is validated here; numbers without a source are dropped.
 */
export const BUNDLE_FORMAT = "rm-invest-bundle/1";

export interface ImportResult {
  quotes: number;
  fx: boolean;
  macro: number;
  news: number;
  events: number;
  reports: number;
  valuations: number;
  warnings: string[];
}

const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SKILLS: SkillId[] = ["decoder", "story", "price", "cockpit", "brief"];
const EVENT_TYPES: EventType[] = ["earnings", "dividend", "macro", "other"];

export function normalizeTicker(value: unknown): string | null {
  const t = String(value ?? "").trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

/** "AAPL 7.1" per line (or comma-separated) → ETF constituents. */
export function parseConstituents(raw: string): EtfConstituent[] {
  return raw
    .split(/[\n,]+/)
    .map((line) => line.trim().split(/[\s:=]+/))
    .map(([t, w]) => ({ ticker: normalizeTicker(t), weightPct: Number(String(w ?? "").replace("%", "")) }))
    .filter((c): c is EtfConstituent => Boolean(c.ticker) && c.weightPct > 0 && c.weightPct <= 100)
    .slice(0, 50);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v.replace(/[,%\s]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const currency = (v: unknown): Currency | null => (v === "KRW" || v === "USD" ? v : null);
const isUrl = (v: string) => /^https?:\/\//i.test(v);

/** A source is required for every number. Empty, "확인 필요" or "unknown" doesn't count. */
function source(v: unknown): string | null {
  const s = text(v, 500);
  if (!s || /^(확인\s*필요|unknown|n\/?a|none|-)$/i.test(s)) return null;
  return s;
}

/**
 * Rules every report must satisfy (see the skills' shared principles).
 * Returns human-readable warnings; the report is still stored so it can be reviewed.
 */
export function checkReport(markdown: string, sources: ReportSource[]): string[] {
  const warnings: string[] = [];
  if (sources.length === 0) warnings.push("출처 목록이 비어 있습니다. 본문 숫자를 원문에서 확인하세요.");
  if (hasTradeLanguage(markdown)) warnings.push("매매 권유로 읽힐 수 있는 표현이 있습니다. 이 시스템은 매매 신호를 내지 않습니다.");
  if (sources.some((s) => s.page !== undefined && s.url && isUrl(s.url))) {
    warnings.push("웹 출처에 페이지 번호가 붙어 있습니다. 웹 출처는 URL만 인정됩니다 (페이지 번호 추측 금지).");
  }
  return warnings;
}

/** True when the text recommends a trade. Negated mentions ("매수 추천은 하지 않음") don't count. */
export function hasTradeLanguage(markdown: string): boolean {
  for (const m of markdown.matchAll(TRADE_RE)) {
    const after = markdown.slice(m.index + m[0].length, m.index + m[0].length + 16);
    if (!/^\s*(은|는|을|를|이|가|도)?\s*(하지\s*않|않|안\s|금지|아님|아니|없)/.test(after)) return true;
  }
  return false;
}

const TRADE_RE =
  /(매수|매도|비중\s*(확대|축소))\s*(추천|권고|권유|의견|하세요|하십시오|하라)|지금\s*(사|파)(세요|라)|사라\b|팔아라|강력\s*매수|\b(strong\s+buy|buy\s+rating|sell\s+rating|you\s+should\s+(buy|sell))\b/gi;

function history(v: unknown): YearValue[] {
  return arr(v)
    .map((x) => (isObj(x) ? { year: num(x.year), value: num(x.value) } : null))
    .filter((x): x is YearValue => Boolean(x && x.year && x.year > 1900 && x.year < 2200 && x.value !== undefined))
    .sort((a, b) => a.year - b.year);
}

export function parseValuationInputs(v: Obj, warnings: string[], label: string): ValuationInputs | null {
  const cur = currency(v.currency);
  const price = num(v.price);
  const shares = num(v.sharesOutstanding);
  const baseFcf = num(v.baseFcf);
  if (!cur || price === undefined || shares === undefined || baseFcf === undefined) {
    warnings.push(`${label}: currency·price·sharesOutstanding·baseFcf가 모두 있어야 합니다.`);
    return null;
  }
  const sources: Record<string, string> = {};
  if (isObj(v.sources)) for (const [k, s] of Object.entries(v.sources)) if (source(s)) sources[k] = source(s)!;
  const missing = ["price", "sharesOutstanding", "netDebt", "baseFcf"].filter((k) => !sources[k]);
  if (missing.length) warnings.push(`${label}: 출처 없는 입력값 — ${missing.join(", ")} (확인 필요로 표시됩니다)`);
  return {
    currency: cur,
    price,
    sharesOutstanding: shares,
    netDebt: num(v.netDebt) ?? 0,
    baseFcf,
    fcfHistory: history(v.fcfHistory),
    revenueHistory: history(v.revenueHistory),
    wacc: clampRate(num(v.wacc), 0.09),
    terminalGrowth: clampRate(num(v.terminalGrowth), 0.025),
    years: Math.min(Math.max(Math.round(num(v.years) ?? 10), 1), 30),
    sources,
  };
}

/** Accepts 0.09 or 9 (percent) and returns a decimal. */
function clampRate(v: number | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const r = Math.abs(v) >= 1 ? v / 100 : v;
  return r > -0.5 && r < 0.5 ? r : fallback;
}

/** Pulls the bundle out of raw text: a bare JSON object, or the last ```json fenced block. */
export function extractBundleJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const blocks = [...trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  const last = blocks.reverse().find((b) => b.startsWith("{"));
  if (!last) throw new Error("JSON 번들을 찾지 못했습니다. ```json 블록이나 JSON 객체를 붙여 넣으세요.");
  return JSON.parse(last);
}

/** Validates a bundle and merges it into `db`. Throws only when the whole thing is unusable. */
export function applyBundle(db: InvestDB, input: unknown, origin: Origin, now = new Date()): ImportResult {
  if (!isObj(input)) throw new Error("번들은 JSON 객체여야 합니다.");
  if (input.format !== undefined && input.format !== BUNDLE_FORMAT) throw new Error(`지원하지 않는 형식입니다: ${String(input.format)}`);
  const ts = now.toISOString();
  const asOfDefault = text(input.generatedAt, 40) || ts;
  const warnings: string[] = [];
  const result: ImportResult = { quotes: 0, fx: false, macro: 0, news: 0, events: 0, reports: 0, valuations: 0, warnings };

  for (const [i, raw] of arr(input.quotes).entries()) {
    if (!isObj(raw)) continue;
    const ticker = normalizeTicker(raw.ticker);
    const price = num(raw.price);
    const cur = currency(raw.currency);
    const src = source(raw.source);
    if (!ticker || !price || price <= 0 || !cur) {
      warnings.push(`시세 #${i + 1}: ticker·price·currency가 올바르지 않아 건너뜀`);
      continue;
    }
    if (!src) {
      warnings.push(`시세 ${ticker}: 출처가 없어 반영하지 않음`);
      continue;
    }
    const quote: Quote = { ticker, price, changePct: num(raw.changePct), currency: cur, asOf: text(raw.asOf, 40) || asOfDefault, source: src };
    db.quotes[ticker] = quote;
    result.quotes++;
  }

  if (isObj(input.fx)) {
    const rate = num(input.fx.rate);
    const src = source(input.fx.source);
    if (rate && rate > 100 && rate < 5000 && src) {
      db.fx = { rate, changePct: num(input.fx.changePct), asOf: text(input.fx.asOf, 40) || asOfDefault, source: src };
      result.fx = true;
    } else warnings.push("환율: rate(원/달러)와 source가 필요합니다. 반영하지 않음");
  }

  const macro: MacroItem[] = [];
  for (const raw of arr(input.macro)) {
    if (!isObj(raw)) continue;
    const name = text(raw.name, 80);
    const value = text(String(raw.value ?? ""), 80);
    const src = source(raw.source);
    if (!name || !value) continue;
    if (!src) {
      warnings.push(`매크로 '${name}': 출처가 없어 반영하지 않음`);
      continue;
    }
    macro.push({ name, value, change: text(raw.change === undefined ? "" : String(raw.change), 40) || undefined, asOf: text(raw.asOf, 40) || asOfDefault, source: src });
  }
  if (macro.length) {
    // A refresh replaces the snapshot; indicators it didn't mention are kept.
    const names = new Set(macro.map((m) => m.name));
    db.macro = [...macro, ...db.macro.filter((m) => !names.has(m.name))].slice(0, 20);
    result.macro = macro.length;
  }

  for (const raw of arr(input.news)) {
    if (!isObj(raw)) continue;
    const title = text(raw.title, 300);
    if (!title) continue;
    const url = text(raw.url, 1000);
    if (url && !isUrl(url)) continue;
    const kind = raw.kind === "interpretation" ? "interpretation" : "fact";
    if (kind === "fact" && !url) {
      warnings.push(`뉴스 '${title.slice(0, 30)}': 사실(fact) 항목인데 URL이 없어 건너뜀`);
      continue;
    }
    const item: NewsItem = {
      id: crypto.randomUUID(),
      ticker: normalizeTicker(raw.ticker) ?? undefined,
      theme: text(raw.theme, 60) || undefined,
      title,
      summary: text(raw.summary, 1500),
      url: url || undefined,
      kind,
      asOf: text(raw.asOf, 40) || asOfDefault,
    };
    const dup = db.news.findIndex((n) => (item.url && n.url === item.url) || n.title === item.title);
    if (dup >= 0) db.news.splice(dup, 1);
    db.news.unshift(item);
    result.news++;
  }
  db.news = db.news.sort((a, b) => b.asOf.localeCompare(a.asOf)).slice(0, 300);

  for (const raw of arr(input.events)) {
    if (!isObj(raw)) continue;
    const date = text(raw.date, 10);
    const title = text(raw.title, 200);
    if (!DATE_RE.test(date) || !title) continue;
    const ticker = normalizeTicker(raw.ticker) ?? undefined;
    const type = (EVENT_TYPES as string[]).includes(String(raw.type)) ? (raw.type as EventType) : "other";
    const existing = db.events.find((e) => e.ticker === ticker && e.type === type && (e.date === date || (type === "earnings" && sameQuarter(e.date, date))));
    if (existing) {
      existing.date = date;
      existing.title = title;
      existing.source = source(raw.source) ?? existing.source;
    } else {
      const event: InvestEvent = { id: crypto.randomUUID(), ticker, date, title, type, source: source(raw.source) ?? undefined };
      db.events.push(event);
    }
    result.events++;
  }
  db.events.sort((a, b) => a.date.localeCompare(b.date));

  for (const [i, raw] of arr(input.reports).entries()) {
    if (!isObj(raw)) continue;
    const skill = (SKILLS as string[]).includes(String(raw.skill)) ? (raw.skill as SkillId) : null;
    const markdown = text(raw.markdown, 200_000);
    if (!skill || !markdown) {
      warnings.push(`리포트 #${i + 1}: skill과 markdown이 필요합니다`);
      continue;
    }
    const ticker = normalizeTicker(raw.ticker) ?? undefined;
    if ((skill === "decoder" || skill === "story" || skill === "price") && !ticker) {
      warnings.push(`리포트 #${i + 1}: 종목 리포트에 ticker가 없습니다`);
      continue;
    }
    const sources: ReportSource[] = arr(raw.sources)
      .map((s) => {
        if (typeof s === "string") return isUrl(s) ? { label: s, url: s } : { label: s };
        if (!isObj(s)) return null;
        const url = text(s.url, 1000);
        const page = num(s.page);
        return { label: text(s.label, 300) || url, url: url && isUrl(url) ? url : undefined, page: page && page > 0 ? Math.round(page) : undefined };
      })
      .filter((s): s is ReportSource => Boolean(s && s.label));
    const report: Report = {
      id: crypto.randomUUID(),
      ticker,
      skill,
      title: text(raw.title, 200) || `${ticker ?? "포트폴리오"} ${skill}`,
      markdown,
      sources,
      warnings: checkReport(markdown, sources),
      origin,
      createdAt: ts,
    };
    db.reports.push(report);
    result.reports++;
    if (report.warnings.length) warnings.push(...report.warnings.map((w) => `리포트 '${report.title}': ${w}`));
  }

  for (const [i, raw] of arr(input.valuations).entries()) {
    if (!isObj(raw)) continue;
    const ticker = normalizeTicker(raw.ticker);
    if (!ticker) {
      warnings.push(`밸류에이션 #${i + 1}: ticker가 없습니다`);
      continue;
    }
    const inputs = parseValuationInputs(raw, warnings, `밸류에이션 ${ticker}`);
    if (!inputs) continue;
    const valuation: Valuation = { id: crypto.randomUUID(), ticker, inputs, origin, createdAt: ts };
    db.valuations.push(valuation);
    result.valuations++;
  }

  for (const t of arr(input.watchlist)) {
    const ticker = normalizeTicker(t);
    if (ticker && !db.watchlist.includes(ticker) && !db.holdings.some((h) => h.ticker === ticker)) db.watchlist.push(ticker);
  }

  prune(db, now);
  if (result.quotes || result.fx || result.macro || result.news) db.lastRefreshAt = ts;
  return result;
}

function sameQuarter(a: string, b: string): boolean {
  const q = (d: string) => `${d.slice(0, 4)}Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3)}`;
  return q(a) === q(b);
}

/** Keeps the store small: old events, and at most 10 reports / 10 valuations per ticker and skill. */
export function prune(db: InvestDB, now = new Date()) {
  const cutoff = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  db.events = db.events.filter((e) => e.date >= cutoff);
  const keep = <T extends { createdAt: string }>(items: T[], key: (x: T) => string, max: number) => {
    const counts = new Map<string, number>();
    return [...items]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((x) => {
        const n = (counts.get(key(x)) ?? 0) + 1;
        counts.set(key(x), n);
        return n <= max;
      })
      .reverse();
  };
  db.reports = keep(db.reports, (r) => `${r.ticker}:${r.skill}`, 10);
  db.valuations = keep(db.valuations, (v) => v.ticker, 10);
}

export function summarizeImport(r: ImportResult): string {
  const parts = [
    r.quotes && `시세 ${r.quotes}`,
    r.fx && "환율",
    r.macro && `매크로 ${r.macro}`,
    r.news && `뉴스 ${r.news}`,
    r.events && `일정 ${r.events}`,
    r.reports && `리포트 ${r.reports}`,
    r.valuations && `밸류에이션 ${r.valuations}`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(" · ")} 반영` : "반영된 항목이 없습니다";
}
