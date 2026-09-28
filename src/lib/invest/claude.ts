import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { krw, pct, type PortfolioMetrics } from "./calc";
import { BUNDLE_SPEC, PRINCIPLES, SKILLS } from "./skills";
import { ASSET_LABEL, type InvestDB, type SkillId } from "./types";

const ROLE = `너는 개인 투자자의 리서치 보조다. 리서치·정리·원자료 수집까지만 하고, 매매 판단은 사용자가 한다. 한국어로 쓴다.`;

// Stable across runs, so it is cached; everything run-specific goes in the user message.
const SYSTEM: Anthropic.Beta.BetaTextBlockParam[] = [
  { type: "text", text: `${ROLE}\n\n${PRINCIPLES}\n\n${BUNDLE_SPEC}`, cache_control: { type: "ephemeral" } },
];

const MAX_CONTINUATIONS = 6;

export function apiEnabled(): boolean {
  return Boolean(config.anthropicApiKey);
}

export function buildContext(db: InvestDB, metrics: PortfolioMetrics, today: string, ticker?: string): string {
  const lines = [`# 컨텍스트`, `오늘: ${today} (${config.timeZone})`];
  if (ticker) {
    const h = db.holdings.find((x) => x.ticker === ticker);
    lines.push(`분석 대상: ${ticker}${h ? ` (${h.name}, ${ASSET_LABEL[h.assetType]}, 보유 중)` : " (관심 종목)"}`);
  }
  if (db.holdings.length) {
    lines.push(`\n## 보유 종목 (비중은 앱 계산)`);
    for (const p of metrics.positions) {
      const h = p.holding;
      lines.push(`- ${h.ticker} ${h.name} · ${ASSET_LABEL[h.assetType]} · ${h.currency} · 비중 ${pct(p.weight)}${h.sector ? ` · ${h.sector}` : ""}`);
    }
  }
  if (db.watchlist.length) lines.push(`\n## 관심 종목\n${db.watchlist.join(", ")}`);
  if (db.themes.length) lines.push(`\n## 관심 테마\n${db.themes.join(", ")}`);
  if (!ticker && db.holdings.length) {
    lines.push(
      `\n## 앱 계산값 (다시 계산하지 말 것)`,
      `- 평가액 ${krw(metrics.totalKrw)}, 평가손익 ${krw(metrics.pnlKrw)} (${pct(metrics.returnPct)})`,
      `- HHI ${metrics.hhi.toFixed(0)}, 유효 종목 수 ${metrics.effectiveN.toFixed(1)}, 최대 비중 ${pct(metrics.topWeight)}`,
      `- 해외자산 비중 ${pct(metrics.fxExposure)}, 원/달러 +10% 시 평가액 ${krw(metrics.fxShock10Krw)} 변화`,
      `- 자산 유형: ${metrics.byAssetType.map((x) => `${ASSET_LABEL[x.type]} ${pct(x.weight)}`).join(", ")}`,
      metrics.hiddenOverlap.length
        ? `- ETF 경유 중복: ${metrics.hiddenOverlap.map((e) => `${e.ticker} 직접 ${pct(e.direct)} + ETF ${pct(e.viaEtf)}`).join(", ")}`
        : `- ETF 경유 중복: 없음 (ETF 구성종목 입력분 기준)`,
    );
  }
  const upcoming = db.events.filter((e) => e.date >= today).slice(0, 10);
  if (upcoming.length) lines.push(`\n## 이미 알고 있는 일정\n${upcoming.map((e) => `- ${e.date} ${e.ticker ?? ""} ${e.title}`).join("\n")}`);
  return lines.join("\n");
}

export interface RunOutput {
  text: string;
  model: string;
}

/** Runs one skill with web search and returns the final text (which should end in the JSON bundle). */
export type Effort = "low" | "medium" | "high";

export async function runSkill(skill: SkillId | "refresh", context: string, effort: Effort = "high"): Promise<RunOutput> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const model = config.anthropicModel;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `${SKILLS[skill].instructions}\n\n${context}\n\n마지막에 반드시 \`\`\`json 번들 블록으로 끝낸다.` },
  ];
  // Server-side refusal fallback only exists on these models.
  const fallback = /^claude-(opus-5|fable-5-1)$/.test(model)
    ? { betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const }
    : {};

  let text = "";
  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 64000,
      system: SYSTEM,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 20 }],
      ...fallback,
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new Error("Claude가 이 요청을 처리하지 않았습니다 (refusal).");
    text += msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    // Long web-search turns pause server-side; resend with the partial turn to let it continue.
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.stop_reason === "max_tokens") throw new Error("응답이 길이 한도에서 잘렸습니다. 다시 시도하세요.");
    return { text, model: msg.model };
  }
  throw new Error("웹 검색이 너무 오래 이어져 중단했습니다.");
}

export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY가 올바르지 않습니다.";
  if (err instanceof Anthropic.RateLimitError) return "요청 한도에 걸렸습니다. 잠시 뒤 다시 시도하세요.";
  if (err instanceof Anthropic.BadRequestError) return `요청 오류: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Claude API 오류 (${err.status ?? "network"}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
