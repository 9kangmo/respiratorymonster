"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Two ways to run a skill: in Claude Code (copy the trigger phrase — uses the subscription),
 * or in-app via the Claude API when a key is configured.
 */
export function RunSkill({
  skill,
  ticker,
  trigger,
  label,
  apiEnabled,
  compact = false,
}: {
  skill: string;
  ticker?: string;
  trigger: string;
  label: string;
  apiEnabled: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<{ status: "idle" | "running" | "done" | "error"; message?: string; warnings?: string[] }>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  async function run() {
    setState({ status: "running" });
    try {
      const res = await fetch("/api/invest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill, ticker }),
      });
      const data = (await res.json().catch(() => ({ ok: false, error: `서버 오류 (${res.status})` }))) as {
        ok: boolean;
        summary?: string;
        warnings?: string[];
        error?: string;
      };
      if (!data.ok) setState({ status: "error", message: data.error });
      else {
        setState({ status: "done", message: data.summary, warnings: data.warnings });
        router.refresh();
      }
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(trigger);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Claude Code에 붙여 넣으세요", trigger);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {apiEnabled && (
          <button type="button" className={compact ? "btn-ghost" : "btn-primary"} onClick={run} disabled={state.status === "running"} aria-busy={state.status === "running"}>
            {state.status === "running" ? "분석 중…" : label}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={copy} title="Claude Code에서 이 문구로 스킬을 실행합니다">
          <code className="text-xs">{trigger}</code>
          <span className="text-xs text-muted">{copied ? "복사됨" : "복사"}</span>
        </button>
      </div>
      {state.status === "running" && <p className="text-xs text-muted">Claude가 웹을 검색하며 자료를 모으는 중입니다. 1~5분 걸릴 수 있어요.</p>}
      {state.status === "done" && <p className="text-xs text-ok">완료: {state.message}</p>}
      {state.status === "error" && <p className="text-xs text-danger">{state.message}</p>}
      {state.warnings && state.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-warn">
          {state.warnings.slice(0, 8).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
