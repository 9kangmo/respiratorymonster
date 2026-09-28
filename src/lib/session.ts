import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { config } from "./config";

export const SESSION_COOKIE = "rm_session";
const MAX_AGE = 60 * 60 * 24 * 180;

export interface Session {
  email: string;
  name: string;
  picture?: string;
  refreshToken: string;
}

/** Encryption key derived from SESSION_SECRET (also used for the auto-brief key). */
export async function sessionKey(): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config.sessionSecret));
  return new Uint8Array(digest);
}

export async function sealSession(session: Session): Promise<string> {
  return new EncryptJWT({ ...session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .encrypt(await sessionKey());
}

export async function readSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw || !config.sessionSecret) return null;
  try {
    const { payload } = await jwtDecrypt(raw, await sessionKey());
    if (typeof payload.email !== "string" || typeof payload.refreshToken !== "string") return null;
    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
      refreshToken: payload.refreshToken,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};
