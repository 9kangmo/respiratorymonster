import { EncryptJWT, jwtDecrypt } from "jose";
import { config } from "../config";
import type { Ctx } from "../context";
import { todayIn } from "../dates";
import { getAccessToken } from "../google/oauth";
import { sessionKey } from "../session";
import { getStore } from "../store";
import { applyBundle, extractBundleJson, summarizeImport, type ImportResult } from "./bundle";
import { portfolioMetrics } from "./calc";
import { buildContext, runSkill, type Effort } from "./claude";
import { SKILLS } from "./skills";
import { mutateInvest, readInvest } from "./store";
import type { SkillId } from "./types";

/** Runs a skill with Claude and merges the resulting bundle. Shared by the run button and the scheduled brief. */
export async function runAndIngest(ctx: Ctx, skill: SkillId | "refresh", ticker?: string, effort?: Effort): Promise<ImportResult> {
  const db = await readInvest(ctx);
  const today = todayIn(config.timeZone);
  const context = buildContext(db, portfolioMetrics(db.holdings, db.quotes, db.fx), today, ticker);
  const { text } = await runSkill(skill, context, effort);

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
  return { ...result, warnings: [...warnings, ...result.warnings] };
}

export { summarizeImport };

// ---------- scheduled brief ----------

/**
 * The scheduled brief runs without a browser session, but still needs the owner's Google access
 * (data lives in their Drive). The owner creates this key once while signed in and stores it as the
 * INVEST_CRON_TOKEN env var. It is encrypted with SESSION_SECRET, so it is useless without that secret.
 */
const CRON_PURPOSE = "invest-cron";

export async function sealCronKey(email: string, refreshToken: string): Promise<string> {
  return new EncryptJWT({ email, refreshToken, purpose: CRON_PURPOSE })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .encrypt(await sessionKey());
}

export async function openCronKey(raw: string): Promise<{ email: string; refreshToken: string } | null> {
  if (!raw || !config.sessionSecret) return null;
  try {
    const { payload } = await jwtDecrypt(raw.trim(), await sessionKey());
    if (payload.purpose !== CRON_PURPOSE || typeof payload.email !== "string" || typeof payload.refreshToken !== "string") return null;
    return { email: payload.email, refreshToken: payload.refreshToken };
  } catch {
    return null;
  }
}

/** A request context for the owner, built from the cron key instead of a cookie. */
export function cronCtx(owner: { email: string; refreshToken: string }): Ctx {
  const token = () => getAccessToken(owner.refreshToken);
  return { session: { email: owner.email, name: owner.email, refreshToken: owner.refreshToken }, token, store: getStore(owner.email, token) };
}
