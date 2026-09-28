import { beforeAll, describe, expect, it, vi } from "vitest";

// config reads env at import time, so set it before loading the modules.
beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret-test-secret-test-secret-123");
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("INVEST_CRON_TOKEN", "");
});

describe("scheduled brief", () => {
  it("round-trips the cron key and rejects tampered or foreign keys", async () => {
    const { sealCronKey, openCronKey } = await import("@/lib/invest/runner");
    const key = await sealCronKey("me@example.com", "refresh-123");
    expect(await openCronKey(key)).toEqual({ email: "me@example.com", refreshToken: "refresh-123" });
    expect(await openCronKey(`${key.slice(0, -4)}AAAA`)).toBeNull();
    expect(await openCronKey("")).toBeNull();
    // A regular session cookie is not a cron key.
    const { sealSession } = await import("@/lib/session");
    expect(await openCronKey(await sealSession({ email: "me@example.com", name: "me", refreshToken: "r" }))).toBeNull();
  });

  it("only answers Vercel cron requests carrying CRON_SECRET", async () => {
    const { GET } = await import("@/app/api/invest/cron/route");
    expect((await GET(new Request("http://x/api/invest/cron"))).status).toBe(401);
    expect((await GET(new Request("http://x/api/invest/cron", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    // Authorized, but no INVEST_CRON_TOKEN configured → refuses before touching any data.
    const res = await GET(new Request("http://x/api/invest/cron", { headers: { authorization: "Bearer cron-secret" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("INVEST_CRON_TOKEN");
  });
});
