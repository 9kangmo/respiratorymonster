import { ImportForm } from "@/components/invest/ImportForm";
import { InboxNotice } from "@/components/invest/InboxNotice";
import { config } from "@/lib/config";
import { getCtx } from "@/lib/context";
import { BUNDLE_FORMAT } from "@/lib/invest/bundle";
import { apiEnabled } from "@/lib/invest/claude";
import { SKILLS } from "@/lib/invest/skills";
import { loadInvest } from "@/lib/invest/store";

export default async function ImportPage() {
  const ctx = await getCtx();
  const { db, inbox } = await loadInvest(ctx);
  const api = apiEnabled();
  const inboxOn = config.storage === "file" && Boolean(config.investInboxDir);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">가져오기 · 설정</h1>
        <p className="text-sm text-muted">리서치 결과는 Claude가 만들고, 앱은 검증·계산·보관만 합니다.</p>
      </div>

      <InboxNotice inbox={inbox} />

      <section className="card grid gap-3 p-5">
        <h2 className="font-semibold">결과 가져오기</h2>
        <p className="text-sm text-muted">
          Claude Code 스킬의 응답(또는 저장된 <code>.json</code> 파일)을 넣으면 형식 <code>{BUNDLE_FORMAT}</code>을 검증해 반영합니다.
          출처 없는 숫자는 버리고, 매매 권유 표현·웹 출처의 페이지 번호는 경고로 표시합니다.
        </p>
        <ImportForm />
      </section>

      <section className="card grid gap-3 p-5 text-sm">
        <h2 className="font-semibold">Claude를 돌리는 두 가지 방법</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-3">
            <p className="font-medium">1. Claude Code 스킬 <span className="chip ml-1 bg-ok/15 text-ok">기본 · 구독 한도 안</span></p>
            <p className="mt-1 text-xs text-muted">
              이 저장소를 Claude Code로 열고 아래 문구를 입력합니다. 결과 번들은{" "}
              {inboxOn ? (
                <>
                  <code>{config.investInboxDir}/</code> 폴더에 저장되고, 화면을 열 때 자동으로 가져옵니다.
                </>
              ) : (
                <>응답의 JSON 블록을 위 칸에 붙여 넣으면 됩니다 (배포 환경에서는 자동 가져오기가 꺼져 있습니다).</>
              )}
            </p>
            <ul className="mt-2 grid gap-1 text-xs">
              {Object.values(SKILLS).map((s) => (
                <li key={s.id}>
                  <code>{s.trigger(s.needsTicker ? "AAPL" : undefined)}</code> <span className="text-muted">— {s.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-line p-3">
            <p className="font-medium">
              2. 앱에서 바로 실행{" "}
              <span className={`chip ml-1 ${api ? "bg-ok/15 text-ok" : "bg-surface-2 text-muted"}`}>{api ? "켜짐" : "꺼짐"}</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              환경 변수 <code>ANTHROPIC_API_KEY</code>를 설정하면 각 화면의 실행 버튼이 Claude API(웹 검색)로 분석을 돌립니다. API 사용량만큼 별도 과금됩니다.
              {api && <> 모델: <code>{config.anthropicModel}</code></>}
            </p>
          </div>
        </div>
      </section>

      <section className="card grid gap-2 p-5 text-sm">
        <h2 className="font-semibold">저장 현황</h2>
        <p className="text-muted">
          보유 {db.holdings.length} · 관심 {db.watchlist.length} · 리포트 {db.reports.length} · 밸류에이션 {db.valuations.length} · 일정 {db.events.length} · 뉴스 {db.news.length}
        </p>
        <p className="text-muted">
          저장 위치: {config.storage === "drive" ? "Google Drive 앱 전용 폴더 (invest-research-data.json)" : `${config.dataDir}/<이메일>.invest.json`}
        </p>
        <p className="text-xs text-muted">계좌는 연동하지 않습니다. 증권사 자격증명을 다루지 않는 것이 이 앱의 원칙입니다.</p>
      </section>
    </div>
  );
}
