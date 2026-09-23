import { NextResponse, type NextRequest } from "next/server";
import { forgetAccessToken } from "@/lib/google/oauth";
import { readSession, SESSION_COOKIE } from "@/lib/session";
import { baseUrl } from "@/lib/urls";

async function logout(request: NextRequest) {
  const session = await readSession();
  if (session) forgetAccessToken(session.refreshToken);
  const reason = request.nextUrl.searchParams.get("reason") === "expired" ? "?error=expired" : "";
  const res = NextResponse.redirect(`${baseUrl(request.url)}/login${reason}`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const GET = logout;
export const POST = logout;
