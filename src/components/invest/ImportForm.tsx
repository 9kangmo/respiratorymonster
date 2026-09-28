"use client";

import { useActionState } from "react";
import { importBundle, type ImportState } from "@/lib/invest/actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importBundle, null);
  return (
    <form action={action} className="grid gap-3">
      <div>
        <label className="label" htmlFor="bundle">Claude Code 결과 붙여 넣기</label>
        <textarea
          id="bundle"
          name="bundle"
          rows={8}
          className="input font-mono text-xs"
          placeholder={'```json\n{ "format": "rm-invest-bundle/1", "quotes": [...], "reports": [...] }\n```\n\n응답 전체를 붙여 넣어도 마지막 json 블록만 읽습니다.'}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".json,application/json,text/plain" className="text-xs text-muted file:mr-2 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-ink" />
        <button type="submit" className="btn-primary ml-auto" disabled={pending} aria-busy={pending}>
          {pending ? "가져오는 중…" : "가져오기"}
        </button>
      </div>
      {state && (
        <div className={`rounded-lg border p-3 text-sm ${state.ok ? "border-ok/40" : "border-danger/40"}`}>
          <p className={state.ok ? "text-ok" : "text-danger"}>{state.message}</p>
          {state.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-warn">
              {state.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
