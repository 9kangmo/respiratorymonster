import Link from "next/link";
import { BriefingButton } from "@/components/BriefingButton";
import { Sparkline } from "@/components/Sparkline";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteHolding, saveHolding } from "@/lib/actions";
import { config } from "@/lib/config";
import { getCtx, readDB } from "@/lib/context";
import { nowMs } from "@/lib/dates";
import { changeLabel, formatNumber, loadIndicators, type Indicator, type IndicatorGroup } from "@/lib/market/indicators";
import type { NewsItem } from "@/lib/market/news";
import { loadHoldings, loadMacroNews, newsQuery, position } from "@/lib/market/portfolio";
import type { Holding, Sentiment } from "@/lib/types";

const GROUPS: IndicatorGroup[] = ["금리", "환율", "원자재"];
const SENTIMENT_TONE: Record<Sentiment, string> = { 긍정: "bg-up/10 text-up", 중립: "bg-surface-2 text-muted", 부정: "bg-down/10 text-down" };

const dirTone = (dir: number | undefined) => (dir === undefined || dir === 0 ? "text-muted" : dir > 0 ? "text-up" : "text-down");
const signed = (n: number, digits: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatNumber(Math.abs(n), digits)}`;
const money = (n: number, currency?: string) => formatNumber(n, currency === "KRW" || currency === "JPY" ? 0 : 2);

function ago(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.round(min / 60)}시간 전`;
  return `${Math.round(min / 60 / 24)}일 전`;
}

