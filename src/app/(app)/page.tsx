import Link from "next/link";
import { TaskRow } from "@/components/TaskBits";
import { config } from "@/lib/config";
import { getCtx, readDB } from "@/lib/context";
import { addDays, formatDate, todayIn, zonedToUtc } from "@/lib/dates";
import { eventDates } from "@/lib/mapping";
import { eventTimeLabel, loadEvents } from "@/lib/views";

const HORIZON_DAYS = 14;

export default async function Dashboard() {
  const ctx = await getCtx();
  const db = await readDB(ctx);
  const today = todayIn(config.timeZone);
  const projects = new Map(db.projects.map((p) => [p.id, p]));
  const open = db.tasks.filter((t) => t.status !== "done");
  const byDue = (a: { dueDate?: string; dueTime?: string }, b: typeof a) =>
    `${a.dueDate}${a.dueTime ?? ""}`.localeCompare(`${b.dueDate}${b.dueTime ?? ""}`);

  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort(byDue);
  const upcoming = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, HORIZON_DAYS)).sort(byDue);
  const milestones = open.filter((t) => t.kind === "milestone" && t.dueDate && t.dueDate >= today).sort(byDue).slice(0, 5);
  const doing = open.filter((t) => t.status === "doing");
  const active = db.projects.filter((p) => p.status === "active" && !p.inbox);

  const { events, error } = await loadEvents(
    ctx,
    db,
    zonedToUtc(today, "00:00", config.timeZone),
    zonedToUtc(addDays(today, 1), "00:00", config.timeZone),
  );
  const todayEvents = events.filter((e) => eventDates(e, config.timeZone).includes(today)).sort((a, b) => (a.start?.dateTime ?? "").localeCompare(b.start?.dateTime ?? ""));

  const stats = [
    { label: "진행 중 프로젝트", value: active.length, href: "/projects" },
    { label: "진행 중 과제", value: doing.length },
    { label: `${HORIZON_DAYS}일 내 마감`, value: upcoming.length },
    { label: "지연된 과제", value: overdue.length, tone: overdue.length ? "text-danger" : "" },
  ];

  const grouped = new Map<string, typeof upcoming>();
  for (const t of upcoming) grouped.set(t.dueDate!, [...(grouped.get(t.dueDate!) ?? []), t]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{formatDate(today)}</h1>
        <p className="text-sm text-muted">안녕하세요, {ctx.session.name}님.</p>
      </div>

      {db.projects.length === 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-medium">첫 연구 프로젝트를 만들어 보세요</p>
            <p className="text-sm text-muted">프로젝트에 과제와 마일스톤을 추가하면 마감일이 구글캘린더 &lsquo;연구 일정&rsquo; 캘린더에 자동으로 등록됩니다.</p>
          </div>
          <Link href="/projects" className="btn-primary">프로젝트 만들기</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-muted">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${s.tone ?? ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          {overdue.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-1 font-semibold text-danger">지연된 과제</h2>
              <div className="divide-y divide-line">
                {overdue.map((t) => (
                  <TaskRow key={t.id} task={t} project={projects.get(t.projectId)} today={today} />
                ))}
              </div>
            </section>
          )}
          <section className="card p-4">
            <h2 className="mb-1 font-semibold">다가오는 마감 · {HORIZON_DAYS}일</h2>
            {grouped.size === 0 && <p className="py-4 text-sm text-muted">예정된 마감이 없습니다.</p>}
            {[...grouped].map(([date, tasks]) => (
              <div key={date} className="mt-3">
                <p className="text-xs font-medium text-muted">{formatDate(date)}{date === today && " · 오늘"}</p>
                <div className="divide-y divide-line">
                  {tasks.map((t) => (
                    <TaskRow key={t.id} task={t} project={projects.get(t.projectId)} today={today} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>

        <div className="grid content-start gap-6">
          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">오늘 일정</h2>
              <Link href="/calendar" className="text-xs text-muted hover:underline">캘린더 →</Link>
            </div>
            {error && <p className="text-xs text-danger">구글캘린더를 불러오지 못했습니다: {error}</p>}
            {!error && todayEvents.length === 0 && <p className="text-sm text-muted">오늘 구글캘린더 일정이 없습니다.</p>}
            <ul className="grid gap-2">
              {todayEvents.map((e) => (
                <li key={`${e.calendarId}:${e.id}`} className="flex gap-2 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} />
                  <span className="w-10 shrink-0 text-xs leading-5 text-muted">{eventTimeLabel(e, config.timeZone)}</span>
                  <a href={e.htmlLink} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline">
                    {e.summary ?? "(제목 없음)"}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">다가오는 마일스톤</h2>
            {milestones.length === 0 && <p className="text-sm text-muted">예정된 마일스톤이 없습니다.</p>}
            <ul className="grid gap-2">
              {milestones.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/tasks/${m.id}`} className="min-w-0 truncate hover:underline">
                    <span className="mr-1 text-danger">◆</span>
                    {m.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">{formatDate(m.dueDate!, false)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">프로젝트 진행률</h2>
            {active.length === 0 && <p className="text-sm text-muted">진행 중인 프로젝트가 없습니다.</p>}
            <ul className="grid gap-3">
              {active.map((p) => {
                const tasks = db.tasks.filter((t) => t.projectId === p.id);
                const doneCount = tasks.filter((t) => t.status === "done").length;
                const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
                return (
                  <li key={p.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <Link href={`/projects/${p.id}`} className="truncate hover:underline">{p.name}</Link>
                      <span className="text-xs text-muted">{doneCount}/{tasks.length}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
