import Link from "next/link";
import { HoldingForm } from "@/components/invest/HoldingForm";
import { InboxNotice } from "@/components/invest/InboxNotice";
import { ReportView } from "@/components/invest/ReportView";
import { RunSkill } from "@/components/invest/RunSkill";
import { SubmitButton } from "@/components/SubmitButton";
import { getCtx } from "@/lib/context";
import { deleteHolding, saveHolding, setFx, setQuote } from "@/lib/invest/actions";
import { hhiLabel, krw, money, pct, signedPct, portfolioMetrics } from "@/lib/invest/calc";
import { apiEnabled } from "@/lib/invest/claude";
import { SKILLS } from "@/lib/invest/skills";
import { loadInvest } from "@/lib/invest/store";
import { ASSET_LABEL, type AssetType } from "@/lib/invest/types";

/** How each asset type can (and can't) be evaluated. */
const YARDSTICK: Record<AssetType, string> = {
  stock: "펀더멘털·역DCF로 평가합니다. 종목 리서치의 세 가지 스킬을 쓰세요.",
  index_etf: "개별 기업이 아니라 지수 전체(합산 이익·밸류에이션)로 봅니다. 구성종목을 입력하면 개별주와의 중복이 계산됩니다.",
  sector_etf: "섹터 사이클과 상위 구성종목 집중도를 봅니다. 구성종목을 입력하면 중복이 계산됩니다.",
  bond_etf: "듀레이션(금리 민감도)과 신용등급으로 봅니다. 역DCF 대상이 아닙니다.",
  commodity_etf: "펀더멘털(이익·현금흐름)이 없습니다. 실질금리·달러 방향·수급 같은 다른 잣대로 봅니다.",
  cash: "평가 대상이 아닙니다. 비중과 환율 노출 계산에만 쓰입니다.",
};

