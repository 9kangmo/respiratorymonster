---
name: invest-dashboard-refresh
description: 대시보드 갱신 — "갱신해줘" 한마디로 최신 가격·환율·매크로·뉴스·일정을 모아 투자 대시보드에 반영한다. 매일 자동이 아니라 부를 때만 도는 반자동 방식(구독 한도 안). "갱신해줘", "시세 업데이트", "대시보드 새로고침" 요청에 사용.
---

# 대시보드 갱신 (Dashboard Refresh)

리포트 없이 데이터만 최신화한다. 별도 API 과금 없이 Claude Code 구독 안에서 돈다.

## 시작 전에 (모든 투자 스킬 공통)
1. `docs/invest/principles.md`(절대 규칙)와 `docs/invest/bundle-format.md`(출력 형식)를 읽는다.
2. 포트폴리오 컨텍스트: `.data/*.invest.json`이 있으면 `holdings`(ticker·name·assetType·currency·sector), `watchlist`, `themes`, `events`만 읽는다. 없으면(배포 모드) 사용자에게 보유·관심 종목을 묻는다. 수량·평균단가는 필요할 때만 쓴다.
3. 오늘 날짜와 시간대(기본 Asia/Seoul)를 확인한다.

## 절차
1. 웹 검색으로 `quotes`(보유·관심 종목 전부), `fx`, `macro` 3~8개, `news`(종목당 최대 2개), `events`(향후 30일)를 모은다. 모든 숫자에 URL. `reports`는 비운다.
2. 저장 후 앱 확인:
   - 로컬 앱이 떠 있지 않으면 `npm run dev`를 백그라운드로 띄운다.
   - 사용자에게 `http://localhost:3000/invest`를 열라고 안내한다(로그인이 필요해서 스킬이 대신 열 수 없다). 화면을 열면 번들이 자동으로 들어가고 상단에 "가져왔습니다" 알림이 뜬다.
   - 시세가 비어 있는 종목("확인 필요")이 남으면 그 목록을 알려 준다.

## 저장 (모든 투자 스킬 공통)
1. 번들을 `invest-inbox/drafts/<YYYYMMDD-HHMM>-<스킬>[-<TICKER>].json`에 쓴다.
2. `npm run -s invest -- check <파일>`로 검증한다. `WARN`이 나오면 원인을 고친다(출처 추가, 매매 표현 제거, 웹 출처의 페이지 번호 삭제). 고칠 수 없으면 그대로 두고 사용자에게 알린다.
3. `npm run -s invest -- save <파일>`로 `invest-inbox/`에 넣는다. 로컬 앱은 화면을 열 때 자동으로 가져간다. 배포 앱을 쓰면 사용자에게 파일을 **가져오기** 화면에 올리라고 안내한다.
4. 채팅에는 리포트 본문 요약과 "원문 재확인 필요" 목록, 저장 경로를 보여 준다. 매매 의견으로 끝맺지 않는다.
