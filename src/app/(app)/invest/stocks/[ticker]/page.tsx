import Link from "next/link";
import { notFound } from "next/navigation";
import { InboxNotice } from "@/components/invest/InboxNotice";
import { ReportMeta, ReportView } from "@/components/invest/ReportView";
import { RunSkill } from "@/components/invest/RunSkill";
import { ValuationPanel } from "@/components/invest/ValuationPanel";
import { SubmitButton } from "@/components/SubmitButton";
import { config } from "@/lib/config";
import { getCtx } from "@/lib/context";
import { formatDate, relativeLabel, todayIn } from "@/lib/dates";
import { addEvent, addWatch } from "@/lib/invest/actions";
import { normalizeTicker } from "@/lib/invest/bundle";
import { money, pct, portfolioMetrics, signedPct } from "@/lib/invest/calc";
import { apiEnabled } from "@/lib/invest/claude";
import { SKILLS } from "@/lib/invest/skills";
import { loadInvest } from "@/lib/invest/store";
import { ASSET_LABEL, type Report, type SkillId } from "@/lib/invest/types";

const SECTIONS: SkillId[] = ["decoder", "story", "price"];

export default async function StockPage({ params, searchParams }: PageProps<"/invest/stocks/[ticker]">) {
  const { ticker: raw } = await params;
  const sp = await searchParams;
  const ticker = normalizeTicker(decodeURIComponent(raw));
  if (!ticker) notFound();
  const ctx = await getCtx();
  const { db, inbox } = await loadInvest(ctx);
  const today = todayIn(config.timeZone);
  const api = apiEnabled();
  const holding = db.holdings.find((h) => h.ticker === ticker);
  const tracked = Boolean(holding) || db.watchlist.includes(ticker);
  const quote = db.quotes[ticker];
  const position = holding ? portfolioMetrics(db.holdings, db.quotes, db.fx).positions.find((p) => p.holding.id === holding.id) : undefined;
  const events = db.events.filter((e) => e.ticker === ticker && e.date >= today);
  const news = db.news.filter((n) => n.ticker === ticker).slice(0, 6);
  const reportsBy = (skill: SkillId) => db.reports.filter((r) => r.ticker === ticker && r.skill === skill).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const valuation = db.valuations.filter((v) => v.ticker === ticker).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const selected = typeof sp.report === "string" ? sp.report : undefined;
  const here = `/invest/stocks/${encodeURIComponent(ticker)}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/invest/stocks" className="text-sm text-muted hover:underline">← 종목 리서치</Link>
          <h1 className="text-2xl font-semibold">
            {ticker} {holding && <span className="text-base font-normal text-muted">{holding.name}</span>}
          </h1>
          <p className="text-sm text-muted">
            {quote ? (
              <>
                {money(quote.price, quote.currency)}
                {quote.changePct !== undefined && ` (${quote.changePct > 0 ? "+" : ""}${quote.changePct.toFixed(2)}%)`} · {quote.asOf.slice(0, 10)}
              </>
            ) : (
              "시세 없음"
            )}
            {holding && ` · ${ASSET_LABEL[holding.assetType]}`}
            {position && ` · 비중 ${pct(position.weight)} · 수익률 ${signedPct(position.returnPct)}`}
          </p>
        </div>
        {!tracked && (
          <form action={addWatch}>
            <input type="hidden" name="ticker" value={ticker} />
            <SubmitButton className="btn-ghost">관심 종목에 추가</SubmitButton>
          </form>
        )}
      </div>

      <InboxNotice inbox={inbox} />

      {holding && holding.assetType !== "stock" && (
        <p className="card border-warn/40 p-4 text-sm text-warn">
          {ASSET_LABEL[holding.assetType]}은 개별 기업 분석(요약 카드·역DCF) 대상이 아닙니다. 포트폴리오 콕핏의 평가 잣대를 참고하세요.
        </p>
      )}

      {SECTIONS.map((skill) => {
        const def = SKILLS[skill];
        const reports = reportsBy(skill);
        const current = reports.find((r) => r.id === selected) ?? reports[0];
        return (
          <section key={skill} id={skill} className="card grid scroll-mt-20 grid-cols-[minmax(0,1fr)] gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{def.label}</h2>
                <p className="text-sm text-muted">&ldquo;{def.question}&rdquo;</p>
              </div>
              <RunSkill skill={skill} ticker={ticker} trigger={def.trigger(ticker)} label={`${def.label} 실행`} apiEnabled={api} />
            </div>
            {skill === "price" && <ValuationPanel ticker={ticker} valuation={valuation} quote={quote} defaultCurrency={holding?.currency ?? quote?.currency ?? "USD"} />}
            {current ? (
              <div className={`min-w-0 ${skill === "price" ? "border-t border-line pt-4" : ""}`}>
                <ReportView report={current} returnTo={`${here}#${skill}`} />
              </div>
            ) : (
              skill !== "price" && <p className="text-sm text-muted">아직 리포트가 없습니다.</p>
            )}
            {reports.length > 1 && <History reports={reports} currentId={current?.id} here={here} skill={skill} />}
          </section>
        );
      })}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">일정</h2>
          {events.length === 0 && <p className="mb-3 text-sm text-muted">예정된 일정이 없습니다.</p>}
          <ul className="mb-4 grid gap-1 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="w-12 shrink-0 text-xs leading-5 text-muted">{relativeLabel(e.date, today)}</span>
                <span>{e.title} <span className="text-xs text-muted">{formatDate(e.date)}</span></span>
              </li>
            ))}
          </ul>
          <form action={addEvent} className="grid grid-cols-[auto_1fr] gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
            <input type="hidden" name="ticker" value={ticker} />
            <input name="date" type="date" required className="input" />
            <select name="type" className="input" defaultValue="earnings">
              <option value="earnings">실적</option>
              <option value="dividend">배당</option>
              <option value="other">기타</option>
            </select>
            <input name="title" required className="input col-span-2 sm:col-span-1" placeholder="예: 3분기 실적 발표" />
            <SubmitButton className="btn-ghost col-span-2 sm:col-span-1">추가</SubmitButton>
          </form>
        </section>
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">최근 뉴스</h2>
          {news.length === 0 && <p className="text-sm text-muted">뉴스가 없습니다.</p>}
          <ul className="grid gap-2 text-sm">
            {news.map((n) => (
              <li key={n.id}>
                <span className={`chip mr-1 ${n.kind === "fact" ? "bg-ok/15 text-ok" : "bg-accent/15 text-accent"}`}>{n.kind === "fact" ? "사실" : "해석"}</span>
                {n.url ? <a href={n.url} target="_blank" rel="noreferrer noopener" className="hover:underline">{n.title}</a> : n.title}
                <span className="ml-1 text-xs text-muted">{n.asOf.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {holding?.notes && (
        <section className="card p-5 text-sm">
          <h2 className="mb-1 font-semibold">내 메모</h2>
          <p className="whitespace-pre-wrap text-muted">{holding.notes}</p>
        </section>
      )}
    </div>
  );
}

function History({ reports, currentId, here, skill }: { reports: Report[]; currentId?: string; here: string; skill: SkillId }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted">이전 리포트 {reports.length - 1}개</summary>
      <ul className="mt-2 grid gap-1">
        {reports.map((r) => (
          <li key={r.id}>
            <Link href={`${here}?report=${r.id}#${skill}`} className={r.id === currentId ? "font-medium" : "hover:underline"}>
              {r.title}
            </Link>{" "}
            <ReportMeta report={r} />
          </li>
        ))}
      </ul>
    </details>
  );
}
