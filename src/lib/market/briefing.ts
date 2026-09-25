import Anthropic from "@anthropic-ai/sdk";
import type { Briefing, Sentiment } from "../types";
import { changeLabel, formatNumber, type Indicator } from "./indicators";
import type { NewsItem } from "./news";
import type { HoldingView } from "./portfolio";

const MODEL = "claude-opus-5";

const SYSTEM = `당신은 개인 투자자를 돕는 한국어 시장 뉴스 애널리스트입니다.
보유 종목별 최근 뉴스 헤드라인과 거시 지표(금리, 환율, 금, 유가)를 받아 투자자가 1분 안에 읽을 수 있게 정리합니다.
- 헤드라인에 근거한 사실만 쓰고, 헤드라인에 없는 수치나 사건을 지어내지 마세요.
- 같은 사건을 다룬 여러 기사는 하나로 묶으세요.
- 종목별 sentiment는 뉴스가 그 종목 주가에 미칠 방향(긍정/중립/부정)입니다. 판단 근거가 약하면 중립.
- 매수·매도 권유는 하지 마세요.
- 뉴스가 없는 종목은 summary에 "최근 뉴스 없음"이라고 쓰고 points는 비워 두세요.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "macro", "holdings"],
  properties: {
    overview: { type: "string", description: "보유 종목 전체에 대한 2~3문장 요약" },
    macro: { type: "string", description: "금리·환율·금·유가 흐름과 보유 종목에 주는 시사점, 2~3문장" },
    holdings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "sentiment", "summary", "points"],
        properties: {
          id: { type: "string" },
          sentiment: { type: "string", enum: ["긍정", "중립", "부정"] },
          summary: { type: "string", description: "한 문장 요약" },
          points: { type: "array", items: { type: "string" }, description: "핵심 이슈 최대 3개" },
        },
      },
    },
  },
} as const;

function headlines(news: NewsItem[], limit: number): string {
  if (!news.length) return "  (뉴스 없음)";
  return news
    .slice(0, limit)
    .map((n) => `  - ${n.title}${n.source ? ` (${n.source}` : ""}${n.publishedAt ? `, ${n.publishedAt.slice(0, 10)})` : n.source ? ")" : ""}`)
    .join("\n");
}

export function buildPrompt(views: HoldingView[], indicators: Indicator[], macroNews: NewsItem[]): string {
  const ind = indicators
    .filter((i) => i.value !== undefined)
    .map((i) => `- ${i.label}: ${formatNumber(i.value!, i.digits)}${i.unit === "%" ? "%" : ` ${i.unit}`}${changeLabel(i) ? ` (${changeLabel(i)!.text})` : ""}`)
    .join("\n");
  const holdings = views
    .map((v) => {
      const q = v.quote;
      const chg = q?.prevClose ? ` (전일 대비 ${(((q.price - q.prevClose) / q.prevClose) * 100).toFixed(2)}%)` : "";
      return `## id=${v.holding.id} ${v.holding.name} (${v.holding.symbol})${q ? ` 현재가 ${q.price}${q.currency ? ` ${q.currency}` : ""}${chg}` : ""}\n${headlines(v.news, 12)}`;
    })
    .join("\n\n");
  return `# 거시 지표\n${ind || "(불러오지 못함)"}\n\n# 시장 뉴스\n${headlines(macroNews, 12)}\n\n# 보유 종목 뉴스\n${holdings}`;
}

/** Summarises holding and macro news with Claude. Requires ANTHROPIC_API_KEY. */
export async function generateBriefing(views: HoldingView[], indicators: Indicator[], macroNews: NewsItem[]): Promise<Briefing> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(views, indicators, macroNews) }],
  });
  if (response.stop_reason === "refusal") throw new Error("AI가 요청을 처리하지 않았습니다.");
  if (response.stop_reason === "max_tokens") throw new Error("AI 응답이 너무 길어 잘렸습니다.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = JSON.parse(text) as {
    overview: string;
    macro: string;
    holdings: { id: string; sentiment: Sentiment; summary: string; points: string[] }[];
  };
  const ids = new Set(views.map((v) => v.holding.id));
  return {
    createdAt: new Date().toISOString(),
    overview: parsed.overview,
    macro: parsed.macro,
    holdings: parsed.holdings
      .filter((h) => ids.has(h.id))
      .map((h) => ({ holdingId: h.id, sentiment: h.sentiment, summary: h.summary, points: h.points.slice(0, 3) })),
  };
}
