# 리서치 번들 형식 (`rm-invest-bundle/1`)

스킬 결과를 앱에 넣는 유일한 통로. 앱은 번들을 검증한 뒤 반영하고, 계산은 앱이 코드로 한다
(검증 로직: `src/lib/invest/bundle.ts`, 같은 검사를 `npm run -s invest -- check <file>`로 미리 돌릴 수 있다).

```json
{
  "format": "rm-invest-bundle/1",
  "generatedAt": "2026-09-28T07:30:00+09:00",
  "quotes": [{ "ticker": "AAPL", "price": 230.12, "changePct": -1.2, "currency": "USD", "asOf": "2026-09-27", "source": "https://..." }],
  "fx": { "rate": 1385.2, "changePct": 0.3, "asOf": "2026-09-28", "source": "https://..." },
  "macro": [{ "name": "미 10년물 국채금리", "value": "4.12%", "change": "+3bp", "source": "https://..." }],
  "news": [{ "ticker": "AAPL", "theme": "AI", "title": "...", "summary": "[사실] ... [해석] ...", "url": "https://...", "kind": "fact" }],
  "events": [{ "ticker": "AAPL", "date": "2026-10-30", "type": "earnings", "title": "FY26 4분기 실적 발표", "source": "https://..." }],
  "reports": [{
    "ticker": "AAPL", "skill": "decoder", "title": "Apple 한 장 요약",
    "markdown": "## 한 줄 정의\n[사실] ...",
    "sources": [{ "label": "Apple 10-K FY2025", "url": "https://..." }, { "label": "업로드: 10-K.pdf", "page": 45 }]
  }],
  "valuations": [{
    "ticker": "AAPL", "currency": "USD", "price": 230.12, "sharesOutstanding": 15000, "netDebt": -50000, "baseFcf": 105000,
    "fcfHistory": [{ "year": 2021, "value": 93000 }], "revenueHistory": [{ "year": 2021, "value": 365000 }],
    "wacc": 0.09, "terminalGrowth": 0.025, "years": 10,
    "sources": { "price": "https://...", "sharesOutstanding": "https://...", "netDebt": "https://...", "baseFcf": "https://...", "wacc": "가정: 무위험 4.1% + β1.1×ERP 4.5%" }
  }]
}
```

| 필드 | 규칙 |
| --- | --- |
| `quotes`, `fx`, `macro` | `source` 없으면 **버린다**. `changePct`는 퍼센트 숫자(-1.2 = -1.2%). `fx.rate`는 1달러당 원. |
| `news` | `kind: "fact"`는 `url` 필수. AI 해석은 `kind: "interpretation"`. |
| `events` | `type`: `earnings` · `dividend` · `macro` · `other`. 같은 종목·같은 분기의 실적 일정은 하나로 합쳐진다. |
| `reports` | `skill`: `decoder` · `story` · `price` · `cockpit` · `brief`. 종목 리포트는 `ticker` 필수. 웹 출처에 `page`를 붙이면 경고. 매매 권유 표현이 있으면 경고. |
| `valuations` | 금액은 해당 통화 **백만 단위**, `sharesOutstanding`은 **백만 주**, `price`는 1주 가격. 순현금이면 `netDebt` 음수. `wacc`·`terminalGrowth`는 소수(0.09). `sources`에 price·sharesOutstanding·netDebt·baseFcf가 없으면 "확인 필요"로 표시된다. |
| `watchlist` | (선택) 관심 종목 티커 배열. |
