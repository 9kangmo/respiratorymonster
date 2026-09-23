import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { DueChip, SyncChip } from "@/components/TaskBits";
import { TaskForm } from "@/components/TaskForm";
import { createCalendarEvent, createTask, toggleCalendarVisibility } from "@/lib/actions";
import { config } from "@/lib/config";
import { getCtx, readDB } from "@/lib/context";
import { addDays, formatDate, monthMatrix, todayIn, WEEKDAYS, zonedToUtc } from "@/lib/dates";
import { eventDates, taskDates } from "@/lib/mapping";
import type { Task } from "@/lib/types";
import { eventTimeLabel, loadEvents, type ViewEvent } from "@/lib/views";

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const db = await readDB(ctx);
  const today = todayIn(config.timeZone);
  const match = typeof sp.month === "string" ? MONTH_RE.exec(sp.month) : null;
  const year = match ? Number(match[1]) : Number(today.slice(0, 4));
  const month = match ? Number(match[2]) : Number(today.slice(5, 7));
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const selected = typeof sp.day === "string" && DATE_RE.test(sp.day) ? sp.day : monthKey === today.slice(0, 7) ? today : `${monthKey}-01`;

  const weeks = monthMatrix(year, month);
  const first = weeks[0][0];
  const last = weeks[weeks.length - 1][6];
  const { calendars, events, error } = await loadEvents(
    ctx,
    db,
    zonedToUtc(first, "00:00", config.timeZone),
    zonedToUtc(addDays(last, 1), "00:00", config.timeZone),
  );

  const projects = new Map(db.projects.map((p) => [p.id, p]));
  const tasksByDay = new Map<string, Task[]>();
  for (const t of db.tasks) for (const d of taskDates(t)) tasksByDay.set(d, [...(tasksByDay.get(d) ?? []), t]);
  const eventsByDay = new Map<string, ViewEvent[]>();
  for (const e of events) for (const d of eventDates(e, config.timeZone)) eventsByDay.set(d, [...(eventsByDay.get(d) ?? []), e]);
  const byStart = (a: ViewEvent, b: ViewEvent) => (a.start?.dateTime ?? "").localeCompare(b.start?.dateTime ?? "");

  const hidden = new Set(db.settings.hiddenCalendarIds ?? []);
  const writable = calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer");
  const href = (params: Record<string, string>) => `/calendar?${new URLSearchParams({ month: monthKey, ...params })}`;
  const dayTasks = tasksByDay.get(selected) ?? [];
  const dayEvents = (eventsByDay.get(selected) ?? []).sort(byStart);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-2xl font-semibold">{year}년 {month}월</h1>
          <Link href={`/calendar?month=${shiftMonth(year, month, -1)}`} className="btn-ghost px-2.5 py-1" aria-label="이전 달">‹</Link>
          <Link href={`/calendar?month=${today.slice(0, 7)}&day=${today}`} className="btn-ghost py-1">오늘</Link>
          <Link href={`/calendar?month=${shiftMonth(year, month, 1)}`} className="btn-ghost px-2.5 py-1" aria-label="다음 달">›</Link>
        </div>
        {error && <p className="text-sm text-danger">구글캘린더를 불러오지 못했습니다: {error}</p>}

        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line text-center text-xs text-muted">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`py-2 ${i === 0 ? "text-danger" : ""}`}>{w}</div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
              {week.map((day, i) => {
                const inMonth = day.slice(0, 7) === monthKey;
                const tasks = tasksByDay.get(day) ?? [];
                const evs = (eventsByDay.get(day) ?? []).sort(byStart);
                const items = [
                  ...tasks.map((t) => ({ key: t.id, color: projects.get(t.projectId)?.color ?? "#94a3b8", label: `${t.kind === "milestone" ? "◆ " : ""}${t.title}`, done: t.status === "done", solid: true })),
                  ...evs.map((e) => ({ key: `${e.calendarId}:${e.id}`, color: e.color, label: e.summary ?? "(제목 없음)", done: false, solid: false })),
                ];
                return (
                  <Link
                    key={day}
                    href={href({ day })}
                    className={`min-h-24 border-r border-line p-1.5 last:border-r-0 hover:bg-surface-2 ${inMonth ? "" : "opacity-45"} ${day === selected ? "bg-surface-2" : ""}`}
                  >
                    <span
                      className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${day === today ? "bg-accent font-semibold text-accent-ink" : i === 0 ? "text-danger" : ""}`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <div className="mt-0.5 grid gap-0.5">
                      {items.slice(0, 3).map((it) => (
                        <span
                          key={it.key}
                          title={it.label}
                          className={`h-1.5 truncate rounded text-[11px] leading-4 sm:h-auto sm:px-1 ${it.done ? "line-through opacity-60" : ""} ${
                            it.solid ? "" : "bg-[color-mix(in_srgb,var(--c)_40%,transparent)] text-muted sm:bg-transparent"
                          }`}
                          style={
                            it.solid
                              ? { background: `${it.color}26`, color: "var(--ink)", borderLeft: `2px solid ${it.color}` }
                              : ({ "--c": it.color } as React.CSSProperties)
                          }
                        >
                          <span className="hidden sm:inline">
                            {!it.solid && <span className="mr-0.5" style={{ color: it.color }}>●</span>}
                            {it.label}
                          </span>
                        </span>
                      ))}
                      {items.length > 3 && <span className="px-1 text-[11px] text-muted">+{items.length - 3}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {calendars.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {calendars.map((c) => (
              <form key={c.id} action={toggleCalendarVisibility}>
                <input type="hidden" name="calendarId" value={c.id} />
                <SubmitButton className={`chip border border-line ${hidden.has(c.id) ? "text-muted opacity-60" : "bg-surface"}`} title="표시/숨기기">
                  <span className="h-2 w-2 rounded-full" style={{ background: hidden.has(c.id) ? "transparent" : c.backgroundColor, border: `1px solid ${c.backgroundColor}` }} />
                  {c.summaryOverride ?? c.summary}
                </SubmitButton>
              </form>
            ))}
          </div>
        )}
      </div>

      <aside className="grid content-start gap-4">
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{formatDate(selected)}</h2>
          {dayTasks.length === 0 && dayEvents.length === 0 && <p className="text-sm text-muted">일정이 없습니다.</p>}
          <ul className="grid gap-3">
            {dayTasks.map((t) => (
              <li key={t.id} className="border-l-2 pl-2" style={{ borderColor: projects.get(t.projectId)?.color }}>
                <Link href={`/tasks/${t.id}`} className={`text-sm font-medium hover:underline ${t.status === "done" ? "text-muted line-through" : ""}`}>
                  {t.kind === "milestone" && <span className="mr-1 text-danger">◆</span>}
                  {t.title}
                </Link>
                <p className="text-xs text-muted">{projects.get(t.projectId)?.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <DueChip task={t} today={today} />
                  <SyncChip task={t} />
                </div>
              </li>
            ))}
            {dayEvents.map((e) => (
              <li key={`${e.calendarId}:${e.id}`} className="flex gap-2 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} />
                <div className="min-w-0">
                  <a href={e.htmlLink} target="_blank" rel="noreferrer" className="hover:underline">{e.summary ?? "(제목 없음)"}</a>
                  <p className="text-xs text-muted">{eventTimeLabel(e, config.timeZone)} · {e.calendarName}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {db.projects.length > 0 && (
          <details className="card p-4" open={dayTasks.length === 0 && dayEvents.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold">이 날짜에 과제 추가</summary>
            <div className="mt-3">
              <TaskForm key={selected} action={createTask} projects={db.projects} defaultDate={selected} submitLabel="추가" />
            </div>
          </details>
        )}

        {writable.length > 0 && (
          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-semibold">구글캘린더 일반 일정 추가</summary>
            <form key={selected} action={createCalendarEvent} className="mt-3 grid gap-3">
              <input name="title" required className="input" placeholder="예: 지도교수 미팅" />
              <div className="grid grid-cols-2 gap-2">
                <input name="date" type="date" required className="input" defaultValue={selected} />
                <input name="time" type="time" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select name="calendarId" className="input" defaultValue={writable.find((c) => c.primary)?.id}>
                  {writable.map((c) => (
                    <option key={c.id} value={c.id}>{c.summaryOverride ?? c.summary}</option>
                  ))}
                </select>
                <input name="durationMin" type="number" min={5} step={5} defaultValue={60} className="input" title="소요 시간(분)" />
              </div>
              <p className="text-xs text-muted">시각을 비우면 종일 일정이 됩니다.</p>
              <SubmitButton>일정 추가</SubmitButton>
            </form>
          </details>
        )}
      </aside>
    </div>
  );
}
