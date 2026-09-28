import Link from "next/link";
import { InboxNotice } from "@/components/invest/InboxNotice";
import { ReportView } from "@/components/invest/ReportView";
import { RunSkill } from "@/components/invest/RunSkill";
import { SubmitButton } from "@/components/SubmitButton";
import { config } from "@/lib/config";
import { getCtx } from "@/lib/context";
import { diffDays, formatDate, relativeLabel, todayIn } from "@/lib/dates";
import { eventToCalendar, deleteEvent } from "@/lib/invest/actions";
import { money, pct, portfolioMetrics } from "@/lib/invest/calc";
import { apiEnabled } from "@/lib/invest/claude";
import { actionSignals, type ActionSignal } from "@/lib/invest/signals";
import { SKILLS } from "@/lib/invest/skills";
import { loadInvest } from "@/lib/invest/store";
import { SKILL_LABEL } from "@/lib/invest/types";

const EVENT_HORIZON = 30;
const NEWS_DAYS = 3;
const LEVEL_STYLE = { high: "bg-danger", medium: "bg-warn", low: "bg-muted" };

function signalHref(s: ActionSignal): string {
  if (s.skill === "cockpit") return "/invest/portfolio";
  if (s.skill === "refresh") return "/invest#refresh";
  return s.ticker ? `/invest/stocks/${encodeURIComponent(s.ticker)}${s.skill ? `#${s.skill}` : ""}` : "/invest";
}

