"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncNow } from "@/lib/actions";

const AUTO_SYNC_MS = 5 * 60 * 1000;

function summary(r: { imported: number; updated: number; unlinked: number; pushed: number; failed: number }) {
  const parts = [
    r.imported && `가져옴 ${r.imported}`,
    r.updated && `갱신 ${r.updated}`,
    r.unlinked && `연결 해제 ${r.unlinked}`,
    r.pushed && `보냄 ${r.pushed}`,
    r.failed && `실패 ${r.failed}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "변경 없음";
}

/** Manual sync button that also syncs automatically when the last sync is stale. */
export function SyncButton({ lastSyncAt }: { lastSyncAt?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const autoRan = useRef(false);

  const run = () =>
    start(async () => {
      const result = await syncNow();
      setMessage(result.ok ? summary(result.report) : `동기화 실패: ${result.error}`);
      router.refresh();
    });

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const stale = !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > AUTO_SYNC_MS;
    if (stale) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2">
      {message && <span className="hidden text-xs text-muted sm:inline">{message}</span>}
      <button type="button" onClick={run} disabled={pending} className="btn-ghost py-1.5" title="구글캘린더와 동기화">
        <span className={pending ? "animate-spin" : ""} aria-hidden>
          ⟳
        </span>
        {pending ? "동기화 중" : "동기화"}
      </button>
    </div>
  );
}
