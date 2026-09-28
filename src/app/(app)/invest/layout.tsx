import { InvestNav } from "@/components/invest/InvestNav";

export default function InvestLayout({ children }: LayoutProps<"/invest">) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <InvestNav />
      {children}
      <p className="border-t border-line pt-4 text-xs text-muted">
        이 화면의 어떤 내용도 투자 자문이 아닙니다. AI는 리서치·정리·원자료 수집까지만 하고, 모든 계산은 앱이 코드로 합니다.
        판단에 쓰는 숫자는 원문에서 한 번 더 확인하세요. 매매는 직접 결정합니다.
      </p>
    </div>
  );
}
