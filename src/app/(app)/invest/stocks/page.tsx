import Link from "next/link";
import { InboxNotice } from "@/components/invest/InboxNotice";
import { SubmitButton } from "@/components/SubmitButton";
import { config } from "@/lib/config";
import { getCtx } from "@/lib/context";
import { diffDays, relativeLabel, todayIn } from "@/lib/dates";
import { addWatch, removeWatch, saveThemes } from "@/lib/invest/actions";
import { money } from "@/lib/invest/calc";
import { loadInvest } from "@/lib/invest/store";
import { ASSET_LABEL, type SkillId } from "@/lib/invest/types";

const COLUMNS: { skill: SkillId; label: string }[] = [
  { skill: "decoder", label: "해독기" },
  { skill: "story", label: "스토리" },
  { skill: "price", label: "가격" },
];

export default async function StocksPage() {
  const ctx = await getCtx();
  const { db, inbox } = await loadInvest(ctx);
  const today = todayIn(config.timeZone);
  const rows = [
    ...db.holdings.map((h) => ({ ticker: h.ticker, name: h.name, kind: ASSET_LABEL[h.assetType], held: true })),
    ...db.watchlist.map((t) => ({ ticker: t, name: "", kind: "관심 종목", held: false })),
  ];
  const lastDate = (ticker: string, skill: SkillId) => {
    const dates = [
      ...db.reports.filter((r) => r.ticker === ticker && r.skill === skill).map((r) => r.createdAt),
      ...(skill === "price" ? db.valuations.filter((v) => v.ticker === ticker).map((v) => v.createdAt) : []),
    ].sort();
    return dates.at(-1)?.slice(0, 10);
  };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">종목 리서치</h1>
        <p className="text-sm text-muted">좁고 깊게, 필요할 때만. 종목을 눌러 기업 해독기 · 스토리 리더 · 가격 판독기를 실행하세요.</p>
      </div>

      <InboxNotice inbox={inbox} />

      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">보유 종목이나 관심 종목이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">종목</th>
                  <th className="px-2 py-2 text-right font-medium">현재가</th>
                  {COLUMNS.map((c) => (
                    <th key={c.skill} className="px-2 py-2 font-medium">{c.label}</th>
                  ))}
                  <th className="px-2 py-2 font-medium">다음 실적</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const q = db.quotes[r.ticker];
                  const next = db.events.find((e) => e.ticker === r.ticker && e.type === "earnings" && e.date >= today);
                  return (
                    <tr key={r.ticker} className="border-b border-line last:border-0">
                      <td className="px-4 py-2">
                        <Link href={`/invest/stocks/${encodeURIComponent(r.ticker)}`} className="font-medium hover:underline">{r.ticker}</Link>
                        <span className="ml-2 text-xs text-muted">{r.name} {r.kind}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{q ? money(q.price, q.currency) : "–"}</td>
                      {COLUMNS.map((c) => {
                        const d = lastDate(r.ticker, c.skill);
                        const age = d ? diffDays(d, today) : undefined;
                        return (
                          <td key={c.skill} className={`px-2 py-2 text-xs ${age === undefined ? "text-muted" : age > 90 ? "text-warn" : ""}`}>
                            {d ? d.slice(2).replace(/-/g, ".") : "없음"}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-xs">{next ? relativeLabel(next.date, today) : <span className="text-muted">–</span>}</td>
                      <td className="px-4 py-2 text-right">
                        {!r.held && (
                          <form action={removeWatch}>
                            <input type="hidden" name="ticker" value={r.ticker} />
                            <SubmitButton className="text-xs text-muted hover:text-danger">해제</SubmitButton>
                          </form>
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

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">관심 종목 추가</h2>
          <p className="mb-3 text-xs text-muted">보유하지 않은 종목도 리서치하고 브리핑에서 챙길 수 있습니다.</p>
          <form action={addWatch} className="flex gap-2">
            <input name="ticker" required className="input uppercase" placeholder="MSFT, 000660" />
            <SubmitButton>추가</SubmitButton>
          </form>
        </section>
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">관심 테마</h2>
          <p className="mb-3 text-xs text-muted">일일 브리핑이 이 테마의 뉴스를 함께 찾습니다. 쉼표로 구분.</p>
          <form action={saveThemes} className="flex gap-2">
            <input name="themes" className="input" defaultValue={db.themes.join(", ")} placeholder="AI 반도체, 원전, 금리" />
            <SubmitButton>저장</SubmitButton>
          </form>
        </section>
      </div>
    </div>
  );
}
