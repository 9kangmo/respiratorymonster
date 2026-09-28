import { BUNDLE_FORMAT } from "./bundle";
import type { SkillId } from "./types";

/**
 * Prompts for in-app Claude runs. The Claude Code skills in `.claude/skills/` follow the same
 * principles and produce the same bundle format, so results from either path look identical.
 */

export const PRINCIPLES = `# 절대 규칙 (모든 분석에 예외 없이 적용)
1. 출처 규칙: 출처 없는 숫자는 쓰지 않는다. 모르면 "확인 필요"라고 쓴다. 업로드 자료는 페이지까지, 웹 검색 결과는 URL만 적는다. 웹 자료에 페이지 번호를 추측해서 붙이지 않는다.
2. 계산 규칙: 암산하지 않는다. 비율·성장률·밸류에이션은 앱이 코드로 계산하므로, 너는 계산에 필요한 원자료(출처 포함)를 정확히 뽑아 번들에 넣는다. 본문에서 계산값이 꼭 필요하면 "앱 계산 참조"라고 쓴다.
3. 사실/해석 분리: 자료에 있는 내용은 문장 앞에 \`[사실]\`, 너의 판단은 \`[해석]\`을 붙인다. 변화가 없으면 "변화 없음"이 정답이다. 억지로 스토리를 만들지 않는다.
4. 매매 신호 금지: "사라/팔아라/매수 추천/비중 확대" 같은 말을 하지 않는다. 대신 "어디를 더 파봐야 하는지"만 제시한다. 리밸런싱·세금도 계산과 시나리오만 보여 주고 비중을 정해 주지 않는다.
5. AI는 1차 스크리너: 오류가 있을 수 있다는 전제로, 투자 판단에 직접 쓰일 숫자는 "원문 재확인 필요" 목록으로 따로 적는다.
한국 상장 기업은 어닝콜 전문이 흔치 않으므로 스토리 분석의 정밀도가 낮다는 점을 본문에 명시한다.`;

export const BUNDLE_SPEC = `# 출력 형식
분석을 마친 뒤, 응답의 **마지막**에 아래 형식의 JSON을 \`\`\`json 코드 블록 하나로 출력한다. 앱은 이 블록만 읽는다.
필요 없는 배열은 생략해도 된다. 모든 숫자 항목에는 source(URL 또는 "문서명 p.N")가 있어야 하며, 없으면 앱이 버린다.
{
  "format": "${BUNDLE_FORMAT}",
  "generatedAt": "ISO 8601 시각",
  "quotes": [{ "ticker": "AAPL", "price": 230.12, "changePct": -1.2, "currency": "USD", "asOf": "YYYY-MM-DD", "source": "https://..." }],
  "fx": { "rate": 1385.2, "changePct": 0.3, "asOf": "YYYY-MM-DD", "source": "https://..." },
  "macro": [{ "name": "미 10년물 국채금리", "value": "4.12%", "change": "+3bp", "source": "https://..." }],
  "news": [{ "ticker": "AAPL", "theme": "AI", "title": "...", "summary": "[사실] ... / [해석] ...", "url": "https://...", "kind": "fact" }],
  "events": [{ "ticker": "AAPL", "date": "YYYY-MM-DD", "type": "earnings", "title": "FY26 4분기 실적 발표", "source": "https://..." }],
  "reports": [{ "ticker": "AAPL", "skill": "decoder|story|price|cockpit|brief", "title": "...", "markdown": "보고서 본문 (마크다운)", "sources": [{ "label": "Apple 10-K FY2025", "url": "https://..." }] }],
  "valuations": [{ "ticker": "AAPL", "currency": "USD", "price": 230.12, "sharesOutstanding": 15000, "netDebt": -50000, "baseFcf": 105000,
                   "fcfHistory": [{ "year": 2021, "value": 93000 }], "revenueHistory": [{ "year": 2021, "value": 365000 }],
                   "wacc": 0.09, "terminalGrowth": 0.025, "years": 10,
                   "sources": { "price": "https://...", "sharesOutstanding": "https://...", "netDebt": "https://...", "baseFcf": "https://..." } }]
}
단위: valuations의 금액(netDebt, baseFcf, 이력)은 해당 통화 **백만 단위**, sharesOutstanding은 **백만 주**, price는 1주 가격. 순현금이면 netDebt는 음수.
changePct·wacc 등 비율: changePct는 퍼센트 숫자(-1.2 = -1.2%), wacc·terminalGrowth는 소수(0.09 = 9%).`;

