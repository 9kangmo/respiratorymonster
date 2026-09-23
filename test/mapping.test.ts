import { describe, expect, it } from "vitest";
import { eventDates, eventSummary, eventToTaskFields, stripSummary, TASK_ID_KEY, taskDates, taskToEvent } from "@/lib/mapping";
import type { CalendarEvent } from "@/lib/google/calendar";
import type { Project, Task } from "@/lib/types";

const TZ = "Asia/Seoul";
const project: Project = { id: "p", name: "폐기능 연구", description: "", color: "#000000", status: "active", createdAt: "", updatedAt: "" };
const base: Task = {
  id: "t1", projectId: "p", title: "IRB 제출", notes: "서류 확인", status: "todo", kind: "milestone",
  priority: "high", dueDate: "2026-10-05", syncToCalendar: true, createdAt: "", updatedAt: "",
};

function asEvent(input: ReturnType<typeof taskToEvent>): CalendarEvent {
  return { id: "e", status: "confirmed", updated: "2026-01-01T00:00:00Z", ...input! } as CalendarEvent;
}

describe("mapping", () => {
  it("builds summaries with milestone, project and completion markers and strips them back", () => {
    expect(eventSummary(base, project)).toBe("◆ [폐기능 연구] IRB 제출");
    expect(eventSummary({ ...base, status: "done", kind: "task" }, project)).toBe("✓ [폐기능 연구] IRB 제출");
    expect(stripSummary("✓ ◆ [폐기능 연구] IRB 제출")).toBe("IRB 제출");
    expect(stripSummary("그냥 일정")).toBe("그냥 일정");
  });

  it("round-trips an all-day deadline", () => {
    const ev = taskToEvent(base, project, TZ)!;
    expect(ev.start).toEqual({ date: "2026-10-05" });
    expect(ev.end).toEqual({ date: "2026-10-06" });
    expect(ev.extendedProperties?.private?.[TASK_ID_KEY]).toBe("t1");
    expect(ev.colorId).toBe("11");
    expect(eventToTaskFields(asEvent(ev), TZ)).toMatchObject({ title: "IRB 제출", notes: "서류 확인", dueDate: "2026-10-05", dueTime: undefined });
  });

  it("round-trips a multi-day conference", () => {
    const task = { ...base, spanDays: 3 };
    const ev = taskToEvent(task, project, TZ)!;
    expect(ev.end).toEqual({ date: "2026-10-08" });
    expect(eventToTaskFields(asEvent(ev), TZ)?.spanDays).toBe(3);
    expect(taskDates(task)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });

  it("round-trips a timed task, reading back UTC timestamps from Google", () => {
    const task = { ...base, dueTime: "23:30", durationMin: 90 };
    const ev = taskToEvent(task, project, TZ)!;
    expect(ev.start).toEqual({ dateTime: "2026-10-05T23:30:00", timeZone: TZ });
    expect(ev.end).toEqual({ dateTime: "2026-10-06T01:00:00", timeZone: TZ });
    // Google returns offsets, not the naive local time we sent.
    const fromGoogle = asEvent({ ...ev, start: { dateTime: "2026-10-05T23:30:00+09:00" }, end: { dateTime: "2026-10-06T01:00:00+09:00" } });
    expect(eventToTaskFields(fromGoogle, TZ)).toMatchObject({ dueDate: "2026-10-05", dueTime: "23:30", durationMin: 90 });
  });

  it("returns null for tasks without a due date", () => {
    expect(taskToEvent({ ...base, dueDate: undefined }, project, TZ)).toBeNull();
  });

  it("computes the days a Google event covers", () => {
    const ev = (start: string, end: string) => ({ id: "x", status: "confirmed", updated: "", start: { dateTime: start }, end: { dateTime: end } }) as CalendarEvent;
    expect(eventDates(ev("2026-10-05T22:00:00+09:00", "2026-10-06T00:00:00+09:00"), TZ)).toEqual(["2026-10-05"]);
    expect(eventDates(ev("2026-10-05T22:00:00+09:00", "2026-10-06T01:00:00+09:00"), TZ)).toEqual(["2026-10-05", "2026-10-06"]);
  });
});
