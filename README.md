# 연구 일정 관리

연구 프로젝트·과제·마일스톤을 관리하고 **구글캘린더와 양방향으로 동기화**하는 개인용 웹앱입니다 (Next.js 16).

- **대시보드**: 지연된 과제, 14일 안의 마감, 오늘의 구글캘린더 일정, 다가오는 마일스톤, 프로젝트 진행률
- **프로젝트**: 칸반 보드(할 일 / 진행 중 / 완료), 마일스톤 타임라인, 우선순위, 종일·시간·여러 날 일정
- **캘린더**: 월간 보기. 모든 구글캘린더 일정과 과제를 함께 표시하고, 캘린더별로 표시/숨기기
- **구글캘린더 동기화**
  - 앱 → 구글: 마감일이 있는 과제·마일스톤은 전용 캘린더 `연구 일정`에 일정으로 등록됩니다. 수정, 완료(제목 앞 ✓, 회색), 삭제도 반영됩니다.
  - 구글 → 앱: 그 캘린더에서 날짜·시간·제목·메모를 바꾸면 과제에 반영되고, 일정을 지우면 과제는 남은 채 캘린더 연결만 해제됩니다.
  - 그 캘린더에 직접 추가한 일정은 `캘린더에서 가져옴` 프로젝트의 과제로 들어옵니다. 동기화 캘린더로 연결하기 전부터 있던 일정은 가져오지 않습니다.
  - 양쪽에서 모두 바뀌었으면 나중에 바뀐 쪽이 이깁니다.
  - 동기화는 화면을 열 때(마지막 동기화 후 5분이 지났으면) 자동으로 실행되고, 상단의 **동기화** 버튼으로 직접 실행할 수도 있습니다.
- 별도 DB 서버가 필요 없습니다. 데이터는 로컬 JSON 파일이나 **내 Google Drive의 앱 전용 숨김 폴더**에 저장됩니다.

## 1. Google Cloud 설정 (한 번만, 약 10분)

1. [Google Cloud Console](https://console.cloud.google.com/)에서 새 프로젝트를 만듭니다.
2. **API 및 서비스 → 라이브러리**에서 `Google Calendar API`와 `Google Drive API`를 **사용 설정**합니다.
3. **OAuth 동의 화면**(Google 인증 플랫폼)
   - 사용자 유형: **외부**. 앱 이름과 이메일을 입력합니다.
   - 데이터 액세스(범위)에 `.../auth/calendar`, `.../auth/drive.appdata`를 추가합니다.
   - 대상 → **테스트 사용자**에 내 Gmail 주소를 추가합니다.
4. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI:
     - `http://localhost:3000/api/auth/callback` (로컬)
     - `https://<배포 주소>/api/auth/callback` (배포할 경우)
   - 생성된 **클라이언트 ID / 보안 비밀**을 복사합니다.

> **로그인이 7일마다 풀린다면**: 앱이 "테스트" 상태이면 Google이 7일 뒤 토큰을 만료시킵니다.
> 개인용이라면 OAuth 동의 화면의 게시 상태를 **프로덕션으로 푸시**하세요. 검증을 받지 않아도 되고,
> 로그인할 때 "확인되지 않은 앱" 경고가 나오면 *고급 → 이동*을 누르면 됩니다.

## 2. 로컬 실행

```bash
cp .env.example .env.local   # 값을 채웁니다 (SESSION_SECRET: openssl rand -base64 32)
npm install
npm run dev                  # http://localhost:3000
```

로컬에서는 데이터가 `.data/<이메일>.json`에 저장됩니다.

## 3. 배포 (예: Vercel, 무료)

1. 이 저장소를 Vercel에 가져옵니다.
2. 환경 변수 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `APP_URL`을 설정합니다.
   Vercel에서는 자동으로 `STORAGE=drive`가 되어 데이터가 Google Drive 앱 폴더에 저장됩니다.
3. Google Cloud의 리디렉션 URI에 `https://<배포 주소>/api/auth/callback`을 추가합니다.

## 개발

```bash
npm test          # 단위 테스트 (가짜 Google Calendar API로 동기화 시나리오 검증)
npm run typecheck
npm run lint
```

| 경로 | 내용 |
| --- | --- |
| `src/lib/sync.ts` | 양방향 동기화 (push / pull / 충돌 처리 / 캘린더 재생성) |
| `src/lib/mapping.ts` | 과제 ↔ 구글 일정 변환 |
| `src/lib/google/*` | OAuth, Calendar·Drive REST 클라이언트 |
| `src/lib/store.ts` | 저장소 (로컬 파일 / Drive appDataFolder) |
| `src/lib/actions.ts` | 서버 액션 (프로젝트·과제 CRUD, 동기화, 설정) |
| `src/app/(app)/*` | 대시보드, 프로젝트, 과제, 캘린더, 설정 화면 |
| `test/*` | vitest 테스트, `fakeGoogle.ts`는 메모리 기반 가짜 Calendar API |

### 동작 방식 메모

- 과제와 일정은 일정의 비공개 확장 속성 `rmTaskId`로 연결됩니다.
- 반복 일정은 가져오지 않습니다. 동기화 범위는 최근 1년 이후의 일정입니다.
- 동기화 캘린더를 설정에서 다른 캘린더로 바꾸면 연결된 일정이 새 캘린더로 옮겨집니다. 개인 일정과 섞이지 않도록 전용 캘린더를 권장합니다.
