import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { exchangeCode, fetchUserInfo } from "@/lib/google/oauth";
import { sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { baseUrl, redirectUri } from "@/lib/urls";

export async function GET(request: NextRequest) {
  const base = baseUrl(request.url);
  const fail = (error: string) => {
    const res = NextResponse.redirect(`${base}/login?error=${error}`);
    res.cookies.delete({ name: "rm_oauth_state", path: "/api/auth" });
    return res;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (params.get("error") || !code) return fail("denied");
  if (!state || state !== request.cookies.get("rm_oauth_state")?.value) return fail("state");

  try {
    const tokens = await exchangeCode(code, redirectUri(request.url));
    if (!tokens.refresh_token) return fail("no_refresh");
    const scopes = tokens.scope.split(" ");
    if (!scopes.some((s) => s.endsWith("/auth/calendar"))) return fail("scope");
    const user = await fetchUserInfo(tokens.access_token);
    const email = user.email.toLowerCase();
    if (!user.email_verified || (config.allowedEmails.length && !config.allowedEmails.includes(email))) {
      return fail("forbidden");
    }
    const sealed = await sealSession({
      email,
      name: user.name ?? email,
      picture: user.picture,
      refreshToken: tokens.refresh_token,
    });
    const res = NextResponse.redirect(`${base}/`);
    res.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions);
    res.cookies.delete({ name: "rm_oauth_state", path: "/api/auth" });
    return res;
  } catch (err) {
    console.error("OAuth callback failed", err);
    return fail("oauth");
  }
}
