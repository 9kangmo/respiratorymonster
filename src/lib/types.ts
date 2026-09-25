export type ProjectStatus = "active" | "paused" | "done";
export type TaskStatus = "todo" | "doing" | "done";
export type TaskKind = "task" | "milestone";
export type Priority = "low" | "medium" | "high";

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  status: ProjectStatus;
  /** Inbox project that collects events created directly in Google Calendar. */
  inbox?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  notes: string;
  status: TaskStatus;
  kind: TaskKind;
  priority: Priority;
  /** YYYY-MM-DD in the app time zone. */
  dueDate?: string;
  /** HH:mm; absent means an all-day item. */
  dueTime?: string;
  /** Length of a timed event in minutes. */
  durationMin?: number;
  /** Length of an all-day event in days (multi-day deadlines/conferences). */
  spanDays?: number;
  syncToCalendar: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  /** `updated` of the Google event as of the last push/pull. */
  googleUpdated?: string;
  /** Local changes not yet pushed to Google. */
  syncDirty?: boolean;
  syncError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  calendarId?: string;
  calendarName?: string;
  /** When the sync calendar was linked; only events created after this are imported as tasks. */
  calendarLinkedAt?: string;
  lastSyncAt?: string;
  hiddenCalendarIds?: string[];
}

export interface Holding {
  id: string;
  name: string;
  /** Yahoo Finance symbol, e.g. 005930.KS, 247540.KQ, AAPL. */
  symbol: string;
  quantity?: number;
  /** Average purchase price in the quote currency. */
  avgPrice?: number;
  /** News search query; defaults to the name. */
  keywords?: string;
  createdAt: string;
}

export type Sentiment = "긍정" | "중립" | "부정";

export interface Briefing {
  createdAt: string;
  overview: string;
  macro: string;
  holdings: { holdingId: string; sentiment: Sentiment; summary: string; points: string[] }[];
}

export interface DB {
  version: 1;
  projects: Project[];
  tasks: Task[];
  holdings: Holding[];
  briefing?: Briefing;
  settings: Settings;
}

export function emptyDB(): DB {
  return { version: 1, projects: [], tasks: [], holdings: [], settings: {} };
}