function Bar({ value, className = "bg-accent" }: { value: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(Math.max(value, 0), 1) * 100}%` }} />
    </div>
  );
}

export default async function PortfolioPage({ searchParams }: PageProps<"/invest/portfolio">) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const { db, inbox } = await loadInvest(ctx);
  const m = portfolioMetrics(db.holdings, db.quotes, db.fx);
  const editing = typeof sp.edit === "string" ? db.holdings.find((h) => h.id === sp.edit) : undefined;
  const cockpit = db.reports.filter((r) => r.skill === "cockpit").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const types = [...new Set(db.holdings.map((h) => h.assetType))];

  const stats = [
    { label: "평가액", value: krw(m.totalKrw) },
    { label: "평가손익", value: `${krw(m.pnlKrw)} (${signedPct(m.returnPct)})`, tone: m.pnlKrw > 0 ? "text-danger" : m.pnlKrw < 0 ? "text-accent" : "" },
    { label: "집중도 HHI", value: `${Math.round(m.hhi).toLocaleString("ko-KR")} · ${hhiLabel(m.hhi)}`, hint: `유효 종목 수 ${m.effectiveN.toFixed(1)}개` },
    { label: "해외자산 비중", value: pct(m.fxExposure), hint: `원/달러 ±10% → ±${krw(m.fxShock10Krw)}` },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">포트폴리오 콕핏</h1>
          <p className="text-sm text-muted">모든 수치는 앱이 코드로 계산합니다. 비중을 정해 주지 않습니다.</p>
        </div>
        <RunSkill skill="cockpit" trigger={SKILLS.cockpit.trigger()} label="AI 해석 받기" apiEnabled={apiEnabled()} />
      </div>

      <InboxNotice inbox={inbox} />

      {(m.missingFx || m.unpriced.length > 0) && (
        <div className="card border-warn/40 p-4 text-sm text-warn">
          {m.missingFx && <p>원/달러 환율이 없어 달러 자산이 0원으로 계산됩니다. 아래에서 환율을 입력하거나 브리핑을 갱신하세요.</p>}
          {m.unpriced.length > 0 && <p>시세 없음(평균단가로 계산): {m.unpriced.join(", ")}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-muted">{s.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${s.tone ?? ""}`}>{s.value}</p>
            {s.hint && <p className="text-xs text-muted">{s.hint}</p>}
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <h2 className="p-4 pb-2 font-semibold">보유 종목</h2>
        {m.positions.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">아래에서 보유 종목을 추가하세요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">종목</th>
                  <th className="px-2 py-2 text-right font-medium">수량</th>
                  <th className="px-2 py-2 text-right font-medium">평균단가 → 현재가</th>
                  <th className="px-2 py-2 text-right font-medium">평가액</th>
                  <th className="w-28 px-2 py-2 font-medium">비중</th>
                  <th className="px-2 py-2 text-right font-medium">수익률</th>
                  <th className="px-2 py-2 text-right font-medium" title="전체 원가 대비 이 종목 손익">기여도</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {m.positions.map((p) => (
                  <tr key={p.holding.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/invest/stocks/${encodeURIComponent(p.holding.ticker)}`} className="font-medium hover:underline">{p.holding.ticker}</Link>
                      <span className="block text-xs text-muted">{p.holding.name} · {ASSET_LABEL[p.holding.assetType]}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.holding.quantity.toLocaleString("ko-KR")}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span className="text-muted">{money(p.holding.avgCost, p.holding.currency)}</span> → {p.priced ? money(p.price, p.holding.currency) : <span className="text-warn">확인 필요</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{krw(p.valueKrw)}</td>
                    <td className="px-2 py-2">
                      <span className="text-xs tabular-nums">{pct(p.weight)}</span>
                      <Bar value={p.weight} />
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums ${p.returnPct > 0 ? "text-danger" : p.returnPct < 0 ? "text-accent" : ""}`}>
                      {signedPct(p.returnPct)}
                      {p.localReturnPct !== undefined && p.fxReturnPct !== undefined && (
                        <span className="block text-xs text-muted">주가 {signedPct(p.localReturnPct)} · 환율 {signedPct(p.fxReturnPct)}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{signedPct(p.contribution, 2)}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/invest/portfolio?edit=${p.holding.id}#holding-form`} className="text-xs text-muted hover:underline">수정</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {m.positions.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          {[
            { title: "자산 유형", rows: m.byAssetType.map((x) => ({ key: x.type, label: ASSET_LABEL[x.type], weight: x.weight })) },
            { title: "통화", rows: m.byCurrency.map((x) => ({ key: x.currency, label: x.currency === "KRW" ? "원화" : "달러", weight: x.weight })) },
            { title: "섹터 · 테마", rows: m.byTheme.map((x) => ({ key: x.name, label: x.name, weight: x.weight })) },
          ].map((g) => (
            <section key={g.title} className="card p-4">
              <h2 className="mb-3 font-semibold">{g.title}</h2>
              <ul className="grid gap-2">
                {g.rows.map((r) => (
                  <li key={r.key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="truncate">{r.label}</span>
                      <span className="tabular-nums text-muted">{pct(r.weight)}</span>
                    </div>
                    <Bar value={r.weight} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {m.positions.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="font-semibold">실질 노출 (ETF 경유 포함)</h2>
            <p className="mb-3 text-xs text-muted">ETF에 입력한 구성종목 비중으로 계산합니다. 입력하지 않은 ETF는 ETF 자체로 집계됩니다.</p>
            {m.hiddenOverlap.length > 0 && (
              <p className="mb-3 rounded-lg border border-warn/40 bg-warn/5 p-2 text-xs text-warn">
                숨은 중복: {m.hiddenOverlap.map((e) => `${e.ticker}(직접 ${pct(e.direct)} + ${e.sources.join("·")} 경유 ${pct(e.viaEtf)})`).join(", ")}
              </p>
            )}
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-1.5 font-medium">종목</th>
                  <th className="py-1.5 text-right font-medium">직접</th>
                  <th className="py-1.5 text-right font-medium">ETF 경유</th>
                  <th className="py-1.5 text-right font-medium">합계</th>
                </tr>
              </thead>
              <tbody>
                {m.exposures.slice(0, 12).map((e) => (
                  <tr key={e.ticker} className="border-b border-line last:border-0">
                    <td className="py-1.5">{e.ticker}{e.direct > 0 && e.viaEtf > 0 && <span className="chip ml-1 bg-warn/15 text-warn">중복</span>}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{e.direct ? pct(e.direct) : "–"}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{e.viaEtf ? pct(e.viaEtf) : "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{pct(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">자산 유형별 평가 잣대</h2>
            <ul className="grid gap-3 text-sm">
              {types.map((t) => (
                <li key={t}>
                  <span className="font-medium">{ASSET_LABEL[t]}</span>
                  <p className="text-xs text-muted">{YARDSTICK[t]}</p>
                </li>
              ))}
            </ul>
            {m.fxExposure > 0 && (
              <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs">
                <p className="font-medium">환율 시나리오</p>
                <p className="mt-1 text-muted">
                  원/달러 {db.fx ? `${db.fx.rate.toLocaleString("ko-KR")}원` : "(없음)"} 기준. 달러 자산 {pct(m.fxExposure)}이므로 환율 +10%면 원화 평가액 +{krw(m.fxShock10Krw)}, −10%면 −{krw(m.fxShock10Krw)}
                  (전체 대비 ±{pct(m.fxExposure * 0.1)}).
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {cockpit && (
        <section className="card p-5">
          <ReportView report={cockpit} returnTo="/invest/portfolio" />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section id="holding-form" className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{editing ? `${editing.ticker} 수정` : "보유 종목 추가"}</h2>
            {editing && <Link href="/invest/portfolio" className="text-xs text-muted hover:underline">취소</Link>}
          </div>
          <HoldingForm key={editing?.id ?? "new"} action={saveHolding} holding={editing} returnTo="/invest/portfolio" />
          {editing && (
            <form action={deleteHolding} className="mt-3">
              <input type="hidden" name="id" value={editing.id} />
              <SubmitButton className="btn-danger" confirm={`${editing.ticker}를 포트폴리오에서 삭제할까요?`}>종목 삭제</SubmitButton>
            </form>
          )}
        </section>

        <div className="grid content-start gap-6">
          <section className="card p-5">
            <h2 className="mb-1 font-semibold">원/달러 환율</h2>
            <p className="mb-3 text-xs text-muted">브리핑·갱신이 채웁니다. 급하면 직접 입력하세요.</p>
            <form action={setFx} className="grid gap-2">
              <input name="rate" type="number" step="0.01" min={100} className="input" placeholder="예: 1385.20" defaultValue={db.fx?.rate} required />
              <input name="source" className="input" placeholder="출처 (URL, 비우면 '수동 입력')" />
              <SubmitButton>저장</SubmitButton>
            </form>
          </section>
          <section className="card p-5">
            <h2 className="mb-1 font-semibold">시세 직접 입력</h2>
            <form action={setQuote} className="grid gap-2">
              <select name="ticker" className="input" required>
                {[...db.holdings.map((h) => h.ticker), ...db.watchlist].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input name="price" type="number" step="any" min={0} className="input" placeholder="현재가" required />
                <input name="changePct" type="number" step="any" className="input" placeholder="전일 대비 %" />
              </div>
              <input name="source" className="input" placeholder="출처 (URL, 비우면 '수동 입력')" />
              <SubmitButton>저장</SubmitButton>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
