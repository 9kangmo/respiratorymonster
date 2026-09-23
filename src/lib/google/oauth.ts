import { config } from "../config";

export const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.appdata",
];

/** The refresh token was revoked or expired; the user must sign in again. */
export class GoogleAuthError extends Error {}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      ...body,
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    if (json.error === "invalid_grant") throw new GoogleAuthError("Google 로그인이 만료되었습니다.");
    throw new Error(`Google token error: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json;
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

const accessTokens = new Map<string, { token: string; expiresAt: number }>();

export async function getAccessToken(refreshToken: string): Promise<string> {
  const cached = accessTokens.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  accessTokens.set(refreshToken, { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 });
  return res.access_token;
}

export function forgetAccessToken(refreshToken: string) {
  accessTokens.delete(refreshToken);
}

export async function fetchUserInfo(accessToken: string) {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  return (await res.json()) as { email: string; name?: string; picture?: string; email_verified?: boolean };
}
