import Link from "next/link";
import { formatDate, relativeLabel } from "@/lib/dates";
import type { Priority, Project, ProjectStatus, Task, TaskStatus } from "@/lib/types";
import { setTaskStatus } from "@/lib/actions";
import { SubmitButton } from "./SubmitButton";

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "할 일", doing: "진행 중", done: "완료" };
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { active: "진행 중", paused: "보류", done: "종료" };
export const PRIORITY_LABEL: Record<Priority, string> = { high: "높음", medium: "보통", low: "낮음" };

export function PriorityChip({ priority }: { priority: Priority }) {
  if (priority === "medium") return null;
  const cls = priority === "high" ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted";
  return <span className={`chip ${cls}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function DueChip({ task, today }: { task: Task; today: string }) {
  if (!task.dueDate) return null;
  const overdue = task.status !== "done" && task.dueDate < today;
  const soon = !overdue && task.status !== "done" && task.dueDate <= today;
  const cls = overdue ? "bg-danger/10 text-danger" : soon ? "bg-warn/10 text-warn" : "bg-surface-2 text-muted";
  return (
    <span className={`chip ${cls}`} title={task.dueDate}>
      {formatDate(task.dueDate)}
      {task.dueTime && ` ${task.dueTime}`}
      {task.status !== "done" && <span className="opacity-80">· {relativeLabel(task.dueDate, today)}</span>}
    </span>
  );
}

export function SyncChip({ task }: { task: Task }) {
  if (!task.syncToCalendar || !task.dueDate) return null;
  if (task.syncError)
    return (
      <span className="chip bg-danger/10 text-danger" title={task.syncError}>
        동기화 오류
      </span>
    );
  if (task.syncDirty || !task.googleEventId) return <span className="chip bg-warn/10 text-warn">동기화 대기</span>;
  return (
    <span className="chip bg-ok/10 text-ok" title="구글캘린더에 연결됨">
      캘린더
    </span>
  );
}

export function TaskRow({ task, project, today }: { task: Task; project?: Project; today: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project?.color ?? "#94a3b8" }} />
      <div className="min-w-0 flex-1">
        <Link href={`/tasks/${task.id}`} className={`text-sm font-medium hover:underline ${task.status === "done" ? "text-muted line-through" : ""}`}>
          {task.kind === "milestone" && <span className="mr-1 text-danger">◆</span>}
          {task.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {project && (
            <Link href={`/projects/${project.id}`} className="text-xs text-muted hover:underline">
              {project.name}
            </Link>
          )}
          <DueChip task={task} today={today} />
          <PriorityChip priority={task.priority} />
          <SyncChip task={task} />
        </div>
      </div>
      {task.status !== "done" && (
        <form action={setTaskStatus}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="status" value="done" />
          <SubmitButton className="btn-ghost px-2 py-1 text-xs" title="완료로 표시">
            ✓
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function TaskCard({ task, today }: { task: Task; today: string }) {
  const moves = (["todo", "doing", "done"] as const).filter((s) => s !== task.status);
  return (
    <div className="card p-3">
      <Link href={`/tasks/${task.id}`} className={`block text-sm font-medium hover:underline ${task.status === "done" ? "text-muted line-through" : ""}`}>
        {task.kind === "milestone" && <span className="mr-1 text-danger">◆</span>}
        {task.title}
      </Link>
      {task.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">{task.notes}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <DueChip task={task} today={today} />
        <PriorityChip priority={task.priority} />
        <SyncChip task={task} />
      </div>
      <div className="mt-2 flex gap-1">
        {moves.map((status) => (
          <form key={status} action={setTaskStatus}>
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="status" value={status} />
            <SubmitButton className="btn-ghost px-2 py-1 text-xs">→ {STATUS_LABEL[status]}</SubmitButton>
          </form>
        ))}
      </div>
    </div>
  );
}
