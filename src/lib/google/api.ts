import { GoogleAuthError } from "./oauth";

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type TokenFn = () => Promise<string>;

export async function gfetch<T>(token: TokenFn, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (res.status === 401) throw new GoogleAuthError("Google 인증이 만료되었습니다.");
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {}
    throw new GoogleApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
