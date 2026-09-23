import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "연구 일정 관리",
  description: "연구 프로젝트·과제·마일스톤을 관리하고 구글캘린더와 양방향 동기화합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
