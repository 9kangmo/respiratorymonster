"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { config } from "./config";
import { errorMessage, getCtx, mutateDB, rethrowControl } from "./context";
import { zonedToUtc, addMinutesLocal, addDays } from "./dates";
import { insertEvent, listCalendars } from "./google/calendar";
import { dropTaskEvent, newId, pushTask, syncAll, type SyncReport } from "./sync";
import { generateBriefing } from "./market/briefing";
import { loadIndicators } from "./market/indicators";
import { loadHoldings, loadMacroNews, normalizeSymbol } from "./market/portfolio";
import type { Holding, Priority, Project, ProjectStatus, Task, TaskKind, TaskStatus } from "./types";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string) => str(fd, key) || undefined;
const oneOf = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function done() {
  revalidatePath("/", "layout");
}

// ---------- projects ----------

export async function createProject(fd: FormData) {
  const ctx = await getCtx();
  const name = str(fd, "name");
  if (!name) return;
  const ts = new Date().toISOString();
  const project: Project = {
    id: newId(),
    name,
    description: str(fd, "description"),
    color: COLOR_RE.test(str(fd, "color")) ? str(fd, "color") : "#6366f1",
    status: "active",
    createdAt: ts,
    updatedAt: ts,
  };
  await mutateDB(ctx, (db) => {
    db.projects.push(project);
  });
  done();
  redirect(`/projects/${project.id}`);
}

export async function updateProject(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  await mutateDB(ctx, async (db) => {
    const project = db.projects.find((p) => p.id === id);
    if (!project) return;
    const renamed = str(fd, "name") && str(fd, "name") !== project.name;
    project.name = str(fd, "name") || project.name;
    project.description = str(fd, "description");
    if (COLOR_RE.test(str(fd, "color"))) project.color = str(fd, "color");
    project.status = oneOf<ProjectStatus>(str(fd, "status"), ["active", "paused", "done"], project.status);
    project.updatedAt = new Date().toISOString();
    // Event titles carry the project name, so re-push linked events after a rename.
    if (renamed) {
      for (const task of db.tasks.filter((t) => t.projectId === id && t.googleEventId)) {
        task.syncDirty = true;
        await pushTask(ctx, db, task);
      }
    }
  });
  done();
}

export async function deleteProject(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  await mutateDB(ctx, async (db) => {
    for (const task of db.tasks.filter((t) => t.projectId === id)) await dropTaskEvent(ctx, task);
    db.tasks = db.tasks.filter((t) => t.projectId !== id);
    db.projects = db.projects.filter((p) => p.id !== id);
  });
  done();
  redirect("/projects");
}

// ---------- tasks ----------

function applyTaskForm(task: Task, fd: FormData) {
  task.title = str(fd, "title") || task.title;
  task.notes = str(fd, "notes");
  task.kind = oneOf<TaskKind>(str(fd, "kind"), ["task", "milestone"], task.kind);
  task.priority = oneOf<Priority>(str(fd, "priority"), ["low", "medium", "high"], task.priority);
  task.status = oneOf<TaskStatus>(str(fd, "status"), ["todo", "doing", "done"], task.status);
  const dueDate = opt(fd, "dueDate");
  task.dueDate = dueDate && DATE_RE.test(dueDate) ? dueDate : undefined;
  const dueTime = opt(fd, "dueTime");
  task.dueTime = task.dueDate && dueTime && TIME_RE.test(dueTime) ? dueTime : undefined;
  const duration = Number(str(fd, "durationMin"));
  task.durationMin = task.dueTime && duration > 0 ? Math.round(duration) : undefined;
  const span = Number(str(fd, "spanDays"));
  task.spanDays = task.dueDate && !task.dueTime && span > 1 ? Math.min(Math.round(span), 60) : undefined;
  task.syncToCalendar = fd.get("syncToCalendar") === "on";
  task.updatedAt = new Date().toISOString();
  task.syncDirty = true;
}

export async function createTask(fd: FormData) {
  const ctx = await getCtx();
  const projectId = str(fd, "projectId");
  if (!str(fd, "title")) return;
  await mutateDB(ctx, async (db) => {
    if (!db.projects.some((p) => p.id === projectId)) return;
    const ts = new Date().toISOString();
    const task: Task = {
      id: newId(),
      projectId,
      title: "",
      notes: "",
      status: "todo",
      kind: "task",
      priority: "medium",
      syncToCalendar: true,
      createdAt: ts,
      updatedAt: ts,
    };
    applyTaskForm(task, fd);
    db.tasks.push(task);
    await pushTask(ctx, db, task);
  });
  done();
}

export async function updateTask(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  await mutateDB(ctx, async (db) => {
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return;
    applyTaskForm(task, fd);
    const projectId = str(fd, "projectId");
    if (db.projects.some((p) => p.id === projectId)) task.projectId = projectId;
    await pushTask(ctx, db, task);
  });
  done();
  const back = str(fd, "returnTo");
  if (back.startsWith("/")) redirect(back);
}

