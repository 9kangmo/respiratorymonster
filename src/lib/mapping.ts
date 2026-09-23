import { addDays, addMinutesLocal, diffDays, zonedParts } from "./dates";
import type { CalendarEvent, EventInput } from "./google/calendar";
import type { Project, Task } from "./types";

/** Private extended property that links a Google event to an app task. */
export const TASK_ID_KEY = "rmTaskId";
const FOOTER = "\n\n— 연구 일정 관리 앱에서 동기화됨";
const PREFIX_RE = /^(?:✓\s*)?(?:◆\s*)?(?:\[[^\]]*\]\s*)?/;

export function eventSummary(task: Pick<Task, "title" | "kind" | "status">, project?: Pick<Project, "name" | "inbox">) {
  const done = task.status === "done" ? "✓ " : "";
  const milestone = task.kind === "milestone" ? "◆ " : "";
  const tag = project && !project.inbox ? `[${project.name}] ` : "";
  return `${done}${milestone}${tag}${task.title}`;
}

export function stripSummary(summary: string): string {
  return summary.replace(PREFIX_RE, "").trim() || "(제목 없음)";
}

export function taskToEvent(task: Task, project: Project | undefined, timeZone: string): EventInput | null {
  if (!task.dueDate) return null;
  let start: EventInput["start"];
  let end: EventInput["end"];
  if (task.dueTime) {
    const finish = addMinutesLocal(task.dueDate, task.dueTime, task.durationMin || 60);
    start = { dateTime: `${task.dueDate}T${task.dueTime}:00`, timeZone };
    end = { dateTime: `${finish.date}T${finish.time}:00`, timeZone };
  } else {
    start = { date: task.dueDate };
    end = { date: addDays(task.dueDate, Math.max(1, task.spanDays ?? 1)) };
  }
  return {
    summary: eventSummary(task, project),
    description: `${task.notes}${FOOTER}`.trimStart(),
    start,
    end,
    // 11 = Tomato for milestones, 8 = Graphite for finished work, default otherwise.
    colorId: task.status === "done" ? "8" : task.kind === "milestone" ? "11" : undefined,
    extendedProperties: { private: { [TASK_ID_KEY]: task.id } },
  };
}

export type EventFields = Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "durationMin" | "spanDays">;

export function eventToTaskFields(event: CalendarEvent, timeZone: string): EventFields | null {
  const title = stripSummary(event.summary ?? "");
  const notes = (event.description ?? "").replace(FOOTER.trim(), "").trim();
  if (event.start?.dateTime) {
    const start = zonedParts(event.start.dateTime, timeZone);
    const minutes = event.end?.dateTime
      ? Math.round((new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) / 60_000)
      : 60;
    return { title, notes, dueDate: start.date, dueTime: start.time, durationMin: minutes > 0 ? minutes : 60, spanDays: undefined };
  }
  if (event.start?.date) {
    const span = event.end?.date ? diffDays(event.start.date, event.end.date) : 1;
    return { title, notes, dueDate: event.start.date, dueTime: undefined, durationMin: undefined, spanDays: span > 1 ? span : undefined };
  }
  return null;
}

/** Dates (inclusive) a task occupies on the calendar. */
export function taskDates(task: Pick<Task, "dueDate" | "dueTime" | "spanDays">): string[] {
  if (!task.dueDate) return [];
  const span = task.dueTime ? 1 : Math.max(1, task.spanDays ?? 1);
  return Array.from({ length: span }, (_, i) => addDays(task.dueDate!, i));
}

/** Dates (inclusive) an arbitrary Google event occupies in the given zone. */
export function eventDates(event: CalendarEvent, timeZone: string): string[] {
  if (event.start?.date) {
    const end = event.end?.date ?? addDays(event.start.date, 1);
    const n = Math.max(1, diffDays(event.start.date, end));
    return Array.from({ length: n }, (_, i) => addDays(event.start!.date!, i));
  }
  if (event.start?.dateTime) {
    const first = zonedParts(event.start.dateTime, timeZone).date;
    // An event ending exactly at midnight does not occupy the next day.
    const endMs = event.end?.dateTime ? new Date(event.end.dateTime).getTime() - 1 : new Date(event.start.dateTime).getTime();
    const last = zonedParts(new Date(endMs), timeZone).date;
    const n = Math.max(1, diffDays(first, last) + 1);
    return Array.from({ length: n }, (_, i) => addDays(first, i));
  }
  return [];
}
