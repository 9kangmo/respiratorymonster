import Link from "next/link";
import { Nav } from "@/components/Nav";
import { SyncButton } from "@/components/SyncButton";
import { getCtx, readDB } from "@/lib/context";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getCtx();
  const db = await readDB(ctx);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-accent-ink">研</span>
            <span className="hidden sm:inline">연구 일정 관리</span>
          </Link>
          <Nav />
          <div className="ml-auto flex items-center gap-3">
            <SyncButton lastSyncAt={db.settings.lastSyncAt} />
            <span className="hidden text-xs text-muted md:inline">{ctx.session.email}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
