import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { errorMessage, getCtx, rethrowControl } from "@/lib/context";
import { normalizeTicker } from "@/lib/invest/bundle";
import { apiEnabled, describeApiError } from "@/lib/invest/claude";
import { runAndIngest, summarizeImport } from "@/lib/invest/runner";
import { SKILLS } from "@/lib/invest/skills";
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
    const result = await runAndIngest(ctx, skill, ticker);
    revalidatePath("/invest", "layout");
    return NextResponse.json({ ok: true, summary: summarizeImport(result), warnings: result.warnings });
  } catch (err) {
    rethrowControl(err);
    return NextResponse.json({ ok: false, error: describeApiError(err) || errorMessage(err) }, { status: 502 });
  }
}
