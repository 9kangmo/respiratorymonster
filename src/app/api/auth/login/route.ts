import { NextResponse, type NextRequest } from "next/server";
import { assertConfigured } from "@/lib/config";
import { buildAuthUrl } from "@/lib/google/oauth";
import { baseUrl, redirectUri } from "@/lib/urls";

export async function GET(request: NextRequest) {
  if (assertConfigured().length) return NextResponse.redirect(`${baseUrl(request.url)}/login?error=config`);
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(buildAuthUrl(redirectUri(request.url), state));
  response.cookies.set("rm_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return response;
}
