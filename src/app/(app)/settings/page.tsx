import { SubmitButton } from "@/components/SubmitButton";
import { chooseSyncCalendar } from "@/lib/actions";
import { config } from "@/lib/config";
import { errorMessage, getCtx, readDB, rethrowControl } from "@/lib/context";
import { listCalendars, type CalendarListEntry } from "@/lib/google/calendar";
import { DEFAULT_CALENDAR_NAME } from "@/lib/sync";

export default async function SettingsPage() {
  const ctx = await getCtx();
  const db = await readDB(ctx);
  let calendars: CalendarListEntry[] = [];
  let error: string | undefined;
  try {
    calendars = await listCalendars(ctx.token);
  } catch (err) {
    rethrowControl(err);
    error = errorMessage(err);
  }
  const writable = calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer");
  const linked = db.tasks.filter((t) => t.googleEventId).length;
  const failing = db.tasks.filter((t) => t.syncError);

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold">설정</h1>

      <section className="card grid gap-3 p-5">
        <h2 className="font-semibold">동기화 캘린더</h2>
        <p className="text-sm text-muted">
          과제·마일스톤의 마감일은 이 캘린더에 일정으로 등록되고, 이 캘린더에서 바꾼 날짜·제목·메모는 앱으로 돌아옵니다.
          이 캘린더에 직접 추가한 일정은 &lsquo;캘린더에서 가져옴&rsquo; 프로젝트의 과제로 들어옵니다.
        </p>
        <p className="text-sm">
          현재: <strong>{db.settings.calendarName ?? `(첫 동기화 때 '${DEFAULT_CALENDAR_NAME}' 캘린더를 새로 만듭니다)`}</strong>
          <span className="text-muted"> · 연결된 일정 {linked}개</span>
        </p>
        {error && <p className="text-sm text-danger">캘린더 목록을 불러오지 못했습니다: {error}</p>}
        <form action={chooseSyncCalendar} className="flex flex-wrap gap-2">
          <select name="calendarId" className="input max-w-xs flex-1" defaultValue={db.settings.calendarId}>
            <option value="new">새 &lsquo;{DEFAULT_CALENDAR_NAME}&rsquo; 캘린더 만들기</option>
            {writable.map((c) => (
              <option key={c.id} value={c.id}>{c.summaryOverride ?? c.summary}{c.primary ? " (기본)" : ""}</option>
            ))}
          </select>
          <SubmitButton confirm="동기화 캘린더를 바꾸면 연결된 일정이 새 캘린더로 옮겨집니다. 계속할까요?">변경</SubmitButton>
        </form>
        <p className="text-xs text-muted">개인 일정과 섞이지 않도록 전용 캘린더 사용을 권장합니다.</p>
      </section>

      {failing.length > 0 && (
        <section className="card grid gap-2 p-5">
          <h2 className="font-semibold text-danger">동기화 오류 {failing.length}건</h2>
          <ul className="grid gap-1 text-sm">
            {failing.map((t) => (
              <li key={t.id}>
                <a href={`/tasks/${t.id}`} className="hover:underline">{t.title}</a>
                <span className="text-muted"> — {t.syncError}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">상단의 &lsquo;동기화&rsquo; 버튼을 누르면 다시 시도합니다.</p>
        </section>
      )}

      <section className="card grid gap-2 p-5 text-sm">
        <h2 className="font-semibold">계정 · 저장소</h2>
        <p>
          {ctx.session.name} <span className="text-muted">({ctx.session.email})</span>
        </p>
        <p className="text-muted">
          데이터 저장 위치:{" "}
          {config.storage === "drive" ? "Google Drive 앱 전용 폴더 (내 드라이브 목록에는 보이지 않음)" : `서버 로컬 파일 (${config.dataDir}/)`}
        </p>
        <p className="text-muted">시간대: {config.timeZone}</p>
        <p className="text-muted">
          마지막 동기화: {db.settings.lastSyncAt ? new Date(db.settings.lastSyncAt).toLocaleString("ko-KR", { timeZone: config.timeZone }) : "없음"}
        </p>
        <form action="/api/auth/logout" method="post" className="mt-2">
          <button type="submit" className="btn-ghost">로그아웃</button>
        </form>
      </section>
    </div>
  );
}
