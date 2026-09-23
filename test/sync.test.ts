import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/context";
import { TASK_ID_KEY } from "@/lib/mapping";
import { pushTask, syncAll } from "@/lib/sync";
import { emptyDB, type DB, type Task } from "@/lib/types";
import { FakeGoogle } from "./fakeGoogle";

let google: FakeGoogle;
let db: DB;
const ctx = {
  session: { email: "me@example.com", name: "me", refreshToken: "r" },
  token: async () => "access",
  store: { load: async () => db, save: async () => {} },
} as Ctx;

function task(overrides: Partial<Task> = {}): Task {
  const t: Task = {
    id: `t${db.tasks.length + 1}`,
    projectId: "p1",
    title: "초록 제출",
    notes: "",
    status: "todo",
    kind: "milestone",
    priority: "medium",
    dueDate: "2026-10-10",
    syncToCalendar: true,
    syncDirty: true,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
  db.tasks.push(t);
  return t;
}

beforeEach(() => {
  google = new FakeGoogle();
  google.install();
  db = emptyDB();
  db.projects.push({ id: "p1", name: "천식 코호트", description: "", color: "#6366f1", status: "active", createdAt: "", updatedAt: "" });
});

describe("push", () => {
  it("creates the dedicated calendar and an event for a new task", async () => {
    const t = task();
    await pushTask(ctx, db, t);
    expect(db.settings.calendarName).toBe("연구 일정");
    const [ev] = google.events(db.settings.calendarId!);
    expect(ev.summary).toBe("◆ [천식 코호트] 초록 제출");
    expect(ev.extendedProperties?.private?.[TASK_ID_KEY]).toBe(t.id);
    expect(t).toMatchObject({ googleEventId: ev.id, googleUpdated: ev.updated, syncDirty: false });
  });

  it("updates the same event on edit and removes it when sync is turned off", async () => {
    const t = task();
    await pushTask(ctx, db, t);
    const id = t.googleEventId!;
    t.dueDate = "2026-10-12";
    await pushTask(ctx, db, t);
    expect(google.events(db.settings.calendarId!)).toHaveLength(1);
    expect(google.events(db.settings.calendarId!)[0]).toMatchObject({ id, start: { date: "2026-10-12" } });

    t.syncToCalendar = false;
    await pushTask(ctx, db, t);
    expect(google.events(db.settings.calendarId!)[0].status).toBe("cancelled");
    expect(t.googleEventId).toBeUndefined();
  });

  it("records API errors on the task instead of throwing", async () => {
    const t = task();
    await pushTask(ctx, db, t);
    google.calendars.delete(db.settings.calendarId!);
    t.title = "변경";
    await pushTask(ctx, db, t);
    expect(t.syncDirty).toBe(true);
    expect(t.syncError).toBeTruthy();
  });
});

describe("syncAll", () => {
  it("pulls date, title and notes edited in Google", async () => {
    const t = task();
    await syncAll(ctx, db);
    google.userUpsert(db.settings.calendarId!, {
      id: t.googleEventId,
      summary: "◆ [천식 코호트] 초록 최종 제출",
      description: "학회 사이트에서 제출\n\n— 연구 일정 관리 앱에서 동기화됨",
      start: { dateTime: "2026-10-11T14:00:00+09:00" },
      end: { dateTime: "2026-10-11T15:30:00+09:00" },
    });
    const report = await syncAll(ctx, db);
    expect(report.updated).toBe(1);
    expect(t).toMatchObject({ title: "초록 최종 제출", notes: "학회 사이트에서 제출", dueDate: "2026-10-11", dueTime: "14:00", durationMin: 90 });
    // Nothing changed since: a second sync is a no-op.
    expect(await syncAll(ctx, db)).toEqual({ imported: 0, updated: 0, unlinked: 0, pushed: 0, failed: 0 });
  });

  it("unlinks a task whose event was deleted in Google, keeping the task", async () => {
    const t = task();
    await syncAll(ctx, db);
    google.userDelete(db.settings.calendarId!, t.googleEventId!);
    const report = await syncAll(ctx, db);
    expect(report.unlinked).toBe(1);
    expect(db.tasks).toHaveLength(1);
    expect(t).toMatchObject({ syncToCalendar: false, googleEventId: undefined });
    // And it is not re-created on the next sync.
    await syncAll(ctx, db);
    expect(google.events(db.settings.calendarId!).filter((e) => e.status !== "cancelled")).toHaveLength(0);
  });

  it("imports events added directly to the sync calendar into an inbox project", async () => {
    await syncAll(ctx, db);
    const ev = google.userUpsert(db.settings.calendarId!, { summary: "통계 자문", start: { date: "2026-10-02" }, end: { date: "2026-10-03" } });
    const report = await syncAll(ctx, db);
    expect(report.imported).toBe(1);
    const imported = db.tasks.find((t) => t.googleEventId === ev.id)!;
    const inbox = db.projects.find((p) => p.inbox)!;
    expect(imported).toMatchObject({ title: "통계 자문", dueDate: "2026-10-02", projectId: inbox.id, kind: "task" });
    expect(google.events(db.settings.calendarId!)[0].extendedProperties?.private?.[TASK_ID_KEY]).toBe(imported.id);
    // Tagging the event must not look like a remote edit next time.
    expect((await syncAll(ctx, db)).updated).toBe(0);
  });

  it("keeps the local edit when both sides changed and the local one is newer", async () => {
    const t = task();
    await syncAll(ctx, db);
    google.userUpsert(db.settings.calendarId!, { id: t.googleEventId, start: { date: "2026-10-20" }, end: { date: "2026-10-21" } });
    Object.assign(t, { dueDate: "2026-10-15", syncDirty: true, updatedAt: "2030-01-01T00:00:00Z" });
    const report = await syncAll(ctx, db);
    expect(report).toMatchObject({ updated: 0, pushed: 1 });
    expect(google.events(db.settings.calendarId!)[0].start).toEqual({ date: "2026-10-15" });
  });

  it("takes the Google edit when it is newer than a pending local change", async () => {
    const t = task();
    await syncAll(ctx, db);
    Object.assign(t, { dueDate: "2026-10-15", syncDirty: true, updatedAt: "2000-01-01T00:00:00Z" });
    google.userUpsert(db.settings.calendarId!, { id: t.googleEventId, start: { date: "2026-10-20" }, end: { date: "2026-10-21" } });
    await syncAll(ctx, db);
    expect(t.dueDate).toBe("2026-10-20");
    expect(t.syncDirty).toBe(false);
  });

  it("recreates the sync calendar if it was deleted in Google", async () => {
    task();
    task({ title: "IRB 갱신" });
    await syncAll(ctx, db);
    const oldId = db.settings.calendarId!;
    google.calendars.delete(oldId);
    const report = await syncAll(ctx, db);
    expect(db.settings.calendarId).not.toBe(oldId);
    expect(report.pushed).toBe(2);
    expect(google.events(db.settings.calendarId!)).toHaveLength(2);
  });

  it("does not import events that already existed in a calendar linked later", async () => {
    google.userUpsert("primary", { summary: "치과 예약", start: { date: "2026-10-01" }, end: { date: "2026-10-02" } });
    db.settings = { calendarId: "primary", calendarLinkedAt: "2030-01-01T00:00:00Z" };
    expect((await syncAll(ctx, db)).imported).toBe(0);
    expect(db.tasks).toHaveLength(0);
  });

  it("moves linked events when the sync calendar is changed", async () => {
    const t = task();
    await syncAll(ctx, db);
    const oldId = db.settings.calendarId!;
    db.settings.calendarId = "primary";
    await syncAll(ctx, db);
    expect(google.events(oldId)[0].status).toBe("cancelled");
    expect(google.events("primary")).toHaveLength(1);
    expect(t.googleCalendarId).toBe("primary");
  });

  it("retries tasks whose earlier push failed", async () => {
    const t = task({ syncError: "network", syncDirty: true });
    const report = await syncAll(ctx, db);
    expect(report.pushed).toBe(1);
    expect(t.syncError).toBeUndefined();
  });
});
