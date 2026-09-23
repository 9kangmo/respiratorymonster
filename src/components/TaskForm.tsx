import type { Project, Task } from "@/lib/types";
import { SubmitButton } from "./SubmitButton";

/** Create/edit form for a task. Works without client JS. */
export function TaskForm({
  action,
  task,
  projects,
  projectId,
  defaultDate,
  returnTo,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  task?: Task;
  projects?: Project[];
  projectId?: string;
  defaultDate?: string;
  returnTo?: string;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-3">
      {task && <input type="hidden" name="id" value={task.id} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {projects ? (
        <div>
          <label className="label" htmlFor="projectId">프로젝트</label>
          <select id="projectId" name="projectId" className="input" defaultValue={task?.projectId ?? projectId}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="projectId" value={task?.projectId ?? projectId} />
      )}
      <div>
        <label className="label" htmlFor="title">제목</label>
        <input id="title" name="title" required className="input" defaultValue={task?.title} placeholder="예: 예비실험 데이터 분석" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="kind">종류</label>
          <select id="kind" name="kind" className="input" defaultValue={task?.kind ?? "task"}>
            <option value="task">과제</option>
            <option value="milestone">마일스톤</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">상태</label>
          <select id="status" name="status" className="input" defaultValue={task?.status ?? "todo"}>
            <option value="todo">할 일</option>
            <option value="doing">진행 중</option>
            <option value="done">완료</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="priority">우선순위</label>
          <select id="priority" name="priority" className="input" defaultValue={task?.priority ?? "medium"}>
            <option value="high">높음</option>
            <option value="medium">보통</option>
            <option value="low">낮음</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dueDate">마감일</label>
          <input id="dueDate" name="dueDate" type="date" className="input" defaultValue={task?.dueDate ?? defaultDate} />
        </div>
      </div>
      <details className="rounded-lg border border-line px-3 py-2" open={Boolean(task?.dueTime || task?.spanDays)}>
        <summary className="cursor-pointer text-xs font-medium text-muted">시간 · 기간 지정 (선택)</summary>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="dueTime">시각</label>
            <input id="dueTime" name="dueTime" type="time" className="input" defaultValue={task?.dueTime} />
          </div>
          <div>
            <label className="label" htmlFor="durationMin">소요 (분)</label>
            <input id="durationMin" name="durationMin" type="number" min={5} step={5} className="input" defaultValue={task?.durationMin ?? 60} />
          </div>
          <div>
            <label className="label" htmlFor="spanDays">기간 (일, 종일)</label>
            <input id="spanDays" name="spanDays" type="number" min={1} max={60} className="input" defaultValue={task?.spanDays ?? 1} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">시각을 비우면 종일 일정으로 등록됩니다. 학회처럼 여러 날짜에 걸치면 기간을 늘리세요.</p>
      </details>
      <div>
        <label className="label" htmlFor="notes">메모</label>
        <textarea id="notes" name="notes" rows={3} className="input" defaultValue={task?.notes} placeholder="세부 내용, 링크 등" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="syncToCalendar" defaultChecked={task?.syncToCalendar ?? true} className="h-4 w-4 accent-[var(--accent)]" />
          마감일을 구글캘린더에 동기화
        </label>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
