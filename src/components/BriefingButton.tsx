"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshBriefing } from "@/lib/actions";

export function BriefingButton({ hasBriefing }: { hasBriefing: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button
        type="button"
        className="btn-primary py-1.5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await refreshBriefing();
            if (!result.ok) setError(result.error);
            router.refresh();
          })
        }
      >
        {pending ? "정리 중…" : hasBriefing ? "다시 정리" : "AI로 정리하기"}
      </button>
    </div>
  );
}
