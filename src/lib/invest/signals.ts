import { diffDays } from "../dates";
import type { PortfolioMetrics } from "./calc";
import type { InvestDB, SkillId } from "./types";

/**
 * "Where to dig next" — never "buy/sell". Each signal names the skill to run and why.
 */
export interface ActionSignal {
  key: string;
  ticker?: string;
  skill?: SkillId | "refresh";
  level: "high" | "medium" | "low";
  title: string;
  reason: string;
}

export const SIGNAL_RULES = {
  earningsWithinDays: 7,
  bigMovePct: 5,
  fxMovePct: 1,
  staleQuoteDays: 3,
  staleValuationDays: 90,
  concentrationWeight: 0.25,
};

export function actionSignals(db: InvestDB, metrics: PortfolioMetrics, today: string): ActionSignal[] {
  const out: ActionSignal[] = [];
  const held = new Set(db.holdings.map((h) => h.ticker));
  const tracked = new Set([...held, ...db.watchlist]);
  const latest = (ticker: string, skill: SkillId) =>
    db.reports.filter((r) => r.ticker === ticker && r.skill === skill).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  for (const e of db.events) {
    if (e.type !== "earnings" || !e.ticker || !tracked.has(e.ticker)) continue;
    const d = diffDays(today, e.date);
    if (d < 0 || d > SIGNAL_RULES.earningsWithinDays) continue;
    const story = latest(e.ticker, "story");
    const fresh = story && diffDays(story.createdAt.slice(0, 10), today) <= 14;
    out.push({
      key: `earn:${e.ticker}:${e.date}`,
      ticker: e.ticker,
      skill: "story",
      level: d <= 3 ? "high" : "medium",
      title: `${e.ticker} 실적 발표 ${d === 0 ? "오늘" : `D-${d}`}`,
      reason: fresh
        ? "최근 2주 안의 스토리 분석이 있습니다. 발표 뒤 가이던스 대비 실적을 다시 대조해 보세요."
        : "발표 전에 스토리 리더로 지난 가이던스와 경영진 톤 변화를 정리해 두세요.",
    });
  }

  for (const ticker of tracked) {
    const q = db.quotes[ticker];
    if (q?.changePct !== undefined && Math.abs(q.changePct) >= SIGNAL_RULES.bigMovePct) {
      out.push({
        key: `move:${ticker}`,
        ticker,
        skill: "price",
        level: "high",
        title: `${ticker} ${q.changePct > 0 ? "+" : ""}${q.changePct.toFixed(1)}% 변동`,
        reason: "가격 판독기로 지금 가격이 요구하는 성장률이 어떻게 바뀌었는지 재점검하세요.",
      });
    }
  }

  for (const h of db.holdings) {
    if (h.assetType !== "stock") continue;
    if (!latest(h.ticker, "decoder")) {
      out.push({
        key: `decoder:${h.ticker}`,
        ticker: h.ticker,
        skill: "decoder",
        level: "low",
        title: `${h.ticker} 요약 카드 없음`,
        reason: "기업 해독기로 사업 구조·매출 구성·핵심 지표 카드를 먼저 만들어 두세요.",
      });
    }
    const val = db.valuations.filter((v) => v.ticker === h.ticker).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (val && diffDays(val.createdAt.slice(0, 10), today) > SIGNAL_RULES.staleValuationDays) {
      out.push({
        key: `val:${h.ticker}`,
        ticker: h.ticker,
        skill: "price",
        level: "low",
        title: `${h.ticker} 역DCF ${diffDays(val.createdAt.slice(0, 10), today)}일 경과`,
        reason: "최근 실적과 주가로 입력값을 갱신할 때가 됐습니다.",
      });
    }
  }

  if (db.fx?.changePct !== undefined && Math.abs(db.fx.changePct) >= SIGNAL_RULES.fxMovePct && metrics.fxExposure > 0) {
    out.push({
      key: "fx",
      skill: "cockpit",
      level: "medium",
      title: `원/달러 ${db.fx.changePct > 0 ? "+" : ""}${db.fx.changePct.toFixed(2)}%`,
      reason: `해외자산 비중 ${(metrics.fxExposure * 100).toFixed(0)}% — 콕핏에서 원화 환산 수익률 영향을 확인하세요.`,
    });
  }

  const top = metrics.positions[0];
  if (top && top.weight >= SIGNAL_RULES.concentrationWeight && metrics.positions.length > 1) {
    out.push({
      key: "concentration",
      ticker: top.holding.ticker,
      skill: "cockpit",
      level: "low",
      title: `${top.holding.ticker} 비중 ${(top.weight * 100).toFixed(0)}%`,
      reason: "한 종목 비중이 큽니다. 콕핏에서 집중도와 ETF 경유 중복 노출을 함께 보세요.",
    });
  }

  const stale = [...held].filter((t) => {
    const h = db.holdings.find((x) => x.ticker === t);
    if (h?.assetType === "cash") return false;
    const q = db.quotes[t];
    return !q || diffDays(q.asOf.slice(0, 10), today) > SIGNAL_RULES.staleQuoteDays;
  });
  if (stale.length) {
    out.push({
      key: "stale",
      skill: "refresh",
      level: "medium",
      title: `시세 갱신 필요 ${stale.length}종목`,
      reason: `${stale.slice(0, 5).join(", ")}${stale.length > 5 ? " 외" : ""} — 시세가 없거나 ${SIGNAL_RULES.staleQuoteDays}일이 지났습니다. '갱신'을 실행하세요.`,
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