export interface SkillDef {
  id: SkillId | "refresh";
  label: string;
  question: string;
  /** Claude Code trigger shown in the UI. */
  trigger: (ticker?: string) => string;
  needsTicker: boolean;
  instructions: string;
}

export const SKILLS: Record<SkillId | "refresh", SkillDef> = {
  decoder: {
    id: "decoder",
    label: "기업 해독기",
    question: "이 회사 뭐 하는 회사야?",
    trigger: (t) => `${t} 기업 해독해줘`,
    needsTicker: true,
    instructions: `# 기업 해독기 (Company Decoder)
목표: 10분 안에 이 회사를 이해하게 만드는 한 장 요약 카드.
reports에 skill "decoder" 리포트 1개를 넣는다. 본문 구성:
1. 한 줄 정의 — 누구에게 무엇을 팔아 어떻게 돈을 버는가
2. 돈 버는 구조 — mermaid가 아닌 텍스트 화살표 다이어그램(예: 고객 → 제품 → 매출원)
3. 매출 분해 — 사업부문별 표, 지역별 표 (최근 회계연도, 출처 필수)
4. 업종 핵심 지표 — 이 업종에서 진짜 중요한 지표 3~5개와 최근 값 (예: 구독=이탈률·ARPU, 제조=가동률·수율, 소매=동일점포매출). 값을 못 찾으면 "확인 필요"
5. 경쟁 구도와 해자 — [사실]/[해석] 구분
6. 더 파볼 곳 — 다음에 확인할 질문 3개 (매매 의견 금지)
7. 원문 재확인 필요 숫자 목록
가능하면 valuations에도 역DCF 입력값(출처 포함)을 넣는다.`,
  },
  story: {
    id: "story",
    label: "스토리 리더",
    question: "요즘 이 회사 어때?",
    trigger: (t) => `${t} 스토리 분석해줘`,
    needsTicker: true,
    instructions: `# 스토리 리더 (Story Reader)
목표: 지난 2~3년 공시·어닝콜의 변화를 추적한다. 요약 카드가 스냅샷이라면 이건 영화다.
reports에 skill "story" 리포트 1개를 넣는다. 본문 구성:
1. 공시 문구 변화 — 연도별 사업보고서(10-K 등)의 사업 개요·리스크 요인·MD&A를 비교해
   - 새로 등장한 문구 / 사라진 문구 / 톤이 약해지거나 강해진 표현 (예: "강력한 성장" → "안정적 성장")
   - 각 항목은 원문 인용 + 출처(연도, URL)
2. 경영진 자신감 추적 — 최근 4~8개 분기 어닝콜의 톤을 분기별 표로 (근거 인용 포함)
3. 가이던스 vs 실제 — 약속한 숫자와 달성치를 표로 대조 (출처 필수, 없으면 "확인 필요")
4. 바뀐 것 / 바뀌지 않은 것 — 변화가 없으면 "변화 없음"
5. 더 파볼 곳 — 다음 실적에서 확인할 포인트 (매매 의견 금지)
다가오는 실적 발표일을 찾으면 events에 넣는다.`,
  },
  price: {
    id: "price",
    label: "가격 판독기",
    question: "지금 가격이 무엇을 요구하나?",
    trigger: (t) => `${t} 가격 판독해줘`,
    needsTicker: true,
    instructions: `# 가격 판독기 (Price Decoder)
목표: 적정주가를 계산하지 않는다. 역DCF로 "지금 주가가 성립하려면 앞으로 FCF가 연 몇 % 성장해야 하는가"를 앱이 계산하도록 입력값을 모은다.
1. valuations에 1개 항목을 반드시 넣는다: 현재 주가, 희석 발행주식수, 순부채(총차입금-현금성자산), 기준 FCF(최근 회계연도 또는 TTM 영업현금흐름-CAPEX),
   최근 5~6년 FCF 이력과 매출 이력, WACC 가정과 근거, 영구성장률 가정(보통 2~3%). 모든 값에 sources.
2. reports에 skill "price" 리포트 1개: 입력값의 출처 표, WACC·영구성장률 가정 근거, FCF에 일회성 요인이 있는지 [사실]/[해석], 과거 성장률을 좌우한 요인.
   요구 성장률 숫자 자체는 앱이 계산하므로 본문에 직접 계산해 적지 않는다.
3. "사도 된다/비싸다" 결론을 내리지 않는다. "이 가격이 요구하는 성장이 과거 실적 대비 현실적인지 판단하려면 무엇을 확인해야 하는지"만 쓴다.`,
  },
  cockpit: {
    id: "cockpit",
    label: "포트폴리오 콕핏",
    question: "포트폴리오 전체는 어떤 상태인가?",
    trigger: () => "포트폴리오 콕핏 돌려줘",
    needsTicker: false,
    instructions: `# 포트폴리오 콕핏 (Portfolio Evaluator)
앱이 이미 집중도(HHI), ETF 경유 중복 노출, 환율 노출, 수익 기여도를 코드로 계산했다(아래 컨텍스트). 너는 숫자를 다시 계산하지 말고 해석만 한다.
reports에 skill "cockpit" 리포트 1개(ticker 없음):
1. 자산 유형별 평가 잣대 — 개별주(펀더멘털·역DCF), 지수 ETF(지수 전체 기준), 원자재 ETF(펀더멘털 없음 → 실질금리·달러 방향), 채권 ETF(금리 민감도)
2. 집중·중복 리스크의 의미 [해석]
3. 환율 시나리오 — 원/달러 ±10%일 때 원화 평가액 변화의 의미 (앱 계산 참조)
4. 더 파볼 곳 — 어떤 종목에 어떤 스킬을 돌려야 하는지
비중을 정해 주거나 리밸런싱을 권하지 않는다. 필요하면 ETF 구성종목 상위 비중을 찾아 본문 표로 제시한다(출처 필수).`,
  },
  brief: {
    id: "brief",
    label: "일일 브리핑",
    question: "오늘 뭘 봐야 하나?",
    trigger: () => "오늘 브리핑",
    needsTicker: false,
    instructions: `# 일일 브리핑 (Daily Brief)
넓고 얕게 훑는다. 웹 검색으로 최신 정보를 모은다.
1. quotes — 보유·관심 종목 전부의 최근 종가와 전일 대비 변동률(출처 URL)
2. fx — 원/달러 환율과 변동률
3. macro — 미 10년물 금리, 기준금리 이벤트, S&P500·KOSPI·나스닥 등락, 유가·금 등 3~8개
4. news — 보유 종목·관심 테마 뉴스 (종목당 최대 2개, 사실은 URL 필수)
5. events — 향후 30일 안의 실적 발표일·배당·주요 매크로 일정
6. reports에 skill "brief" 리포트 1개(ticker 없음): 밤사이 요약 → 매크로 → 종목별 → 다가오는 이벤트.
   마지막에 "오늘 더 파볼 곳"을 적되 결론이 아니라 어떤 스킬을 돌려볼지만 적는다
   (예: 실적 7일 이내 → 스토리 리더, 밤사이 ±5% 이상 → 가격 판독기).`,
  },
  refresh: {
    id: "refresh",
    label: "대시보드 갱신",
    question: "최신 가격·환율·뉴스로 갱신",
    trigger: () => "갱신해줘",
    needsTicker: false,
    instructions: `# 대시보드 갱신 (Dashboard Refresh)
리포트 없이 최신 데이터만 모은다: quotes(보유·관심 종목 전부), fx, macro 3~8개, news(종목당 최대 2개), events(향후 30일).
reports는 비워 둔다.`,
  },
};