function timeLabel(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(5).replace("-", "/");
  return new Intl.DateTimeFormat("ko-KR", { timeZone: config.timeZone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

function IndicatorCard({ ind }: { ind: Indicator }) {
  const change = changeLabel(ind);
  return (
    <div className="card flex flex-col gap-1 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted">{ind.label}</p>
        {ind.asOf && <p className="text-[10px] text-muted">{timeLabel(ind.asOf)}</p>}
      </div>
      {ind.value !== undefined ? (
        <>
          <p className="text-xl font-semibold tabular-nums">
            {formatNumber(ind.value, ind.digits)}
            <span className="ml-0.5 text-xs font-normal text-muted">{ind.unit}</span>
          </p>
          <div className="flex items-end justify-between gap-2">
            <span className={`text-xs font-medium tabular-nums ${dirTone(change?.dir)}`}>{change?.text ?? "—"}</span>
            {ind.history && <Sparkline values={ind.history} width={72} height={22} />}
          </div>
        </>
      ) : (
        <p className="py-1 text-lg text-muted">—</p>
      )}
      {(ind.note || ind.error) && <p className={`text-[11px] ${ind.error ? "text-danger" : "text-muted"}`}>{ind.error ?? ind.note}</p>}
    </div>
  );
}

function NewsList({ items, now, label }: { items: (NewsItem & { tag?: string })[]; now: number; label?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted">{label ?? "최근 뉴스가 없습니다."}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((n) => (
        <li key={n.link} className="py-2.5">
          <a href={n.link} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">
            {n.title}
          </a>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {n.tag && <span className="chip bg-surface-2 px-1.5 text-ink">{n.tag}</span>}
            {n.source && <span>{n.source}</span>}
            {n.publishedAt && <span>{ago(n.publishedAt, now)}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

function HoldingForm({ holding }: { holding?: Holding }) {
  return (
    <form action={saveHolding} className="grid gap-3 sm:grid-cols-6 sm:items-end">
      {holding && <input type="hidden" name="id" value={holding.id} />}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="h-name">종목명</label>
        <input id="h-name" name="name" required defaultValue={holding?.name} className="input" placeholder="삼성전자" />
      </div>
      <div>
        <label className="label" htmlFor="h-symbol">종목코드</label>
        <input id="h-symbol" name="symbol" required defaultValue={holding?.symbol} className="input" placeholder="005930 / AAPL" />
      </div>
      <div>
        <label className="label" htmlFor="h-qty">수량 (선택)</label>
        <input id="h-qty" name="quantity" inputMode="decimal" defaultValue={holding?.quantity} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="h-avg">평균단가 (선택)</label>
        <input id="h-avg" name="avgPrice" inputMode="decimal" defaultValue={holding?.avgPrice} className="input" />
      </div>
      <div className="sm:col-span-1">
        <SubmitButton>{holding ? "저장" : "추가"}</SubmitButton>
      </div>
      <div className="sm:col-span-6">
        <label className="label" htmlFor="h-kw">뉴스 검색어 (선택 · 비우면 종목명)</label>
        <input id="h-kw" name="keywords" defaultValue={holding?.keywords} className="input" placeholder='예: 삼성전자 OR "삼성 반도체"' />
      </div>
    </form>
  );
}

export default async function MarketPage({ searchParams }: PageProps<"/market">) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const db = await readDB(ctx);
  const [indicators, views, macro] = await Promise.all([loadIndicators(), loadHoldings(db.holdings), loadMacroNews()]);
  const now = nowMs();

  const tab = typeof sp.tab === "string" ? sp.tab : "all";
  const editing = typeof sp.edit === "string" ? db.holdings.find((h) => h.id === sp.edit) : undefined;
  const briefing = db.briefing;
  const briefById = new Map(briefing?.holdings.map((b) => [b.holdingId, b]));

  const allNews = views
    .flatMap((v) => v.news.map((n) => ({ ...n, tag: v.holding.name })))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 40);
  const selected = views.find((v) => v.holding.id === tab);
  const tabs = [
    { id: "all", label: "전체" },
    ...views.map((v) => ({ id: v.holding.id, label: v.holding.name, count: v.news.length })),
    { id: "macro", label: "금리·환율·원자재" },
  ];

  const totals = new Map<string, { value: number; cost: number; day: number }>();
  for (const v of views) {
    const p = position(v.holding, v.quote);
    if (!p || !v.holding.quantity) continue;
    const cur = v.quote?.currency ?? "";
    const t = totals.get(cur) ?? { value: 0, cost: 0, day: 0 };
    t.value += p.value;
    t.cost += p.cost ?? p.value;
    t.day += p.dayChange ?? 0;
    totals.set(cur, t);
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">투자 브리핑</h1>
          <p className="text-sm text-muted">보유 종목 뉴스와 금리·환율·금·유가를 한눈에</p>
        </div>
        <p className="text-xs text-muted">시세는 최대 5분, 뉴스는 15분 간격으로 갱신됩니다.</p>
      </div>

      <section className="grid gap-3">
        {GROUPS.map((group) => (
          <div key={group} className="grid gap-2">
            <h2 className="text-sm font-semibold text-muted">{group}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {indicators.filter((i) => i.group === group).map((ind) => (
                <IndicatorCard key={ind.id} ind={ind} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            AI 뉴스 정리
            {briefing && <span className="ml-2 text-xs font-normal text-muted">{ago(briefing.createdAt, now)} 정리됨</span>}
          </h2>
          {config.aiBriefing && db.holdings.length > 0 && <BriefingButton hasBriefing={Boolean(briefing)} />}
        </div>
        {!config.aiBriefing && (
          <p className="text-sm text-muted">
            <code>ANTHROPIC_API_KEY</code>를 설정하면 보유 종목 뉴스와 거시 지표를 Claude가 요약해 줍니다. 설정하지 않아도 아래 뉴스와 지표는 그대로 볼 수 있습니다.
          </p>
        )}
        {config.aiBriefing && !briefing && <p className="text-sm text-muted">종목을 추가한 뒤 &lsquo;AI로 정리하기&rsquo;를 누르세요.</p>}
        {briefing && (
          <div className="grid gap-3 text-sm">
            <p>{briefing.overview}</p>
            <p className="rounded-lg bg-surface-2 p-3 text-muted">
              <span className="mr-1 font-medium text-ink">거시</span>
              {briefing.macro}
            </p>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">보유 종목</h2>
        {views.length === 0 ? (
          <p className="mb-4 text-sm text-muted">아직 종목이 없습니다. 아래에서 보유 종목을 추가하세요.</p>
        ) : (
          <div className="-mx-4 mb-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">종목</th>
                  <th className="py-2 text-right font-medium">현재가</th>
                  <th className="py-2 text-right font-medium">전일 대비</th>
                  <th className="py-2 text-right font-medium">평가액</th>
                  <th className="py-2 text-right font-medium">손익</th>
                  <th className="py-2 pl-3 font-medium">뉴스 분위기</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {views.map(({ holding, quote, quoteError, news }) => {
                  const p = position(holding, quote);
                  const brief = briefById.get(holding.id);
                  const dayDir = p?.dayChangePct === undefined ? undefined : Math.sign(p.dayChangePct);
                  return (
                    <tr key={holding.id} className="align-top">
                      <td className="py-2.5">
                        <Link href={`/market?tab=${holding.id}#news`} className="font-medium hover:underline">{holding.name}</Link>
                        <p className="text-xs text-muted">{holding.symbol} · 뉴스 {news.length}</p>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {quote ? money(quote.price, quote.currency) : <span className="text-xs text-danger" title={quoteError}>시세 없음</span>}
                        {quote?.currency && quote.currency !== "KRW" && <span className="ml-0.5 text-xs text-muted">{quote.currency}</span>}
                      </td>
                      <td className={`py-2.5 text-right tabular-nums ${dirTone(dayDir)}`}>
                        {p?.dayChangePct === undefined ? "—" : `${signed(p.dayChangePct, 2)}%`}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{p && holding.quantity ? money(p.value, quote?.currency) : "—"}</td>
                      <td className={`py-2.5 text-right tabular-nums ${dirTone(p?.pnl === undefined ? undefined : Math.sign(p.pnl))}`}>
                        {p?.pnl === undefined ? "—" : (
                          <>
                            {signed(p.pnl, quote?.currency === "KRW" ? 0 : 2)}
                            <p className="text-xs">{signed(p.pnlPct!, 2)}%</p>
                          </>
                        )}
                      </td>
                      <td className="max-w-xs py-2.5 pl-3">
                        {brief ? (
                          <>
                            <span className={`chip ${SENTIMENT_TONE[brief.sentiment]}`}>{brief.sentiment}</span>
                            <p className="mt-1 text-xs text-muted">{brief.summary}</p>
                          </>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                        <Link href={`/market?edit=${holding.id}#holding-form`} className="text-xs text-muted hover:underline">수정</Link>
                        <form action={deleteHolding} className="inline">
                          <input type="hidden" name="id" value={holding.id} />
                          <SubmitButton className="ml-2 cursor-pointer text-xs text-danger hover:underline" confirm={`${holding.name}을(를) 삭제할까요?`}>삭제</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totals.size > 0 && (
                <tfoot className="border-t border-line text-sm font-medium">
                  {[...totals].map(([cur, t]) => (
                    <tr key={cur}>
                      <td className="py-2">합계 {cur && cur !== "KRW" ? `(${cur})` : ""}</td>
                      <td />
                      <td className={`py-2 text-right tabular-nums ${dirTone(Math.sign(t.day))}`}>{signed(t.day, cur === "KRW" ? 0 : 2)}</td>
                      <td className="py-2 text-right tabular-nums">{money(t.value, cur)}</td>
                      <td className={`py-2 text-right tabular-nums ${dirTone(Math.sign(t.value - t.cost))}`}>
                        {signed(t.value - t.cost, cur === "KRW" ? 0 : 2)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  ))}
                </tfoot>
              )}
            </table>
          </div>
        )}
        <div id="holding-form" className="rounded-lg border border-dashed border-line p-3">
          <p className="mb-2 text-xs font-medium text-muted">
            {editing ? `${editing.name} 수정` : "종목 추가"} · 한국 종목은 6자리 코드(코스닥은 247540.KQ), 미국 종목은 티커(AAPL)
            {editing && <Link href="/market" className="ml-2 hover:underline">취소</Link>}
          </p>
          <HoldingForm key={editing?.id ?? "new"} holding={editing} />
        </div>
      </section>

      <section id="news" className="card p-4">
        <h2 className="mb-3 font-semibold">뉴스</h2>
        <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/market?tab=${t.id}#news`}
              scroll={false}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${tab === t.id ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:text-ink"}`}
            >
              {t.label}
              {"count" in t && <span className="ml-1 opacity-70">{t.count}</span>}
            </Link>
          ))}
        </div>

        {tab === "macro" ? (
          <>
            {macro.error && <p className="text-xs text-danger">뉴스를 불러오지 못했습니다: {macro.error}</p>}
            <NewsList items={macro.news} now={now} />
          </>
        ) : selected ? (
          <div className="grid gap-3">
            {briefById.get(selected.holding.id) && (
              <div className="rounded-lg bg-surface-2 p-3 text-sm">
                <p className="mb-1 flex items-center gap-2 font-medium">
                  <span className={`chip ${SENTIMENT_TONE[briefById.get(selected.holding.id)!.sentiment]}`}>{briefById.get(selected.holding.id)!.sentiment}</span>
                  {briefById.get(selected.holding.id)!.summary}
                </p>
                <ul className="list-disc pl-5 text-muted">
                  {briefById.get(selected.holding.id)!.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted">검색어: {newsQuery(selected.holding)} · 최근 3일</p>
            {selected.newsError && <p className="text-xs text-danger">뉴스를 불러오지 못했습니다: {selected.newsError}</p>}
            <NewsList items={selected.news} now={now} />
          </div>
        ) : (
          <>
            {views.some((v) => v.newsError) && <p className="text-xs text-danger">일부 종목의 뉴스를 불러오지 못했습니다.</p>}
            <NewsList items={allNews} now={now} label={views.length ? undefined : "보유 종목을 추가하면 관련 뉴스가 여기에 모입니다."} />
          </>
        )}
      </section>
    </div>
  );
}
