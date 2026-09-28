import { SubmitButton } from "@/components/SubmitButton";
import { ASSET_LABEL, type Holding } from "@/lib/invest/types";

/** Create/edit a holding. Works without client JS. */
export function HoldingForm({ action, holding, returnTo }: { action: (fd: FormData) => Promise<void>; holding?: Holding; returnTo: string }) {
  return (
    <form action={action} className="grid gap-3">
      {holding && <input type="hidden" name="id" value={holding.id} />}
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="ticker">티커 / 종목코드</label>
          <input id="ticker" name="ticker" required className="input uppercase" defaultValue={holding?.ticker} placeholder="AAPL, 005930" />
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="name">이름</label>
          <input id="name" name="name" className="input" defaultValue={holding?.name} placeholder="Apple" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="label" htmlFor="assetType">자산 유형</label>
          <select id="assetType" name="assetType" className="input" defaultValue={holding?.assetType ?? "stock"}>
            {Object.entries(ASSET_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="currency">통화</label>
          <select id="currency" name="currency" className="input" defaultValue={holding?.currency ?? "USD"}>
            <option value="USD">USD</option>
            <option value="KRW">KRW</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sector">섹터 · 테마</label>
          <input id="sector" name="sector" className="input" defaultValue={holding?.sector} placeholder="반도체" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor="quantity">수량</label>
          <input id="quantity" name="quantity" type="number" step="any" min={0} required className="input" defaultValue={holding?.quantity} />
        </div>
        <div>
          <label className="label" htmlFor="avgCost">평균단가 (해당 통화)</label>
          <input id="avgCost" name="avgCost" type="number" step="any" min={0} required className="input" defaultValue={holding?.avgCost} />
        </div>
        <div>
          <label className="label" htmlFor="avgFx">매입 환율 (USD만)</label>
          <input id="avgFx" name="avgFx" type="number" step="any" min={0} className="input" defaultValue={holding?.avgFx} placeholder="1320" />
        </div>
      </div>
      <details className="rounded-lg border border-line px-3 py-2" open={Boolean(holding?.constituents?.length)}>
        <summary className="cursor-pointer text-xs font-medium text-muted">ETF 구성종목 (숨은 중복 계산용, 선택)</summary>
        <textarea
          name="constituents"
          rows={4}
          className="input mt-2 font-mono text-xs"
          defaultValue={holding?.constituents?.map((c) => `${c.ticker} ${c.weightPct}`).join("\n")}
          placeholder={"한 줄에 하나: 티커 비중%\nNVDA 7.2\nAAPL 6.8\nMSFT 6.1"}
        />
        <p className="mt-1 text-xs text-muted">운용사 홈페이지의 상위 보유 종목을 옮겨 적으세요. 개별 종목에는 무시됩니다.</p>
      </details>
      <div>
        <label className="label" htmlFor="notes">메모</label>
        <textarea id="notes" name="notes" rows={2} className="input" defaultValue={holding?.notes} placeholder="보유 이유, 확인할 점 등" />
      </div>
      <div className="flex justify-end">
        <SubmitButton>{holding ? "저장" : "추가"}</SubmitButton>
      </div>
    </form>
  );
}