export async function setTaskStatus(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  await mutateDB(ctx, async (db) => {
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return;
    task.status = oneOf<TaskStatus>(str(fd, "status"), ["todo", "doing", "done"], task.status);
    task.updatedAt = new Date().toISOString();
    task.syncDirty = true;
    // Title prefix and colour reflect completion, so keep the event in step.
    await pushTask(ctx, db, task);
  });
  done();
}

export async function deleteTask(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  await mutateDB(ctx, async (db) => {
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return;
    await dropTaskEvent(ctx, task);
    db.tasks = db.tasks.filter((t) => t.id !== id);
  });
  done();
  const back = str(fd, "returnTo");
  if (back.startsWith("/")) redirect(back);
}

// ---------- sync & calendar ----------

export type SyncResult = { ok: true; report: SyncReport } | { ok: false; error: string };

export async function syncNow(): Promise<SyncResult> {
  const ctx = await getCtx();
  try {
    const report = await mutateDB(ctx, (db) => syncAll(ctx, db));
    done();
    return { ok: true, report };
  } catch (err) {
    rethrowControl(err);
    return { ok: false, error: errorMessage(err) };
  }
}

export async function chooseSyncCalendar(fd: FormData) {
  const ctx = await getCtx();
  const choice = str(fd, "calendarId");
  const calendars = choice === "new" ? [] : await listCalendars(ctx.token);
  const picked = calendars.find((c) => c.id === choice && (c.accessRole === "owner" || c.accessRole === "writer"));
  if (choice !== "new" && !picked) return;
  await mutateDB(ctx, async (db) => {
    db.settings.calendarId = picked?.id;
    db.settings.calendarName = picked ? (picked.summaryOverride ?? picked.summary) : undefined;
    db.settings.calendarLinkedAt = picked ? new Date().toISOString() : undefined;
    // Linked events are moved on the next sync (pushTask sees the calendar changed).
    await syncAll(ctx, db);
  });
  done();
}

export async function toggleCalendarVisibility(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "calendarId");
  await mutateDB(ctx, (db) => {
    const hidden = new Set(db.settings.hiddenCalendarIds ?? []);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    db.settings.hiddenCalendarIds = [...hidden];
  });
  done();
}

/** Adds a plain Google Calendar event (not a research task) to any writable calendar. */
export async function createCalendarEvent(fd: FormData) {
  const ctx = await getCtx();
  const title = str(fd, "title");
  const date = str(fd, "date");
  const time = str(fd, "time");
  const calendarId = str(fd, "calendarId") || "primary";
  if (!title || !DATE_RE.test(date)) return;
  const timed = TIME_RE.test(time);
  const duration = Number(str(fd, "durationMin")) || 60;
  const end = timed ? addMinutesLocal(date, time, duration) : null;
  await insertEvent(ctx.token, calendarId, {
    summary: title,
    description: str(fd, "notes") || undefined,
    start: timed ? { dateTime: zonedToUtc(date, time, config.timeZone), timeZone: config.timeZone } : { date },
    end: end
      ? { dateTime: zonedToUtc(end.date, end.time, config.timeZone), timeZone: config.timeZone }
      : { date: addDays(date, 1) },
  });
  done();
}

// ---------- holdings & briefing ----------

const num = (fd: FormData, key: string) => {
  const n = Number(str(fd, key).replace(/,/g, ""));
  return str(fd, key) && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export async function saveHolding(fd: FormData) {
  const ctx = await getCtx();
  const name = str(fd, "name");
  const symbol = normalizeSymbol(str(fd, "symbol"));
  if (!name || !symbol) return;
  const id = str(fd, "id");
  await mutateDB(ctx, (db) => {
    const existing = id ? db.holdings.find((h) => h.id === id) : undefined;
    const holding: Holding = existing ?? { id: newId(), name, symbol, createdAt: new Date().toISOString() };
    holding.name = name;
    holding.symbol = symbol;
    holding.quantity = num(fd, "quantity");
    holding.avgPrice = num(fd, "avgPrice");
    holding.keywords = opt(fd, "keywords");
    if (!existing) db.holdings.push(holding);
  });
  revalidatePath("/market");
  redirect("/market");
}

export async function deleteHolding(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  await mutateDB(ctx, (db) => {
    db.holdings = db.holdings.filter((h) => h.id !== id);
    if (db.briefing) db.briefing.holdings = db.briefing.holdings.filter((h) => h.holdingId !== id);
  });
  revalidatePath("/market");
  redirect("/market");
}

export async function refreshBriefing(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCtx();
  if (!config.aiBriefing) return { ok: false, error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." };
  try {
    const { holdings } = await ctx.store.load();
    const [views, indicators, macro] = await Promise.all([loadHoldings(holdings), loadIndicators(), loadMacroNews()]);
    const briefing = await generateBriefing(views, indicators, macro.news);
    await mutateDB(ctx, (db) => {
      db.briefing = briefing;
    });
    revalidatePath("/market");
    return { ok: true };
  } catch (err) {
    rethrowControl(err);
    return { ok: false, error: errorMessage(err) };
  }
}
