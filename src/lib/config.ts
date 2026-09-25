function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  /** Public base URL, e.g. https://research.example.com. Falls back to the request origin. */
  appUrl: process.env.APP_URL,
  /** Google accounts allowed to sign in. Empty = anyone (not recommended once deployed). */
  allowedEmails: list(process.env.ALLOWED_EMAILS),
  /** "file" keeps data in DATA_DIR; "drive" keeps it in the user's Google Drive app folder. */
  storage: (process.env.STORAGE ?? (process.env.VERCEL ? "drive" : "file")) as "file" | "drive",
  dataDir: process.env.DATA_DIR ?? ".data",
  timeZone: process.env.TIMEZONE ?? "Asia/Seoul",
  /** Bank of Korea ECOS Open API key (free) for the Korean base rate and 10-year KTB yield. */
  ecosApiKey: process.env.ECOS_API_KEY ?? "",
  /** Enables AI news briefings; the Anthropic SDK reads the key itself. */
  aiBriefing: Boolean(process.env.ANTHROPIC_API_KEY),
};

export function assertConfigured(): string[] {
  const missing: string[] = [];
  if (!config.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!config.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (config.sessionSecret.length < 32) missing.push("SESSION_SECRET (32자 이상)");
  return missing;
}
