import { errorMessage, rethrowControl, type Ctx } from "./context";
import { listCalendars, listEvents, type CalendarEvent, type CalendarListEntry } from "./google/calendar";
import { TASK_ID_KEY } from "./mapping";
import type { DB } from "./types";

export interface ViewEvent extends CalendarEvent {
  calendarId: string;
  calendarName: string;
  color: string;
}

export interface EventsResult {
  calendars: CalendarListEntry[];
  events: ViewEvent[];
  error?: string;
}

/**
 * Events from the user's visible Google calendars in [timeMin, timeMax).
 * Events that mirror app tasks are left out; the tasks themselves are shown instead.
 */
export async function loadEvents(ctx: Ctx, db: DB, timeMin: string, timeMax: string): Promise<EventsResult> {
  try {
    const calendars = await listCalendars(ctx.token);
    const hidden = new Set(db.settings.hiddenCalendarIds ?? []);
    const visible = calendars.filter((c) => c.accessRole !== "freeBusyReader" && !hidden.has(c.id));
    const lists = await Promise.all(
      visible.map(async (cal) => {
        try {
          const events = await listEvents(ctx.token, cal.id, { timeMin, timeMax, singleEvents: true });
          return events
            .filter((e) => e.status !== "cancelled" && !e.extendedProperties?.private?.[TASK_ID_KEY])
            .map((e) => ({
              ...e,
              calendarId: cal.id,
              calendarName: cal.summaryOverride ?? cal.summary,
              color: cal.backgroundColor ?? "#94a3b8",
            }));
        } catch (err) {
          rethrowControl(err);
          return [];
        }
      }),
    );
    return { calendars, events: lists.flat() };
  } catch (err) {
    rethrowControl(err);
    return { calendars: [], events: [], error: errorMessage(err) };
  }
}

export function eventTimeLabel(event: CalendarEvent, timeZone: string): string {
  if (!event.start?.dateTime) return "종일";
  return new Intl.DateTimeFormat("ko-KR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(event.start.dateTime),
  );
}
