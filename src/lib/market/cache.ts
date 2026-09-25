/** Small in-process TTL cache so page loads don't hammer the free market/news endpoints. */
const entries = new Map<string, { expires: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  const value = load();
  entries.set(key, { expires: now + ttlMs, value });
  // Failures are not cached: the next request retries.
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}

const UA = "Mozilla/5.0 (compatible; respiratorymonster/1.0)";

export async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "*/*" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} 응답 ${res.status}`);
  return res.text();
}
