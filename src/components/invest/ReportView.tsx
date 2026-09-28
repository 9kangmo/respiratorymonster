import { SubmitButton } from "@/components/SubmitButton";
import { deleteReport } from "@/lib/invest/actions";
import { SKILL_LABEL, type Report } from "@/lib/invest/types";
import { Markdown } from "./Markdown";

const ORIGIN_LABEL = { "claude-code": "Claude Code", api: "Claude API", manual: "수동" } as const;

export function ReportMeta({ report }: { report: Report }) {
  return (
    <span className="text-xs text-muted">
      {SKILL_LABEL[report.skill]} · {new Date(report.createdAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })} · {ORIGIN_LABEL[report.origin]}
    </span>
  );
}

export function ReportView({ report, returnTo }: { report: Report; returnTo: string }) {
  return (
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{report.title}</h3>
          <ReportMeta report={report} />
        </div>
        <form action={deleteReport}>
          <input type="hidden" name="id" value={report.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton className="btn-danger px-2 py-1 text-xs" confirm="이 리포트를 삭제할까요?">삭제</SubmitButton>
        </form>
      </div>
      {report.warnings.length > 0 && (
        <ul className="list-disc rounded-lg border border-warn/40 bg-warn/5 py-2 pr-3 pl-7 text-xs text-warn">
          {report.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <Markdown source={report.markdown} />
      {report.sources.length > 0 && (
        <details className="rounded-lg border border-line px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted">출처 {report.sources.length}개</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {report.sources.map((s, i) => (
              <li key={i} className="break-all">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">{s.label}</a>
                ) : (
                  s.label
                )}
                {s.page !== undefined && <span className="text-muted"> · p.{s.page}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
