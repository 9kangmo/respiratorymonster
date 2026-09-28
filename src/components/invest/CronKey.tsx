"use client";

import { useState } from "react";
import { makeCronKey } from "@/lib/invest/actions";

export function CronKey() {
  const [key, setKey] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className="btn-ghost justify-self-start"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setKey(await makeCronKey());
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "만드는 중…" : "자동 실행 키 만들기"}
      </button>
      {key && (
        <>
          <textarea readOnly rows={3} className="input font-mono text-xs break-all" value={key} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="btn-primary justify-self-start"
            onClick={async () => {
              await navigator.clipboard.writeText(key).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? "복사됨" : "복사"}
          </button>
          <p className="text-xs text-warn">
            이 키는 내 구글 계정으로 Drive의 앱 데이터에 접근할 수 있습니다. Vercel 환경 변수에만 넣고 다른 곳에 공유하지 마세요.
            SESSION_SECRET을 바꾸면 키를 다시 만들어야 합니다.
          </p>
        </>
      )}
    </div>
  );
}
