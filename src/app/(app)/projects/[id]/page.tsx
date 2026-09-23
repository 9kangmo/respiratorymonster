import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { STATUS_LABEL, TaskCard } from "@/components/TaskBits";
import { TaskForm } from "@/components/TaskForm";
import { createTask, deleteProject, updateProject } from "@/lib/actions";
import { config } from "@/lib/config";
import { getCtx, readDB } from "@/lib/context";
import { formatDate, relativeLabel, todayIn } from "@/lib/dates";
import type { TaskStatus } from "@/lib/types";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const ctx = await getCtx();
  const db = await readDB(ctx);
  const project = db.projects.find((p) => p.id === id);
  if (!project) notFound();
  const today = todayIn(config.timeZone);
  const tasks = db.tasks
    .filter((t) => t.projectId === id)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.localeCompare(b.createdAt));
  const milestones = tasks.filter((t) => t.kind === "milestone" && t.dueDate);
  const columns: TaskStatus[] = ["todo", "doing", "done"];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/projects" className="text-sm text-muted hover:underline">← 프로젝트</Link>
        <span className="h-4 w-4 rounded-full" style={{ background: project.color }} />
        <h1 className="text-2xl font-semibold">{project.name}</h1>
      </div>
      {project.description && <p className="-mt-4 text-sm text-muted">{project.description}</p>}

      {milestones.length > 0 && (
        <section className="card overflow-x-auto p-4">
          <h2 className="mb-3 text-sm font-semibold">마일스톤 타임라인</h2>
          <ol className="flex min-w-max items-start">
            {milestones.map((m, i) => {
              const past = m.dueDate! < today;
              return (
                <li key={m.id} className="relative w-40 shrink-0 pr-4">
                  {i < milestones.length - 1 && <span className="absolute left-2 right-0 top-2 h-px bg-line" />}
                  <span
                    className={`relative block h-4 w-4 rotate-45 border-2 ${m.status === "done" ? "border-ok bg-ok" : past ? "border-danger bg-surface" : "border-accent bg-surface"}`}
                  />
                  <Link href={`/tasks/${m.id}`} className="mt-2 block truncate text-sm font-medium hover:underline">{m.title}</Link>
                  <p className="text-xs text-muted">
                    {formatDate(m.dueDate!, false)} · {m.status === "done" ? "완료" : relativeLabel(m.dueDate!, today)}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">과제 · 마일스톤 추가</h2>
        <TaskForm action={createTask} projectId={project.id} submitLabel="추가" />
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((status) => {
          const items = tasks.filter((t) => t.status === status);
          return (
            <section key={status} className="rounded-xl bg-surface-2 p-3">
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                {STATUS_LABEL[status]}
                <span className="text-xs font-normal text-muted">{items.length}</span>
              </h2>
              <div className="grid gap-2">
                {items.map((t) => (
                  <TaskCard key={t.id} task={t} today={today} />
                ))}
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">비어 있음</p>}
              </div>
            </section>
          );
        })}
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold">프로젝트 설정</summary>
        <form action={updateProject} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={project.id} />
          <div>
            <label className="label" htmlFor="p-name">이름</label>
            <input id="p-name" name="name" required className="input" defaultValue={project.name} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label" htmlFor="p-status">상태</label>
              <select id="p-status" name="status" className="input" defaultValue={project.status}>
                <option value="active">진행 중</option>
                <option value="paused">보류</option>
                <option value="done">종료</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="p-color">색상</label>
              <input id="p-color" name="color" type="color" defaultValue={project.color} className="h-9 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="p-desc">설명</label>
            <textarea id="p-desc" name="description" rows={2} className="input" defaultValue={project.description} />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton>저장</SubmitButton>
          </div>
        </form>
        <form action={deleteProject} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="id" value={project.id} />
          <SubmitButton className="btn-danger" confirm={`'${project.name}' 프로젝트와 과제 ${tasks.length}개, 연결된 캘린더 일정을 삭제할까요?`}>
            프로젝트 삭제
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
