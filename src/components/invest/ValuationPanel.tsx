import { SubmitButton } from "@/components/SubmitButton";
import { saveValuation } from "@/lib/invest/actions";
import { baseFcfCheck, cagr, findAnomalies, millions, money, pct, reverseDcf, sensitivity, signedPct } from "@/lib/invest/calc";
import type { Currency, Quote, Valuation, ValuationInputs } from "@/lib/invest/types";

const FIELD_LABEL: Record<string, string> = {
  price: "주가",
  sharesOutstanding: "발행주식수",
  netDebt: "순부채",
  baseFcf: "기준 FCF",
  wacc: "WACC",
};

function Src({ value }: { value?: string }) {
  if (!value) return <span className="chip bg-warn/15 text-warn">확인 필요</span>;
  if (/^https?:\/\//.test(value))
    return (
      <a href={value} target="_blank" rel="noreferrer noopener" className="break-all text-accent hover:underline">
        {value.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
      </a>
    );
  return <span className="break-all">{value}</span>;
}

/** Reverse DCF results + input form. Every number here comes from calc.ts. */
export function ValuationPanel({ ticker, valuation, quote, defaultCurrency }: { ticker: string; valuation?: Valuation; quote?: Quote; defaultCurrency: Currency }) {
  const i = valuation?.inputs;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {i ? <Result inputs={i} quote={quote} /> : <p className="text-sm text-muted">아직 역DCF 입력값이 없습니다. 가격 판독기를 실행하거나 아래에 직접 입력하세요.</p>}

      <details className="rounded-lg border border-line px-4 py-3" open={!i}>
        <summary className="cursor-pointer text-sm font-medium">입력값 {i ? "수정해서 다시 계산" : "직접 입력"}</summary>
        <form action={saveValuation} className="mt-3 grid gap-3">
          <input type="hidden" name="ticker" value={ticker} />
          <p className="text-xs text-muted">금액은 <strong>백만 단위</strong>(원 또는 달러), 주식수는 <strong>백만 주</strong>. 순현금이면 순부채에 음수.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field name="currency" label="통화">
              <select id="v-currency" name="currency" className="input" defaultValue={i?.currency ?? defaultCurrency}>
                <option value="USD">USD</option>
                <option value="KRW">KRW</option>
              </select>
            </Field>
            <Num name="price" label="주가 (1주)" value={quote && (!i || quote.asOf > (valuation?.createdAt ?? "")) ? quote.price : i?.price} />
            <Num name="sharesOutstanding" label="희석 주식수 (백만)" value={i?.sharesOutstanding} />
            <Num name="netDebt" label="순부채 (백만)" value={i?.netDebt} />
            <Num name="baseFcf" label="기준 FCF (백만)" value={i?.baseFcf} />
            <Num name="wacc" label="WACC (%)" value={i ? +(i.wacc * 100).toFixed(2) : 9} />
            <Num name="terminalGrowth" label="영구성장률 (%)" value={i ? +(i.terminalGrowth * 100).toFixed(2) : 2.5} />
            <Num name="years" label="예측 기간 (년)" value={i?.years ?? 10} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="fcfHistory" label="FCF 이력 (연도 값, 한 줄에 하나)">
              <textarea id="v-fcfHistory" name="fcfHistory" rows={5} className="input font-mono text-xs" defaultValue={i?.fcfHistory.map((x) => `${x.year} ${x.value}`).join("\n")} placeholder={"2021 93000\n2022 111000"} />
            </Field>
            <Field name="revenueHistory" label="매출 이력 (선택)">
              <textarea id="v-revenueHistory" name="revenueHistory" rows={5} className="input font-mono text-xs" defaultValue={i?.revenueHistory.map((x) => `${x.year} ${x.value}`).join("\n")} placeholder={"2021 365000\n2022 394000"} />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(FIELD_LABEL).map(([k, label]) => (
              <Field key={k} name={`src_${k}`} label={`${label} 출처`}>
                <input id={`v-src_${k}`} name={`src_${k}`} className="input text-xs" defaultValue={i?.sources[k]} placeholder="URL 또는 '10-K FY2025 p.32'" />
              </Field>
            ))}
          </div>
          <div className="flex justify-end">
            <SubmitButton>계산</SubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}

function Field({ name, label, children }: { name: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={`v-${name}`}>{label}</label>
      {children}
    </div>
  );
}

function Num({ name, label, value }: { name: string; label: string; value?: number }) {
  return (
    <Field name={name} label={label}>
      <input id={`v-${name}`} name={name} type="number" step="any" className="input" defaultValue={value} />
    </Field>
  );
}

function Result({ inputs: i, quote }: { inputs: ValuationInputs; quote?: Quote }) {
  const r = reverseDcf(i);
  const fcf3 = cagr(i.fcfHistory, 3);
  const fcf5 = cagr(i.fcfHistory, 5);
  const rev3 = cagr(i.revenueHistory, 3);
  const rev5 = cagr(i.revenueHistory, 5);
  const table = sensitivity(i);
  const anomalies = findAnomalies(i.fcfHistory);
  const baseCheck = baseFcfCheck(i);
  const history = [
    fcf5 && { label: `FCF ${fcf5.from}→${fcf5.to}`, rate: fcf5.rate },
    fcf3 && fcf3.from !== fcf5?.from && { label: `FCF ${fcf3.from}→${fcf3.to}`, rate: fcf3.rate },
    rev5 && { label: `매출 ${rev5.from}→${rev5.to}`, rate: rev5.rate },
    rev3 && rev3.from !== rev5?.from && { label: `매출 ${rev3.from}→${rev3.to}`, rate: rev3.rate },
  ].filter(Boolean) as { label: string; rate: number }[];
  const priceStale = quote && quote.currency === i.currency && Math.abs(quote.price / i.price - 1) > 0.05;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-surface-2 p-4 sm:col-span-1">
          <p className="text-xs text-muted">이 가격이 요구하는 FCF 성장률</p>
          {r.ok ? (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums">연 {pct(r.impliedGrowth)}</p>
              <p className="text-xs text-muted">향후 {i.years}년 · WACC {pct(i.wacc)} · 영구성장 {pct(i.terminalGrowth)}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-warn">{r.reason}</p>
          )}
        </div>
        <div className="rounded-lg border border-line p-4 sm:col-span-2">
          <p className="mb-2 text-xs text-muted">과거 실제 성장률과 비교 (연평균)</p>
          {history.length === 0 && <p className="text-sm text-muted">이력이 부족합니다 (FCF·매출 연도별 값 2개 이상, 양수).</p>}
          <ul className="grid gap-1.5 text-sm">
            {history.map((h) => (
              <li key={h.label} className="flex items-center justify-between gap-2">
                <span className="text-muted">{h.label}</span>
                <span className="tabular-nums">
                  {pct(h.rate)}
                  {r.ok && <span className={`ml-2 text-xs ${r.impliedGrowth > h.rate ? "text-warn" : "text-ok"}`}>요구치와 차이 {signedPct(r.impliedGrowth - h.rate)}p</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            차이가 크다고 결론이 나는 건 아닙니다. 그 성장을 가능하게 할 근거가 있는지를 스토리 리더와 요약 카드에서 확인하세요.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 text-xs text-muted sm:grid-cols-4">
        <span>시가총액 {millions(i.price * i.sharesOutstanding, i.currency)}</span>
        <span>순부채 {millions(i.netDebt, i.currency)}</span>
        <span>기업가치 {millions(i.price * i.sharesOutstanding + i.netDebt, i.currency)}</span>
        {r.ok && <span>가치 중 영구가치 비중 {pct(r.terminalShare)}</span>}
      </div>

      {(priceStale || anomalies.length > 0 || baseCheck) && (
        <ul className="list-disc rounded-lg border border-warn/40 bg-warn/5 py-2 pr-3 pl-7 text-xs text-warn">
          {priceStale && <li>입력 주가 {money(i.price, i.currency)}와 최신 시세 {money(quote!.price, quote!.currency)}가 5% 이상 다릅니다. 입력값을 갱신하세요.</li>}
          {baseCheck && <li>기준 FCF가 최근 3년 평균({millions(baseCheck.baseline, i.currency)}) 대비 {signedPct(baseCheck.deviation, 0)} 벗어납니다. 일회성 요인을 확인하세요.</li>}
          {anomalies.map((a) => (
            <li key={a.year}>{a.year}년 FCF {millions(a.value, i.currency)}가 직전 3년 평균 대비 {signedPct(a.deviation, 0)} — 이상치</li>
          ))}
        </ul>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-muted">민감도: WACC × 영구성장률별 요구 성장률</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-center text-xs tabular-nums">
            <thead>
              <tr className="text-muted">
                <th className="px-2 py-1.5 text-left font-medium">WACC \ 영구성장</th>
                {table.terminalGrowths.map((g) => (
                  <th key={g} className="px-2 py-1.5 font-medium">{pct(g)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.waccs.map((w, wi) => (
                <tr key={w} className="border-t border-line">
                  <td className="px-2 py-1.5 text-left text-muted">{pct(w)}</td>
                  {table.rows[wi].map((v, gi) => {
                    const base = Math.abs(w - i.wacc) < 1e-9 && Math.abs(table.terminalGrowths[gi] - i.terminalGrowth) < 1e-9;
                    return (
                      <td key={gi} className={`px-2 py-1.5 ${base ? "rounded bg-accent/15 font-semibold" : ""}`}>
                        {v === null ? "–" : pct(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-muted">입력값과 출처</summary>
        <table className="mt-2 w-full">
          <tbody>
            {[
              ["price", money(i.price, i.currency)],
              ["sharesOutstanding", `${i.sharesOutstanding.toLocaleString("en-US")}백만 주`],
              ["netDebt", millions(i.netDebt, i.currency)],
              ["baseFcf", millions(i.baseFcf, i.currency)],
              ["wacc", pct(i.wacc)],
            ].map(([k, v]) => (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5 pr-2 text-muted">{FIELD_LABEL[k]}</td>
                <td className="py-1.5 pr-2 tabular-nums">{v}</td>
                <td className="py-1.5"><Src value={i.sources[k]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
