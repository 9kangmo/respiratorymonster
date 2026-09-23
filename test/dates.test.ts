import { describe, expect, it } from "vitest";
import { addMinutesLocal, diffDays, monthMatrix, relativeLabel, zonedParts, zonedToUtc } from "@/lib/dates";

describe("dates", () => {
  it("builds Sunday-first month grids covering the whole month", () => {
    const weeks = monthMatrix(2026, 9);
    expect(weeks[0][0]).toBe("2026-08-30");
    expect(weeks.at(-1)!.at(-1)).toBe("2026-10-03");
    expect(weeks.flat()).toContain("2026-09-30");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("converts between Seoul wall-clock time and UTC", () => {
    expect(zonedToUtc("2026-09-23", "09:00", "Asia/Seoul")).toBe("2026-09-23T00:00:00.000Z");
    expect(zonedToUtc("2026-09-23", "00:00", "Asia/Seoul")).toBe("2026-09-22T15:00:00.000Z");
    expect(zonedParts("2026-09-22T15:30:00Z", "Asia/Seoul")).toEqual({ date: "2026-09-23", time: "00:30" });
  });

  it("handles DST zones", () => {
    expect(zonedToUtc("2026-07-01", "12:00", "America/New_York")).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedToUtc("2026-01-01", "12:00", "America/New_York")).toBe("2026-01-01T17:00:00.000Z");
  });

  it("adds minutes across midnight", () => {
    expect(addMinutesLocal("2026-12-31", "23:30", 90)).toEqual({ date: "2027-01-01", time: "01:00" });
  });

  it("labels relative days", () => {
    expect(diffDays("2026-09-23", "2026-10-01")).toBe(8);
    expect(relativeLabel("2026-09-23", "2026-09-23")).toBe("오늘");
    expect(relativeLabel("2026-09-26", "2026-09-23")).toBe("D-3");
    expect(relativeLabel("2026-09-20", "2026-09-23")).toBe("3일 지남");
  });
});
