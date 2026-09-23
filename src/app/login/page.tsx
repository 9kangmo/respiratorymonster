import { redirect } from "next/navigation";
import { assertConfigured } from "@/lib/config";
import { readSession } from "@/lib/session";

const ERRORS: Record<string, string> = {
  config: "서버 설정이 완료되지 않았습니다. 아래 환경 변수를 확인하세요.",
  denied: "Google 로그인이 취소되었습니다.",
  state: "로그인 요청이 만료되었습니다. 다시 시도하세요.",
  no_refresh: "Google이 오프라인 접근 토큰을 주지 않았습니다. 다시 시도하세요.",
  scope: "캘린더 접근 권한이 필요합니다. 로그인 시 캘린더 권한에 체크해 주세요.",
  forbidden: "이 계정은 허용된 사용자가 아닙니다 (ALLOWED_EMAILS).",
  oauth: "Google 로그인 처리 중 오류가 발생했습니다.",
  expired: "Google 로그인이 만료되었거나 권한이 해제되었습니다. 다시 로그인하세요.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await readSession()) redirect("/");
  const { error } = await searchParams;
  const missing = assertConfigured();
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-accent text-xl text-accent-ink">研</div>
        <h1 className="text-xl font-semibold">연구 일정 관리</h1>
        <p className="mt-2 text-sm text-muted">연구 과제와 마일스톤을 관리하고 구글캘린더와 양방향으로 동기화합니다.</p>
        {message && <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm text-danger">{message}</p>}
        {missing.length > 0 ? (
          <div className="mt-6 rounded-lg bg-surface-2 p-3 text-left text-xs text-muted">
            <p className="mb-1 font-medium text-ink">설정되지 않은 환경 변수</p>
            <ul className="list-inside list-disc">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p className="mt-2">README의 &ldquo;설정&rdquo; 절을 참고하세요.</p>
          </div>
        ) : (
          <a href="/api/auth/login" className="btn-primary mt-6 w-full py-2.5">
            Google 계정으로 로그인
          </a>
        )}
      </div>
    </main>
  );
}
