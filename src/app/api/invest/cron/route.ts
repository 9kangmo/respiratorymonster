import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { config } from "@/lib/config";
import { errorMessage } from "@/lib/context";
import { todayIn, zonedParts } from "@/lib/dates";
import { apiEnabled, describeApiError } from "@/lib/invest/claude";
import { cronCtx, openCronKey, runAndIngest, summarizeImport } from "@/lib/invest/runner";
import { mutateInvest, readInvest } from "@/lib/invest/store";

// Scheduled by vercel.json. A web-search brief takes a few minutes.
export const maxDuration = 300;

function authorized(request: Request): boolean {
  if (!config.cronSecret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${config.cronSecret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!apiEnabled()) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY가 없습니다." }, { status: 400 });
  const owner = await openCronKey(config.investCronToken);
  if (!owner) return NextResponse.json({ ok: false, error: "INVEST_CRON_TOKEN이 없거나 올바르지 않습니다." }, { status: 400 });
  if (config.allowedEmails.length && !config.allowedEmails.includes(owner.email.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "허용되지 않은 계정입니다." }, { status: 403 });
  }

  const ctx = cronCtx(owner);
  const today = todayIn(config.timeZone);
  const record = (ok: boolean, message: string) =>
    mutateInvest(ctx, (db) => {
      db.autoRun = { at: new Date().toISOString(), ok, message };
    });

  try {
    const db = await readInvest(ctx);
    // Nothing to brief on yet, or already briefed today (e.g. run by hand) — don't pay twice.
    if (db.holdings.length === 0 && db.watchlist.length === 0) return NextResponse.json({ ok: true, skipped: "no holdings" });
    if (db.reports.some((r) => r.skill === "brief" && zonedParts(r.createdAt, config.timeZone).date === today)) {
      return NextResponse.json({ ok: true, skipped: "already briefed today" });
    }
    const result = await runAndIngest(ctx, "brief", undefined, "medium");
    const summary = summarizeImport(result);
    await record(true, summary);
    revalidatePath("/invest", "layout");
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = describeApiError(err) || errorMessage(err);
    await record(false, message).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
