import { config } from "./config";

export function baseUrl(requestUrl: string): string {
  return (config.appUrl ?? new URL(requestUrl).origin).replace(/\/$/, "");
}

export function redirectUri(requestUrl: string): string {
  return `${baseUrl(requestUrl)}/api/auth/callback`;
}
