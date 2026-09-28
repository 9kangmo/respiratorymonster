import type { InboxReport } from "@/lib/invest/store";

/** Shows what was auto-imported from the Claude Code inbox folder on this page load. */
export function InboxNotice({ inbox }: { inbox: InboxReport[] }) {
  if (inbox.length === 0) return null;
  return (
    <section className="card border-ok/40 p-4 text-sm">
      <h2 className="mb-1 font-medium">Claude Code 결과 {inbox.length}건을 가져왔습니다</h2>
      <ul className="grid gap-1">
        {inbox.map((r) => (
          <li key={r.file}>
            <code className="text-xs">{r.file}</code> —{" "}
            {r.error ? <span className="text-danger">{r.error}</span> : <span className="text-ok">{r.summary}</span>}
            {r.warnings.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-warn">
                {r.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