export default async function DailyBrief() {
  const ctx = await getCtx();
  const { db, inbox } = await loadInvest(ctx);
  const today = todayIn(config.timeZone);
  const metrics = portfolioMetrics(db.holdings, db.quotes, db.fx);
  const signals = actionSignals(db, metrics, today);
  const api = apiEnabled();
  const brief = db.reports.filter((r) => r.skill === "brief").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const events = db.events.filter((e) => e.date >= today && diffDays(today, e.date) <= EVENT_HORIZON);
  const news = db.news.filter((n) => diffDays(n.asOf.slice(0, 10), today) <= NEWS_DAYS).slice(0, 30);
  const watched = db.watchlist.filter((t) => db.quotes[t]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{formatDate(today)} 브리핑</h1>
          <p className="text-sm text-muted">
            마지막 갱신: {db.lastRefreshAt ? new Date(db.lastRefreshAt).toLocaleString("ko-KR", { timeZone: config.timeZone, dateStyle: "medium", timeStyle: "short" }) : "없음"}
          </p>
        </div>
        <div id="refresh" className="grid gap-2">
          <RunSkill skill="brief" trigger={SKILLS.brief.trigger()} label="오늘 브리핑 만들기" apiEnabled={api} />
          <RunSkill skill="refresh" trigger={SKILLS.refresh.trigger()} label="시세·뉴스만 갱신" apiEnabled={api} compact />
        </div>
      </div>

      <InboxNotice inbox={inbox} />

      {db.holdings.length === 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-medium">보유 종목을 먼저 입력하세요</p>
            <p className="text-sm text-muted">계좌 연동은 하지 않습니다. 보유 현황은 직접 입력하고, 시세·뉴스는 브리핑이 채웁니다.</p>
          </div>
          <Link href="/invest/portfolio" className="btn-primary">포트폴리오 입력</Link>
        </div>
      )}

      <section className="card p-4">
        <h2 className="font-semibold">오늘의 액션 신호</h2>
        <p className="mb-3 text-xs text-muted">결론이 아니라 &lsquo;어디를 더 파볼지&rsquo;입니다. 매매 신호는 내지 않습니다.</p>
        {signals.length === 0 && <p className="text-sm text-muted">오늘은 특별히 더 파볼 곳이 없습니다.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {signals.map((s) => (
            <li key={s.key}>
              <Link href={signalHref(s)} className="flex h-full gap-3 rounded-lg border border-line p-3 hover:bg-surface-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_STYLE[s.level]}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {s.title}
                    {s.skill && s.skill !== "refresh" && <span className="chip ml-2 bg-accent/15 text-accent">{SKILL_LABEL[s.skill]}</span>}
                  </span>
                  <span className="block text-xs text-muted">{s.reason}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between p-4 pb-2">
            <h2 className="font-semibold">보유·관심 종목 밤사이 움직임</h2>
            <Link href="/invest/portfolio" className="text-xs text-muted hover:underline">콕핏 →</Link>
          </div>
          {metrics.positions.length + watched.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted">종목이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 font-medium">종목</th>
                    <th className="px-2 py-2 text-right font-medium">현재가</th>
                    <th className="px-2 py-2 text-right font-medium">전일 대비</th>
                    <th className="px-2 py-2 text-right font-medium">비중</th>
                    <th className="px-4 py-2 text-right font-medium">기준</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...metrics.positions.map((p) => ({ ticker: p.holding.ticker, name: p.holding.name, weight: p.weight as number | undefined })),
                    ...watched.map((t) => ({ ticker: t, name: "관심 종목", weight: undefined })),
                  ].map((row) => {
                    const q = db.quotes[row.ticker];
                    const ch = q?.changePct;
                    return (
                      <tr key={row.ticker} className="border-b border-line last:border-0">
                        <td className="px-4 py-2">
                          <Link href={`/invest/stocks/${encodeURIComponent(row.ticker)}`} className="font-medium hover:underline">{row.ticker}</Link>
                          <span className="ml-2 text-xs text-muted">{row.name}</span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{q ? money(q.price, q.currency) : <span className="text-warn">확인 필요</span>}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${ch === undefined ? "text-muted" : ch > 0 ? "text-danger" : ch < 0 ? "text-accent" : ""}`}>
                          {ch === undefined ? "–" : `${ch > 0 ? "+" : ""}${ch.toFixed(2)}%`}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted">{row.weight === undefined ? "" : pct(row.weight)}</td>
                        <td className="px-4 py-2 text-right text-xs text-muted">
                          {q ? (
                            /^https?:/.test(q.source) ? (
                              <a href={q.source} target="_blank" rel="noreferrer noopener" className="hover:underline">{q.asOf.slice(5, 10)}</a>
                            ) : (
                              <span title={q.source}>{q.asOf.slice(5, 10)}</span>
                            )
                          ) : (
                            ""
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-semibold">환율 · 매크로</h2>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt>원/달러</dt>
              <dd className="tabular-nums">
                {db.fx ? (
                  <>
                    {db.fx.rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원
                    {db.fx.changePct !== undefined && <span className="ml-1 text-xs text-muted">({db.fx.changePct > 0 ? "+" : ""}{db.fx.changePct.toFixed(2)}%)</span>}
                  </>
                ) : (
                  <span className="text-warn">확인 필요</span>
                )}
              </dd>
            </div>
            {db.macro.map((m) => (
              <div key={m.name} className="flex justify-between gap-2">
                <dt className="min-w-0 truncate">
                  {/^https?:/.test(m.source) ? <a href={m.source} target="_blank" rel="noreferrer noopener" className="hover:underline">{m.name}</a> : m.name}
                </dt>
                <dd className="shrink-0 tabular-nums">
                  {m.value}
                  {m.change && <span className="ml-1 text-xs text-muted">({m.change})</span>}
                </dd>
              </div>
            ))}
          </dl>
          {metrics.fxExposure > 0 && (
            <p className="mt-3 text-xs text-muted">해외자산 비중 {pct(metrics.fxExposure)} — 환율 1% 변동 시 원화 평가액 약 {pct(metrics.fxExposure / 100, 2)} 변동.</p>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">다가오는 이벤트 · {EVENT_HORIZON}일</h2>
          {events.length === 0 && <p className="text-sm text-muted">예정된 이벤트가 없습니다.</p>}
          <ul className="grid gap-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-sm">
                <span className="w-12 shrink-0 text-xs leading-5 text-muted">{relativeLabel(e.date, today)}</span>
                <span className="min-w-0 flex-1">
                  {e.ticker && <Link href={`/invest/stocks/${encodeURIComponent(e.ticker)}`} className="mr-1 font-medium hover:underline">{e.ticker}</Link>}
                  {e.title}
                  <span className="block text-xs text-muted">{formatDate(e.date)}</span>
                </span>
                {e.taskId ? (
                  <span className="chip shrink-0 bg-ok/15 text-ok" title="연구 일정 앱 '투자 일정' 프로젝트에 등록됨">캘린더</span>
                ) : (
                  <form action={eventToCalendar}>
                    <input type="hidden" name="id" value={e.id} />
                    <SubmitButton className="btn-ghost px-2 py-1 text-xs" title="구글캘린더에 등록">+ 캘린더</SubmitButton>
                  </form>
                )}
                <form action={deleteEvent}>
                  <input type="hidden" name="id" value={e.id} />
                  <SubmitButton className="px-1 text-xs text-muted hover:text-danger" title="삭제">✕</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-2 font-semibold">관심 테마 · 종목 뉴스</h2>
          {news.length === 0 && <p className="text-sm text-muted">최근 {NEWS_DAYS}일 뉴스가 없습니다. 브리핑을 실행하세요.</p>}
          <ul className="grid gap-3">
            {news.map((n) => (
              <li key={n.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`chip ${n.kind === "fact" ? "bg-ok/15 text-ok" : "bg-accent/15 text-accent"}`}>{n.kind === "fact" ? "사실" : "해석"}</span>
                  {n.ticker && <span className="chip bg-surface-2">{n.ticker}</span>}
                  {n.theme && <span className="chip bg-surface-2 text-muted">{n.theme}</span>}
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noreferrer noopener" className="font-medium hover:underline">{n.title}</a>
                  ) : (
                    <span className="font-medium">{n.title}</span>
                  )}
                </div>
                {n.summary && <p className="mt-0.5 text-xs text-muted">{n.summary}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {brief && (
        <section className="card p-5">
          <ReportView report={brief} returnTo="/invest" />
        </section>
      )}
    </div>
  );
}
