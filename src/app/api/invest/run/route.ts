import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { config } from "@/lib/config";
import { errorMessage, getCtx, rethrowControl } from "@/lib/context";
import { todayIn } from "@/lib/dates";
import { applyBundle, extractBundleJson, normalizeTicker, summarizeImport } from "@/lib/invest/bundle";
import { portfolioMetrics } from "@/lib/invest/calc";
import { apiEnabled, buildContext, describeApiError, runSkill } from "@/lib/invest/claude";
import { SKILLS } from "@/lib/invest/skills";
import { mutateInvest, readInvest } from "@/lib/invest/store";
import type { SkillId } from "@/lib/invest/types";

// Web-search runs take minutes.
export const maxDuration = 300;

export async function POST(request: Request) {
  const ctx = await getCtx();
  if (!apiEnabled()) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { skill?: string; ticker?: string };
  const skill = body.skill && body.skill in SKILLS ? (body.skill as SkillId | "refresh") : null;
  if (!skill) return NextResponse.json({ ok: false, error: "알 수 없는 스킬입니다." }, { status: 400 });
  const ticker = normalizeTicker(body.ticker) ?? undefined;
  if (SKILLS[skill].needsTicker && !ticker) return NextResponse.json({ ok: false, error: "종목 코드가 필요합니다." }, { status: 400 });

  try {
    const db = await readInvest(ctx);
    const today = todayIn(config.timeZone);
    const context = buildContext(db, portfolioMetrics(db.holdings, db.quotes, db.fx), today, ticker);
    const { text } = await runSkill(skill, context);

    let bundle: unknown;
    const warnings: string[] = [];
    try {
      bundle = extractBundleJson(text);
    } catch {
      // Keep the analysis rather than losing a paid run; flag that numbers were not imported.
      warnings.push("응답에서 JSON 번들을 찾지 못해 본문만 리포트로 저장했습니다. 숫자는 반영되지 않았습니다.");
      bundle = skill === "refresh" ? {} : { reports: [{ ticker, skill, title: `${ticker ?? ""} ${SKILLS[skill].label}`.trim(), markdown: text, sources: [] }] };
    }
    const result = await mutateInvest(ctx, (d) => applyBundle(d, bundle, "api"));
    revalidatePath("/invest", "layout");
    return NextResponse.json({ ok: true, summary: summarizeImport(result), warnings: [...warnings, ...result.warnings] });
  } catch (err) {
    rethrowControl(err);
    return NextResponse.json({ ok: false, error: describeApiError(err) || errorMessage(err) }, { status: 502 });
  }
}
