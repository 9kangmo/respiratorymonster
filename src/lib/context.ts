import { redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { getAccessToken, GoogleAuthError } from "./google/oauth";
import { readSession, type Session } from "./session";
import { getStore, withLock, type Store } from "./store";
import type { TokenFn } from "./google/api";
import type { DB } from "./types";

export interface Ctx {
  session: Session;
  token: TokenFn;
  store: Store;
}

/** Per-request context for the signed-in user; redirects to /login when signed out or when Google revoked access. */
export const getCtx = cache(async (): Promise<Ctx> => {
  const session = await readSession();
  if (!session) redirect("/login");
  const token: TokenFn = async () => {
    try {
      return await getAccessToken(session.refreshToken);
    } catch (err) {
      if (err instanceof GoogleAuthError) redirect("/api/auth/logout?reason=expired");
      throw err;
    }
  };
  return { session, token, store: getStore(session.email, token) };
});

export function readDB(ctx: Ctx): Promise<DB> {
  return ctx.store.load();
}

export function mutateDB<T>(ctx: Ctx, fn: (db: DB) => T | Promise<T>): Promise<T> {
  return withLock(ctx.session.email, async () => {
    const db = await ctx.store.load();
    const result = await fn(db);
    await ctx.store.save(db);
    return result;
  });
}

/** Re-throws Next.js control-flow errors (redirect etc.) and auth failures so broad catch blocks don't swallow them. */
export function rethrowControl(err: unknown) {
  unstable_rethrow(err);
  if (err instanceof GoogleAuthError) throw err;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
