import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { config } from "../config";
import type { Ctx } from "../context";
import { getDocStore, withLock } from "../store";
import { applyBundle, summarizeImport } from "./bundle";
import { emptyInvestDB, type InvestDB } from "./types";

function parse(raw: string): InvestDB {
  const data = JSON.parse(raw) as Partial<InvestDB>;
  return { ...emptyInvestDB(), ...data, quotes: { ...data.quotes } };
}

function store(ctx: Ctx) {
  return getDocStore(ctx.session.email, ctx.token, {
    fileSuffix: ".invest",
    driveName: "invest-research-data.json",
    empty: emptyInvestDB,
    parse,
  });
}

export function readInvest(ctx: Ctx): Promise<InvestDB> {
  return store(ctx).load();
}

export function mutateInvest<T>(ctx: Ctx, fn: (db: InvestDB) => T | Promise<T>): Promise<T> {
  return withLock(`${ctx.session.email}:invest`, async () => {
    const s = store(ctx);
    const db = await s.load();
    const result = await fn(db);
    await s.save(db);
    return result;
  });
}

export interface InboxReport {
  file: string;
  summary: string;
  warnings: string[];
  error?: string;
}

/**
 * Local mode only: imports bundle files that Claude Code skills dropped into INVEST_INBOX_DIR,
 * then moves them to `<inbox>/imported/` (or `<inbox>/failed/`). No network endpoint or token involved.
 */
export async function importInbox(ctx: Ctx): Promise<InboxReport[]> {
  if (config.storage !== "file" || !config.investInboxDir) return [];
  const dir = path.resolve(config.investInboxDir);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  if (files.length === 0) return [];
  const reports: InboxReport[] = [];
  await mutateInvest(ctx, async (db) => {
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const result = applyBundle(db, JSON.parse(await readFile(full, "utf8")), "claude-code");
        reports.push({ file, summary: summarizeImport(result), warnings: result.warnings });
        await moveTo(dir, "imported", file);
      } catch (err) {
        reports.push({ file, summary: "", warnings: [], error: err instanceof Error ? err.message : String(err) });
        await moveTo(dir, "failed", file);
      }
    }
  });
  return reports;
}

async function moveTo(dir: string, sub: string, file: string) {
  await mkdir(path.join(dir, sub), { recursive: true });
  await rename(path.join(dir, file), path.join(dir, sub, `${new Date().toISOString().replace(/[:.]/g, "-")}_${file}`));
}

/** Per-request: pulls in any dropped bundles, then reads the investment data. */
export const loadInvest = cache(async (ctx: Ctx): Promise<{ db: InvestDB; inbox: InboxReport[] }> => {
  const inbox = await importInbox(ctx);
  return { db: await readInvest(ctx), inbox };
});
