import { config } from "./config";
import { errorMessage, rethrowControl, type Ctx } from "./context";
import { addDays, todayIn } from "./dates";
import { GoogleApiError } from "./google/api";
import { createCalendar, deleteEvent, insertEvent, listEvents, patchEvent, type CalendarEvent } from "./google/calendar";
import { eventToTaskFields, TASK_ID_KEY, taskToEvent } from "./mapping";
import type { DB, Project, Task } from "./types";

export const DEFAULT_CALENDAR_NAME = "연구 일정";
const PULL_WINDOW_DAYS = 365;

const now = () => new Date().toISOString();
const isGone = (err: unknown) => err instanceof GoogleApiError && (err.status === 404 || err.status === 410);

export function newId(): string {
  return crypto.randomUUID();
}

export async function ensureCalendar(ctx: Ctx, db: DB): Promise<string> {
  if (db.settings.calendarId) return db.settings.calendarId;
  const cal = await createCalendar(ctx.token, DEFAULT_CALENDAR_NAME, config.timeZone);
  db.settings.calendarId = cal.id;
  db.settings.calendarName = cal.summary;
  db.settings.calendarLinkedAt = now();
  return cal.id;
}

export function ensureInbox(db: DB): Project {
  let inbox = db.projects.find((p) => p.inbox);
  if (!inbox) {
    const ts = now();
    inbox = {
      id: newId(),
      name: "캘린더에서 가져옴",
      description: "구글캘린더 연구 일정 캘린더에 직접 추가한 일정이 여기에 모입니다.",
      color: "#64748b",
      status: "active",
      inbox: true,
      createdAt: ts,
      updatedAt: ts,
    };
    db.projects.push(inbox);
  }
  return inbox;
}

function unlink(task: Task) {
  task.googleEventId = undefined;
  task.googleCalendarId = undefined;
  task.googleUpdated = undefined;
}

async function deleteRemote(ctx: Ctx, task: Task) {
  if (!task.googleEventId || !task.googleCalendarId) return;
  try {
    await deleteEvent(ctx.token, task.googleCalendarId, task.googleEventId);
  } catch (err) {
    if (!isGone(err)) throw err;
  }
}

/**
 * Brings the Google event for `task` in line with the task (create, update, move or delete).
 * Never throws for Google API errors; they are recorded on the task and retried by the next sync.
 */
export async function pushTask(ctx: Ctx, db: DB, task: Task): Promise<void> {
  try {
    if (!task.syncToCalendar || !task.dueDate) {
      await deleteRemote(ctx, task);
      unlink(task);
    } else {
      const calendarId = await ensureCalendar(ctx, db);
      const project = db.projects.find((p) => p.id === task.projectId);
      const body = taskToEvent(task, project, config.timeZone)!;
      if (task.googleCalendarId && task.googleCalendarId !== calendarId) {
        await deleteRemote(ctx, task);
        unlink(task);
      }
      let event;
      if (task.googleEventId) {
        try {
          event = await patchEvent(ctx.token, calendarId, task.googleEventId, body);
          // A cancelled event can still be patched; treat it as gone.
          if (event.status === "cancelled") event = undefined;
        } catch (err) {
          if (!isGone(err)) throw err;
        }
      }
      event ??= await insertEvent(ctx.token, calendarId, body);
      task.googleEventId = event.id;
      task.googleCalendarId = calendarId;
      task.googleUpdated = event.updated;
    }
    task.syncDirty = false;
    task.syncError = undefined;
  } catch (err) {
    rethrowControl(err);
    task.syncDirty = true;
    task.syncError = errorMessage(err);
  }
}

/** Removes a task's Google event; errors are ignored so local deletion always succeeds. */
export async function dropTaskEvent(ctx: Ctx, task: Task): Promise<void> {
  try {
    await deleteRemote(ctx, task);
  } catch (err) {
    rethrowControl(err);
  }
}

export interface SyncReport {
  imported: number;
  updated: number;
  unlinked: number;
  pushed: number;
  failed: number;
}

