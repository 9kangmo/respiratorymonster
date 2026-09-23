import { gfetch, type TokenFn } from "./api";

const BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarListEntry {
  id: string;
  summary: string;
  summaryOverride?: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  selected?: boolean;
}

export interface EventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  created?: string;
  updated: string;
  start?: EventDateTime;
  end?: EventDateTime;
  recurrence?: string[];
  recurringEventId?: string;
  colorId?: string;
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
}

export type EventInput = Partial<Omit<CalendarEvent, "id" | "updated" | "status" | "htmlLink">>;

const enc = encodeURIComponent;

export async function listCalendars(token: TokenFn): Promise<CalendarListEntry[]> {
  const items: CalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "250" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await gfetch<{ items?: CalendarListEntry[]; nextPageToken?: string }>(
      token,
      `${BASE}/users/me/calendarList?${params}`,
    );
    items.push(...(res.items ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return items;
}

export function createCalendar(token: TokenFn, summary: string, timeZone: string) {
  return gfetch<{ id: string; summary: string }>(token, `${BASE}/calendars`, {
    method: "POST",
    body: JSON.stringify({ summary, timeZone, description: "연구 일정 관리 앱이 동기화하는 캘린더" }),
  });
}

export interface ListEventsOptions {
  timeMin?: string;
  timeMax?: string;
  showDeleted?: boolean;
  singleEvents?: boolean;
}

export async function listEvents(token: TokenFn, calendarId: string, opts: ListEventsOptions): Promise<CalendarEvent[]> {
  const items: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "2500" });
    if (opts.timeMin) params.set("timeMin", opts.timeMin);
    if (opts.timeMax) params.set("timeMax", opts.timeMax);
    if (opts.showDeleted) params.set("showDeleted", "true");
    if (opts.singleEvents) {
      params.set("singleEvents", "true");
      params.set("orderBy", "startTime");
    }
    if (pageToken) params.set("pageToken", pageToken);
    const res = await gfetch<{ items?: CalendarEvent[]; nextPageToken?: string }>(
      token,
      `${BASE}/calendars/${enc(calendarId)}/events?${params}`,
    );
    items.push(...(res.items ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return items;
}

export function insertEvent(token: TokenFn, calendarId: string, event: EventInput) {
  return gfetch<CalendarEvent>(token, `${BASE}/calendars/${enc(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(event),
  });
}

export function patchEvent(token: TokenFn, calendarId: string, eventId: string, event: EventInput) {
  return gfetch<CalendarEvent>(token, `${BASE}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify(event),
  });
}

export function deleteEvent(token: TokenFn, calendarId: string, eventId: string) {
  return gfetch<void>(token, `${BASE}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: "DELETE" });
}
