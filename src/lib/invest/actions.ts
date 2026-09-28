"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, getCtx, mutateDB, rethrowControl } from "../context";
import { newId, pushTask } from "../sync";
import type { Project, Task } from "../types";
import { applyBundle, extractBundleJson, normalizeTicker, parseConstituents, parseValuationInputs, summarizeImport } from "./bundle";
import { sealCronKey } from "./runner";
import { mutateInvest, readInvest } from "./store";
import { ASSET_LABEL, type AssetType, type Currency, type EventType, type Holding } from "./types";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const numOf = (fd: FormData, key: string) => {
  const n = Number(str(fd, key).replace(/,/g, ""));
  return str(fd, key) !== "" && Number.isFinite(n) ? n : undefined;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ASSET_TYPES = Object.keys(ASSET_LABEL) as AssetType[];
const MANUAL = "수동 입력";

function done() {
  revalidatePath("/invest", "layout");
}

// ---------- holdings ----------

export async function saveHolding(fd: FormData) {
  const ctx = await getCtx();
  const ticker = normalizeTicker(str(fd, "ticker"));
  const quantity = numOf(fd, "quantity");
  const avgCost = numOf(fd, "avgCost");
  if (!ticker || quantity === undefined || avgCost === undefined) return;
  const assetType = (ASSET_TYPES as string[]).includes(str(fd, "assetType")) ? (str(fd, "assetType") as AssetType) : "stock";
  const currency: Currency = str(fd, "currency") === "USD" ? "USD" : "KRW";
  const constituents = parseConstituents(str(fd, "constituents"));
  const id = str(fd, "id");
  await mutateInvest(ctx, (db) => {
    const ts = new Date().toISOString();
    const fields = {
      ticker,
      name: str(fd, "name") || ticker,
      assetType,
      currency,
      quantity,
      avgCost,
      avgFx: currency === "USD" ? numOf(fd, "avgFx") : undefined,
      sector: str(fd, "sector") || undefined,
      constituents: assetType === "stock" || constituents.length === 0 ? undefined : constituents,
      notes: str(fd, "notes"),
      updatedAt: ts,
    };
    const existing = db.holdings.find((h) => h.id === id);
    if (existing) Object.assign(existing, fields);
    else {
      const holding: Holding = { id: crypto.randomUUID(), createdAt: ts, ...fields };
      db.holdings.push(holding);
    }
    db.watchlist = db.watchlist.filter((t) => t !== ticker);
  });
  done();
  const back = str(fd, "returnTo");
  if (back.startsWith("/")) redirect(back);
}

export async function deleteHolding(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  await mutateInvest(ctx, (db) => {
    db.holdings = db.holdings.filter((h) => h.id !== id);
  });
  done();
  redirect("/invest/portfolio");
}

// ---------- watchlist & themes ----------

export async function addWatch(fd: FormData) {
  const ctx = await getCtx();
  const ticker = normalizeTicker(str(fd, "ticker"));
  if (!ticker) return;
  await mutateInvest(ctx, (db) => {
    if (!db.watchlist.includes(ticker) && !db.holdings.some((h) => h.ticker === ticker)) db.watchlist.push(ticker);
  });
  done();
}

export async function removeWatch(fd: FormData) {
  const ctx = await getCtx();
  const ticker = str(fd, "ticker");
  await mutateInvest(ctx, (db) => {
    db.watchlist = db.watchlist.filter((t) => t !== ticker);
  });
  done();
}

export async function saveThemes(fd: FormData) {
  const ctx = await getCtx();
  const themes = [...new Set(str(fd, "themes").split(/[,\n]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 20);
  await mutateInvest(ctx, (db) => {
    db.themes = themes;
  });
  done();
}

// ---------- manual market data ----------

export async function setQuote(fd: FormData) {
  const ctx = await getCtx();
  const ticker = normalizeTicker(str(fd, "ticker"));
  const price = numOf(fd, "price");
  if (!ticker || !price || price <= 0) return;
  await mutateInvest(ctx, (db) => {
    const currency = db.holdings.find((h) => h.ticker === ticker)?.currency ?? (str(fd, "currency") === "USD" ? "USD" : "KRW");
    db.quotes[ticker] = { ticker, price, changePct: numOf(fd, "changePct"), currency, asOf: new Date().toISOString(), source: str(fd, "source") || MANUAL };
  });
  done();
}

export async function setFx(fd: FormData) {
  const ctx = await getCtx();
  const rate = numOf(fd, "rate");
  if (!rate || rate < 100 || rate > 5000) return;
  await mutateInvest(ctx, (db) => {
    const prev = db.fx?.rate;
    db.fx = {
      rate,
      changePct: numOf(fd, "changePct") ?? (prev ? (rate / prev - 1) * 100 : undefined),
      asOf: new Date().toISOString(),
      source: str(fd, "source") || MANUAL,
    };
  });
  done();
}

// ---------- events ----------

export async function addEvent(fd: FormData) {
  const ctx = await getCtx();
  const date = str(fd, "date");
  const title = str(fd, "title");
  if (!DATE_RE.test(date) || !title) return;
  const type = (["earnings", "dividend", "macro", "other"] as EventType[]).includes(str(fd, "type") as EventType) ? (str(fd, "type") as EventType) : "other";
  await mutateInvest(ctx, (db) => {
    db.events.push({ id: crypto.randomUUID(), ticker: normalizeTicker(str(fd, "ticker")) ?? undefined, date, title, type, source: MANUAL });
    db.events.sort((a, b) => a.date.localeCompare(b.date));
  });
  done();
}

export async function deleteEvent(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  await mutateInvest(ctx, (db) => {
    db.events = db.events.filter((e) => e.id !== id);
  });
  done();
}

const INVEST_PROJECT = "투자 일정";

/** Turns an event into a task in the research app, which syncs it to Google Calendar. */
export async function eventToCalendar(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  const event = (await readInvest(ctx)).events.find((e) => e.id === id);
  if (!event || event.taskId) return;
  const taskId = await mutateDB(ctx, async (db) => {
    const ts = new Date().toISOString();
    let project = db.projects.find((p) => p.name === INVEST_PROJECT && !p.inbox);
    if (!project) {
      project = { id: newId(), name: INVEST_PROJECT, description: "투자 리서치에서 보낸 실적·배당·매크로 일정", color: "#d97706", status: "active", createdAt: ts, updatedAt: ts } satisfies Project;
      db.projects.push(project);
    }
    const task: Task = {
      id: newId(),
      projectId: project.id,
      title: event.ticker ? `[${event.ticker}] ${event.title}` : event.title,
      notes: [event.source ? `출처: ${event.source}` : "", "투자 리서치 앱에서 등록"].filter(Boolean).join("\n"),
      status: "todo",
      kind: event.type === "earnings" ? "milestone" : "task",
      priority: event.type === "earnings" ? "high" : "medium",
      dueDate: event.date,
      syncToCalendar: true,
      syncDirty: true,
      createdAt: ts,
      updatedAt: ts,
    };
    db.tasks.push(task);
    await pushTask(ctx, db, task);
    return task.id;
  });
  await mutateInvest(ctx, (db) => {
    const e = db.events.find((x) => x.id === id);
    if (e) e.taskId = taskId;
  });
  revalidatePath("/", "layout");
}

// ---------- research ----------

export type ImportState = { ok: boolean; message: string; warnings: string[] } | null;

export async function importBundle(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await getCtx();
  try {
    const file = fd.get("file");
    let raw = str(fd, "bundle");
    if (!raw && file instanceof File && file.size > 0) {
      if (file.size > 5_000_000) return { ok: false, message: "파일이 너무 큽니다 (5MB 이하).", warnings: [] };
      raw = await file.text();
    }
    if (!raw) return { ok: false, message: "붙여 넣은 내용이나 파일이 없습니다.", warnings: [] };
    const bundle = extractBundleJson(raw);
    const result = await mutateInvest(ctx, (db) => applyBundle(db, bundle, "claude-code"));
    done();
    return { ok: true, message: summarizeImport(result), warnings: result.warnings };
  } catch (err) {
    rethrowControl(err);
    return { ok: false, message: `가져오지 못했습니다: ${errorMessage(err)}`, warnings: [] };
  }
}

export async function deleteReport(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, "id");
  await mutateInvest(ctx, (db) => {
    db.reports = db.reports.filter((r) => r.id !== id);
  });
  done();
  const back = str(fd, "returnTo");
  if (back.startsWith("/")) redirect(back);
}

export async function saveValuation(fd: FormData) {
  const ctx = await getCtx();
  const ticker = normalizeTicker(str(fd, "ticker"));
  if (!ticker) return;
  const history = (key: string) =>
    str(fd, key)
      .split(/[\n,]+/)
      .map((line) => line.trim().split(/[\s:=]+/))
      .map(([y, v]) => ({ year: Number(y), value: Number(String(v ?? "").replace(/,/g, "")) }))
      .filter((x) => x.year > 1900 && Number.isFinite(x.value) && String(x.value) !== "");
  const pctIn = (key: string) => (numOf(fd, key) ?? NaN) / 100;
  const sources: Record<string, string> = {};
  for (const k of ["price", "sharesOutstanding", "netDebt", "baseFcf", "wacc"]) {
    const s = str(fd, `src_${k}`);
    if (s) sources[k] = s;
  }
  const warnings: string[] = [];
  const inputs = parseValuationInputs(
    {
      currency: str(fd, "currency"),
      price: numOf(fd, "price"),
      sharesOutstanding: numOf(fd, "sharesOutstanding"),
      netDebt: numOf(fd, "netDebt") ?? 0,
      baseFcf: numOf(fd, "baseFcf"),
      fcfHistory: history("fcfHistory"),
      revenueHistory: history("revenueHistory"),
      wacc: pctIn("wacc"),
      terminalGrowth: pctIn("terminalGrowth"),
      years: numOf(fd, "years"),
      sources,
    },
    warnings,
    ticker,
  );
  if (!inputs) return;
  await mutateInvest(ctx, (db) => {
    db.valuations.push({ id: crypto.randomUUID(), ticker, inputs, origin: "manual", createdAt: new Date().toISOString() });
  });
  done();
}

// ---------- scheduled brief ----------

/** Creates the INVEST_CRON_TOKEN value for the signed-in owner. Shown once; never stored by the app. */
export async function makeCronKey(): Promise<string> {
  const ctx = await getCtx();
  return sealCronKey(ctx.session.email, ctx.session.refreshToken);
}
