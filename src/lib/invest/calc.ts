import type { AssetType, Currency, FxQuote, Holding, Quote, ValuationInputs, YearValue } from "./types";

// Every number the app shows is computed here, in code — never by the model.

// ---------- reverse DCF ----------

/**
 * Enterprise value of a stream that starts at `baseFcf`, grows at `growth` for `years`,
 * then continues at `terminalGrowth` forever (Gordon growth), discounted at `wacc`.
 */
export function dcfValue(baseFcf: number, growth: number, wacc: number, terminalGrowth: number, years: number): number {
  let pv = 0;
  let fcf = baseFcf;
  for (let t = 1; t <= years; t++) {
    fcf *= 1 + growth;
    pv += fcf / (1 + wacc) ** t;
  }
  const terminal = (fcf * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  return pv + terminal / (1 + wacc) ** years;
}

export type ReverseDcfResult =
  | { ok: true; impliedGrowth: number; marketCap: number; enterpriseValue: number; terminalShare: number }
  | { ok: false; reason: string; marketCap?: number; enterpriseValue?: number };

const G_MIN = -0.5;
const G_MAX = 1.5;

/** The annual FCF growth over the explicit period that makes the DCF equal today's enterprise value (bisection). */
export function reverseDcf(i: Pick<ValuationInputs, "price" | "sharesOutstanding" | "netDebt" | "baseFcf" | "wacc" | "terminalGrowth" | "years">): ReverseDcfResult {
  const marketCap = i.price * i.sharesOutstanding;
  const enterpriseValue = marketCap + i.netDebt;
  if (!(i.price > 0) || !(i.sharesOutstanding > 0)) return { ok: false, reason: "주가와 발행주식수가 필요합니다." };
  if (!(i.years >= 1 && i.years <= 30)) return { ok: false, reason: "예측 기간은 1~30년이어야 합니다." };
  if (!(i.wacc > i.terminalGrowth)) return { ok: false, reason: "할인율(WACC)이 영구성장률보다 커야 합니다.", marketCap, enterpriseValue };
  if (!(i.baseFcf > 0)) {
    return { ok: false, reason: "기준 FCF가 0 이하라 역DCF로 요구 성장률을 계산할 수 없습니다. 매출·마진 기반으로 따로 봐야 합니다.", marketCap, enterpriseValue };
  }
  if (!(enterpriseValue > 0)) return { ok: false, reason: "기업가치(시가총액+순부채)가 0 이하입니다.", marketCap, enterpriseValue };

  const f = (g: number) => dcfValue(i.baseFcf, g, i.wacc, i.terminalGrowth, i.years) - enterpriseValue;
  if (f(G_MIN) > 0) return { ok: false, reason: `연 ${pct(G_MIN)} 역성장을 가정해도 현재 가치보다 큽니다 (가격이 FCF 대비 매우 낮음).`, marketCap, enterpriseValue };
  if (f(G_MAX) < 0) return { ok: false, reason: `연 ${pct(G_MAX)} 성장으로도 현재 가격을 설명할 수 없습니다.`, marketCap, enterpriseValue };

  let lo = G_MIN;
  let hi = G_MAX;
  for (let n = 0; n < 200 && hi - lo > 1e-9; n++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  const g = (lo + hi) / 2;
  const tvPv = dcfValue(i.baseFcf, g, i.wacc, i.terminalGrowth, i.years) - explicitPv(i.baseFcf, g, i.wacc, i.years);
  return { ok: true, impliedGrowth: g, marketCap, enterpriseValue, terminalShare: tvPv / enterpriseValue };
}

function explicitPv(baseFcf: number, growth: number, wacc: number, years: number): number {
  let pv = 0;
  let fcf = baseFcf;
  for (let t = 1; t <= years; t++) {
    fcf *= 1 + growth;
    pv += fcf / (1 + wacc) ** t;
  }
  return pv;
}

export interface SensitivityTable {
  waccs: number[];
  terminalGrowths: number[];
  /** rows[waccIndex][tgIndex] = implied growth, or null when not solvable. */
  rows: (number | null)[][];
}

/** Implied growth across WACC ±2%p and terminal growth ±0.5%p, so no single discount rate carries the conclusion. */
export function sensitivity(i: ValuationInputs, waccStep = 0.01, tgStep = 0.005): SensitivityTable {
  const round = (x: number) => Math.round(x * 10000) / 10000;
  const waccs = [-2, -1, 0, 1, 2].map((k) => round(i.wacc + k * waccStep)).filter((w) => w > 0);
  const terminalGrowths = [-1, 0, 1].map((k) => round(i.terminalGrowth + k * tgStep));
  const rows = waccs.map((wacc) =>
    terminalGrowths.map((terminalGrowth) => {
      const r = reverseDcf({ ...i, wacc, terminalGrowth });
      return r.ok ? r.impliedGrowth : null;
    }),
  );
  return { waccs, terminalGrowths, rows };
}

/** Compound annual growth between the first and last of the latest `span + 1` points. Null when not meaningful. */
export function cagr(history: YearValue[], span?: number): { rate: number; from: number; to: number } | null {
  const sorted = [...history].sort((a, b) => a.year - b.year);
  const slice = span ? sorted.slice(-(span + 1)) : sorted;
  if (slice.length < 2) return null;
  const first = slice[0];
  const last = slice.at(-1)!;
  const years = last.year - first.year;
  if (years <= 0 || !(first.value > 0) || !(last.value > 0)) return null;
  return { rate: (last.value / first.value) ** (1 / years) - 1, from: first.year, to: last.year };
}

export interface Anomaly {
  year: number;
  value: number;
  baseline: number;
  deviation: number;
}

/** Years whose value deviates more than `threshold` from the average of the previous three years. */
export function findAnomalies(history: YearValue[], threshold = 0.4): Anomaly[] {
  const sorted = [...history].sort((a, b) => a.year - b.year);
  const out: Anomaly[] = [];
  for (let k = 3; k < sorted.length; k++) {
    const baseline = (sorted[k - 1].value + sorted[k - 2].value + sorted[k - 3].value) / 3;
    if (baseline === 0) continue;
    const deviation = (sorted[k].value - baseline) / Math.abs(baseline);
    if (Math.abs(deviation) > threshold) out.push({ year: sorted[k].year, value: sorted[k].value, baseline, deviation });
  }
  return out;
}

/** Deviation of the base FCF from the average of the latest three reported years. */
export function baseFcfCheck(i: Pick<ValuationInputs, "baseFcf" | "fcfHistory">, threshold = 0.4): Anomaly | null {
  const last3 = [...i.fcfHistory].sort((a, b) => a.year - b.year).slice(-3);
  if (last3.length < 3) return null;
  const baseline = last3.reduce((s, x) => s + x.value, 0) / 3;
  if (baseline === 0) return null;
  const deviation = (i.baseFcf - baseline) / Math.abs(baseline);
  return Math.abs(deviation) > threshold ? { year: 0, value: i.baseFcf, baseline, deviation } : null;
}

// ---------- portfolio ----------

export interface Position {
  holding: Holding;
  quote?: Quote;
  /** Price used (quote, or avg cost when no quote). */
  price: number;
  priced: boolean;
  valueKrw: number;
  costKrw: number;
  pnlKrw: number;
  returnPct: number;
  /** For USD holdings with avgFx: return from price alone and from FX alone. */
  localReturnPct?: number;
  fxReturnPct?: number;
  weight: number;
  /** Share of the total portfolio P&L. */
  contribution: number;
}

export interface Exposure {
  ticker: string;
  direct: number;
  viaEtf: number;
  total: number;
  /** ETFs through which the ticker is held. */
  sources: string[];
}

export interface PortfolioMetrics {
  positions: Position[];
  totalKrw: number;
  costKrw: number;
  pnlKrw: number;
  returnPct: number;
  /** Herfindahl–Hirschman index on 0–10,000. */
  hhi: number;
  effectiveN: number;
  topWeight: number;
  exposures: Exposure[];
  /** Tickers held directly and again inside an ETF. */
  hiddenOverlap: Exposure[];
  byAssetType: { type: AssetType; weight: number }[];
  byCurrency: { currency: Currency; weight: number }[];
  byTheme: { name: string; weight: number }[];
  /** Weight of non-KRW assets. */
  fxExposure: number;
  /** Portfolio value change in KRW for a +10% move in USD/KRW. */
  fxShock10Krw: number;
  missingFx: boolean;
  unpriced: string[];
}

const toKrw = (amount: number, currency: Currency, fx?: FxQuote) => (currency === "KRW" ? amount : amount * (fx?.rate ?? 0));

export function hhi(weights: number[]): number {
  return weights.reduce((s, w) => s + (w * 100) ** 2, 0);
}

export function portfolioMetrics(holdings: Holding[], quotes: Record<string, Quote>, fx?: FxQuote): PortfolioMetrics {
  const missingFx = holdings.some((h) => h.currency !== "KRW") && !fx;
  const raw = holdings.map((holding) => {
    const quote = quotes[holding.ticker];
    const priced = Boolean(quote && quote.currency === holding.currency && quote.price > 0);
    const price = priced ? quote!.price : holding.avgCost;
    const valueKrw = toKrw(price * holding.quantity, holding.currency, fx);
    const costRate = holding.currency === "KRW" ? 1 : (holding.avgFx ?? fx?.rate ?? 0);
    const costKrw = holding.avgCost * holding.quantity * costRate;
    let localReturnPct: number | undefined;
    let fxReturnPct: number | undefined;
    if (holding.currency !== "KRW" && holding.avgFx && fx && holding.avgCost > 0) {
      localReturnPct = price / holding.avgCost - 1;
      fxReturnPct = fx.rate / holding.avgFx - 1;
    }
    return { holding, quote, price, priced, valueKrw, costKrw, localReturnPct, fxReturnPct };
  });
  const totalKrw = raw.reduce((s, p) => s + p.valueKrw, 0);
  const costKrw = raw.reduce((s, p) => s + p.costKrw, 0);
  const pnlKrw = totalKrw - costKrw;
  const positions: Position[] = raw
    .map((p) => {
      const pnl = p.valueKrw - p.costKrw;
      return {
        ...p,
        pnlKrw: pnl,
        returnPct: p.costKrw > 0 ? pnl / p.costKrw : 0,
        weight: totalKrw > 0 ? p.valueKrw / totalKrw : 0,
        contribution: costKrw > 0 ? pnl / costKrw : 0,
      };
    })
    .sort((a, b) => b.valueKrw - a.valueKrw);

  const weights = positions.map((p) => p.weight);

  // Look-through: a direct holding plus its share inside every ETF held.
  const exp = new Map<string, Exposure>();
  const touch = (ticker: string) => {
    let e = exp.get(ticker);
    if (!e) exp.set(ticker, (e = { ticker, direct: 0, viaEtf: 0, total: 0, sources: [] }));
    return e;
  };
  for (const p of positions) {
    const constituents = p.holding.assetType === "stock" ? [] : (p.holding.constituents ?? []);
    if (constituents.length === 0) {
      touch(p.holding.ticker).direct += p.weight;
      continue;
    }
    const covered = constituents.reduce((s, c) => s + c.weightPct, 0) / 100;
    for (const c of constituents) {
      const e = touch(c.ticker);
      e.viaEtf += p.weight * (c.weightPct / 100);
      e.sources.push(p.holding.ticker);
    }
    // The part of the ETF not listed stays attributed to the ETF itself.
    if (covered < 1) touch(p.holding.ticker).direct += p.weight * (1 - Math.min(covered, 1));
  }
  const exposures = [...exp.values()].map((e) => ({ ...e, total: e.direct + e.viaEtf })).sort((a, b) => b.total - a.total);

  const group = <K extends string>(key: (p: Position) => K) => {
    const m = new Map<K, number>();
    for (const p of positions) m.set(key(p), (m.get(key(p)) ?? 0) + p.weight);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const fxExposure = positions.filter((p) => p.holding.currency !== "KRW").reduce((s, p) => s + p.weight, 0);

  return {
    positions,
    totalKrw,
    costKrw,
    pnlKrw,
    returnPct: costKrw > 0 ? pnlKrw / costKrw : 0,
    hhi: hhi(weights),
    effectiveN: weights.length ? 1 / weights.reduce((s, w) => s + w * w, 0) : 0,
    topWeight: weights[0] ?? 0,
    exposures,
    hiddenOverlap: exposures.filter((e) => e.direct > 0 && e.viaEtf > 0),
    byAssetType: group((p) => p.holding.assetType).map(([type, weight]) => ({ type, weight })),
    byCurrency: group((p) => p.holding.currency).map(([currency, weight]) => ({ currency, weight })),
    byTheme: group((p) => p.holding.sector?.trim() || "미분류").map(([name, weight]) => ({ name, weight })),
    fxExposure,
    fxShock10Krw: totalKrw * fxExposure * 0.1,
    missingFx,
    unpriced: positions.filter((p) => !p.priced && p.holding.assetType !== "cash").map((p) => p.holding.ticker),
  };
}

export function hhiLabel(value: number): string {
  if (value < 1500) return "분산";
  if (value < 2500) return "보통 집중";
  return "고집중";
}

// ---------- formatting ----------

export function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function signedPct(x: number, digits = 1): string {
  return `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
}

export function krw(x: number): string {
  const abs = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}억원`;
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e4).toLocaleString("ko-KR")}만원`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`;
}

export function money(x: number, currency: Currency): string {
  return currency === "KRW"
    ? `${Math.round(x).toLocaleString("ko-KR")}원`
    : `$${x.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

/** Millions of `currency` in a compact form. */
export function millions(x: number, currency: Currency): string {
  if (currency === "KRW") {
    const eok = x / 100; // 1억 = 100백만
    return Math.abs(eok) >= 10000 ? `${(eok / 10000).toFixed(1)}조원` : `${Math.round(eok).toLocaleString("ko-KR")}억원`;
  }
  const sign = x < 0 ? "-" : "";
  return Math.abs(x) >= 1000 ? `${sign}$${(Math.abs(x) / 1000).toFixed(1)}B` : `${sign}$${Math.abs(x).toFixed(0)}M`;
}
