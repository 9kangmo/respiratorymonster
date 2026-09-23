import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { TaskForm } from "@/components/TaskForm";
import { deleteTask, updateTask } from "@/lib/actions";
import { getCtx, readDB } from "@/lib/context";

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const ctx = await getCtx();
  const db = await readDB(ctx);
  const task = db.tasks.find((t) => t.id === id);
  if (!task) notFound();
  const project = db.projects.find((p) => p.id === task.projectId);
  const back = project ? `/projects/${project.id}` : "/";

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <Link href={back} className="text-sm text-muted hover:underline">← {project?.name ?? "대시보드"}</Link>
      <div className="card p-5">
        <h1 className="mb-4 text-lg font-semibold">{task.kind === "milestone" ? "마일스톤 편집" : "과제 편집"}</h1>
        <TaskForm action={updateTask} task={task} projects={db.projects} returnTo={back} submitLabel="저장" />
      </div>
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <div className="text-muted">
          {task.googleEventId ? (
            <>구글캘린더 &lsquo;{db.settings.calendarName ?? "연구 일정"}&rsquo;에 연결됨</>
          ) : task.syncToCalendar && task.dueDate ? (
            <>다음 동기화 때 캘린더에 등록됩니다</>
          ) : (
            <>캘린더에 연결되지 않음</>
          )}
          {task.syncError && <p className="text-danger">오류: {task.syncError}</p>}
        </div>
        <form action={deleteTask}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="returnTo" value={back} />
          <SubmitButton className="btn-danger" confirm="이 과제와 연결된 캘린더 일정을 삭제할까요?">삭제</SubmitButton>
        </form>
      </div>
    </div>
  );
}
