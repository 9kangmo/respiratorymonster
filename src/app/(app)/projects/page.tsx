import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { PROJECT_STATUS_LABEL } from "@/components/TaskBits";
import { createProject } from "@/lib/actions";
import { config } from "@/lib/config";
import { getCtx, readDB } from "@/lib/context";
import { formatDate, todayIn } from "@/lib/dates";
import type { ProjectStatus } from "@/lib/types";

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"];

export default async function ProjectsPage() {
  const ctx = await getCtx();
  const db = await readDB(ctx);
  const today = todayIn(config.timeZone);
  const order: Record<ProjectStatus, number> = { active: 0, paused: 1, done: 2 };
  const projects = [...db.projects].sort((a, b) => order[a.status] - order[b.status] || Number(a.inbox ?? 0) - Number(b.inbox ?? 0));

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">프로젝트</h1>

      <form action={createProject} className="card grid gap-3 p-4 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="name">새 프로젝트</label>
          <input id="name" name="name" required className="input" placeholder="예: 호흡기 바이오마커 연구" />
        </div>
        <div>
          <label className="label" htmlFor="description">설명 (선택)</label>
          <input id="description" name="description" className="input" placeholder="연구 목표, 과제 번호 등" />
        </div>
        <div>
          <label className="label" htmlFor="color">색상</label>
          <input id="color" name="color" type="color" defaultValue={PALETTE[db.projects.length % PALETTE.length]} className="h-9 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1" />
        </div>
        <SubmitButton>만들기</SubmitButton>
      </form>

      {projects.length === 0 && <p className="text-sm text-muted">아직 프로젝트가 없습니다.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const tasks = db.tasks.filter((t) => t.projectId === p.id);
          const doneCount = tasks.filter((t) => t.status === "done").length;
          const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
          const next = tasks
            .filter((t) => t.status !== "done" && t.dueDate && t.dueDate >= today)
            .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="card block p-4 transition hover:border-accent">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                <h2 className="truncate font-semibold">{p.name}</h2>
                <span className="chip ml-auto bg-surface-2 text-muted">{p.inbox ? "수신함" : PROJECT_STATUS_LABEL[p.status]}</span>
              </div>
              {p.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{p.description}</p>}
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted">
                <span>과제 {doneCount}/{tasks.length} 완료</span>
                {next && <span>다음: {formatDate(next.dueDate!, false)}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