/**
 * Two-way sync with the dedicated calendar:
 * 1. pull: apply edits/deletions made in Google, import events added directly in Google;
 * 2. push: send local changes that have not reached Google yet.
 * Conflicts (changed on both sides) are resolved by last-writer-wins.
 */
export async function syncAll(ctx: Ctx, db: DB): Promise<SyncReport> {
  const report: SyncReport = { imported: 0, updated: 0, unlinked: 0, pushed: 0, failed: 0 };
  let calendarId = await ensureCalendar(ctx, db);
  let events: CalendarEvent[];
  try {
    events = await listEvents(ctx.token, calendarId, {
      showDeleted: true,
      timeMin: `${addDays(todayIn(config.timeZone), -PULL_WINDOW_DAYS)}T00:00:00Z`,
    });
  } catch (err) {
    if (!isGone(err)) throw err;
    // The sync calendar was deleted in Google: start over with a fresh one and re-push everything.
    db.settings.calendarId = undefined;
    db.tasks.forEach(unlink);
    calendarId = await ensureCalendar(ctx, db);
    events = [];
  }
  const byId = new Map(db.tasks.map((t) => [t.id, t]));
  const byEvent = new Map(db.tasks.filter((t) => t.googleEventId).map((t) => [t.googleEventId!, t]));

  for (const event of events) {
    if (event.recurrence || event.recurringEventId) continue;
    const linkedId = event.extendedProperties?.private?.[TASK_ID_KEY];
    const task = byEvent.get(event.id) ?? (linkedId ? byId.get(linkedId) : undefined);

    if (task) {
      if (task.googleCalendarId && task.googleCalendarId !== calendarId) continue;
      if (event.status === "cancelled") {
        if (task.googleEventId === event.id) {
          unlink(task);
          task.syncToCalendar = false;
          task.syncDirty = false;
          task.updatedAt = now();
          report.unlinked++;
        }
        continue;
      }
      if (event.updated === task.googleUpdated) continue;
      if (task.syncDirty && task.updatedAt > event.updated) continue;
      const fields = eventToTaskFields(event, config.timeZone);
      if (!fields) continue;
      Object.assign(task, fields, {
        googleEventId: event.id,
        googleCalendarId: calendarId,
        googleUpdated: event.updated,
        syncToCalendar: true,
        syncDirty: false,
        syncError: undefined,
        updatedAt: now(),
      });
      report.updated++;
      continue;
    }

    if (event.status === "cancelled") continue;
    // Pre-existing events in a calendar the user linked (e.g. their primary one) are not research tasks.
    const linkedAt = db.settings.calendarLinkedAt;
    if (linkedAt && event.created && event.created < linkedAt) continue;
    const fields = eventToTaskFields(event, config.timeZone);
    if (!fields) continue;
    const ts = now();
    const imported: Task = {
      id: newId(),
      projectId: ensureInbox(db).id,
      status: "todo",
      kind: "task",
      priority: "medium",
      ...fields,
      syncToCalendar: true,
      googleEventId: event.id,
      googleCalendarId: calendarId,
      createdAt: ts,
      updatedAt: ts,
    };
    try {
      const tagged = await patchEvent(ctx.token, calendarId, event.id, {
        extendedProperties: { private: { [TASK_ID_KEY]: imported.id } },
      });
      imported.googleUpdated = tagged.updated;
    } catch (err) {
      rethrowControl(err);
      imported.googleUpdated = event.updated;
    }
    db.tasks.push(imported);
    byId.set(imported.id, imported);
    report.imported++;
  }

  for (const task of db.tasks) {
    const needsPush = task.syncToCalendar && task.dueDate
      ? task.syncDirty || !task.googleEventId || task.googleCalendarId !== calendarId
      : Boolean(task.googleEventId);
    if (!needsPush) continue;
    await pushTask(ctx, db, task);
    if (task.syncError) report.failed++;
    else report.pushed++;
  }

  db.settings.lastSyncAt = now();
  return report;
}
