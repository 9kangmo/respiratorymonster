import type { CalendarEvent } from "@/lib/google/calendar";

/** In-memory stand-in for the Google Calendar REST API, installed as global fetch. */
export class FakeGoogle {
  calendars = new Map<string, { id: string; summary: string; events: Map<string, CalendarEvent> }>();
  private seq = 0;
  private clock = Date.now();
  calls: string[] = [];

  constructor() {
    this.addCalendar("primary", "me@example.com");
  }

  tick(): string {
    this.clock = Math.max(this.clock + 1, Date.now());
    return new Date(this.clock).toISOString();
  }

  addCalendar(id: string, summary: string) {
    this.calendars.set(id, { id, summary, events: new Map() });
  }

  events(calendarId: string) {
    return [...(this.calendars.get(calendarId)?.events.values() ?? [])];
  }

  /** Simulates the user editing or creating an event in the Google Calendar UI. */
  userUpsert(calendarId: string, event: Partial<CalendarEvent> & { id?: string }) {
    const cal = this.calendars.get(calendarId)!;
    const id = event.id ?? `ev${++this.seq}`;
    const prev = cal.events.get(id);
    const ts = this.tick();
    const next = { status: "confirmed", created: ts, ...prev, ...event, id, updated: ts } as CalendarEvent;
    cal.events.set(id, next);
    return next;
  }

  userDelete(calendarId: string, id: string) {
    const ev = this.calendars.get(calendarId)!.events.get(id)!;
    ev.status = "cancelled";
    ev.updated = this.tick();
  }

  install() {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => this.handle(String(input), init)) as typeof fetch;
  }

  private json(status: number, body?: unknown) {
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  private handle(rawUrl: string, init: RequestInit = {}): Response {
    const url = new URL(rawUrl);
    const method = init.method ?? "GET";
    this.calls.push(`${method} ${url.pathname}`);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const path = url.pathname.replace("/calendar/v3", "").split("/").map(decodeURIComponent);

    if (url.pathname === "/calendar/v3/users/me/calendarList") {
      return this.json(200, {
        items: [...this.calendars.values()].map((c) => ({ id: c.id, summary: c.summary, accessRole: "owner", primary: c.id === "primary" })),
      });
    }
    if (method === "POST" && url.pathname === "/calendar/v3/calendars") {
      const id = `cal${++this.seq}@group.calendar.google.com`;
      this.addCalendar(id, body.summary);
      return this.json(200, { id, summary: body.summary });
    }
    // /calendars/{cal}/events[/{id}]
    if (path[1] === "calendars" && path[3] === "events") {
      const cal = this.calendars.get(path[2]);
      if (!cal) return this.json(404, { error: { message: "Not Found" } });
      const id = path[4];
      if (!id && method === "GET") {
        const showDeleted = url.searchParams.get("showDeleted") === "true";
        return this.json(200, { items: [...cal.events.values()].filter((e) => showDeleted || e.status !== "cancelled") });
      }
      if (!id && method === "POST") {
        const ts = this.tick();
        const ev = { ...body, id: `ev${++this.seq}`, status: "confirmed", created: ts, updated: ts };
        cal.events.set(ev.id, ev);
        return this.json(200, ev);
      }
      const ev = cal.events.get(id);
      if (!ev) return this.json(404, { error: { message: "Not Found" } });
      if (method === "PATCH") {
        const priv = { ...ev.extendedProperties?.private, ...body.extendedProperties?.private };
        Object.assign(ev, body, { extendedProperties: { private: priv }, updated: this.tick() });
        return this.json(200, ev);
      }
      if (method === "DELETE") {
        if (ev.status === "cancelled") return this.json(410, { error: { message: "Deleted" } });
        ev.status = "cancelled";
        ev.updated = this.tick();
        return new Response(null, { status: 204 });
      }
    }
    return this.json(500, { error: { message: `unhandled ${method} ${url.pathname}` } });
  }
}
