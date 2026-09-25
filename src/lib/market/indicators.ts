import { config } from "../config";
import { fetchFred, fetchKoreanRates, fetchQuote, type RatePoint } from "./quotes";

export type IndicatorGroup = "금리" | "환율" | "원자재";

export interface Indicator {
  id: string;
  label: string;
  group: IndicatorGroup;
  unit: string;
  digits: number;
  /** Rates move in basis points; everything else in percent. */
  changeIn: "bp" | "pct";
  value?: number;
  prev?: number;
  /** YYYY-MM-DD or ISO time of the latest value. */
  asOf?: string;
  history?: number[];
  note?: string;
  error?: string;
}

interface YahooSpec {
  id: string;
  label: string;
  group: IndicatorGroup;
  symbol: string;
  unit: string;
  digits: number;
  scale?: number;
  changeIn?: "bp" | "pct";
  note?: string;
}

const YAHOO: YahooSpec[] = [
  { id: "us10y", label: "미국 10년물", group: "금리", symbol: "^TNX", unit: "%", digits: 3, changeIn: "bp" },
  { id: "usdkrw", label: "원/달러", group: "환율", symbol: "KRW=X", unit: "원", digits: 2 },
  { id: "jpykrw", label: "원/100엔", group: "환율", symbol: "JPYKRW=X", unit: "원", digits: 2, scale: 100 },
  { id: "usdjpy", label: "엔/달러", group: "환율", symbol: "JPY=X", unit: "엔", digits: 2 },
  { id: "gold", label: "금", group: "원자재", symbol: "GC=F", unit: "$/oz", digits: 1, note: "COMEX 선물" },
  { id: "wti", label: "WTI 유가", group: "원자재", symbol: "CL=F", unit: "$/bbl", digits: 2, note: "NYMEX 선물" },
  { id: "brent", label: "브렌트유", group: "원자재", symbol: "BZ=F", unit: "$/bbl", digits: 2, note: "ICE 선물" },
];

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function yahooIndicator(spec: YahooSpec): Promise<Indicator> {
  const base: Indicator = { id: spec.id, label: spec.label, group: spec.group, unit: spec.unit, digits: spec.digits, changeIn: spec.changeIn ?? "pct", note: spec.note };
  try {
    const q = await fetchQuote(spec.symbol);
    const k = spec.scale ?? 1;
    return { ...base, value: q.price * k, prev: q.prevClose === undefined ? undefined : q.prevClose * k, asOf: q.asOf, history: q.history.map((v) => v * k) };
  } catch (err) {
    return { ...base, error: errText(err) };
  }
}

function rateIndicator(id: string, label: string, point: RatePoint | undefined, note?: string): Indicator {
  return {
    id,
    label,
    group: "금리",
    unit: "%",
    digits: 2,
    changeIn: "bp",
    value: point?.value,
    prev: point?.prev?.value,
    asOf: point?.date,
    note: point?.prev ? `${note ? `${note} · ` : ""}직전 변경 ${point.prev.date.slice(0, 7)}` : note,
    error: point ? undefined : "데이터 없음",
  };
}

/** All dashboard indicators; each one fails independently. */
export async function loadIndicators(): Promise<Indicator[]> {
  const fed = fetchFred("DFEDTARU")
    .then((p) => rateIndicator("fed", "미국 기준금리", p, "상단"))
    .catch((err) => ({ ...rateIndicator("fed", "미국 기준금리", undefined), error: errText(err) }));

  const korea: Promise<Indicator[]> = config.ecosApiKey
    ? fetchKoreanRates(config.ecosApiKey)
        .then(({ base, ktb10 }) => {
          const kr10 = rateIndicator("kr10y", "국고채 10년", ktb10);
          // Daily yields change every day; show the day-over-day move rather than "last change".
          return [rateIndicator("krbase", "한국 기준금리", base), { ...kr10, note: undefined }];
        })
        .catch((err) => [
          { ...rateIndicator("krbase", "한국 기준금리", undefined), error: errText(err) },
          { ...rateIndicator("kr10y", "국고채 10년", undefined), error: errText(err) },
        ])
    : Promise.resolve([
        { ...rateIndicator("krbase", "한국 기준금리", undefined), error: undefined, note: "ECOS_API_KEY 설정 시 표시" },
        { ...rateIndicator("kr10y", "국고채 10년", undefined), error: undefined, note: "ECOS_API_KEY 설정 시 표시" },
      ]);

  const [kr, fedInd, ...yahoo] = await Promise.all([korea, fed, ...YAHOO.map(yahooIndicator)]);
  const byId = new Map([...kr, fedInd, ...yahoo].map((i) => [i.id, i]));
  const order = ["krbase", "fed", "kr10y", "us10y", "usdkrw", "jpykrw", "usdjpy", "gold", "wti", "brent"];
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

export function formatNumber(value: number, digits: number): string {
  return value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "+12bp" / "-0.35%" style change label, or undefined without a previous value. */
export function changeLabel(ind: Pick<Indicator, "value" | "prev" | "changeIn">): { text: string; dir: -1 | 0 | 1 } | undefined {
  if (ind.value === undefined || ind.prev === undefined || ind.prev === 0) return undefined;
  const diff = ind.value - ind.prev;
  const dir = Math.abs(diff) < 1e-9 ? 0 : diff > 0 ? 1 : -1;
  const sign = dir > 0 ? "+" : dir < 0 ? "−" : "";
  if (ind.changeIn === "bp") return { text: `${sign}${Math.round(Math.abs(diff) * 100)}bp`, dir };
  return { text: `${sign}${Math.abs((diff / ind.prev) * 100).toFixed(2)}%`, dir };
}
