import { cached, fetchText } from "./cache";

export interface NewsItem {
  title: string;
  link: string;
  source?: string;
  /** ISO time */
  publishedAt?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  if (!m) return undefined;
  const raw = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodeEntities(raw).trim();
}

/** Parses an RSS 2.0 feed (Google News format). */
export function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const [, body] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    let title = tag(body, "title");
    const link = tag(body, "link");
    if (!title || !link) continue;
    const source = tag(body, "source");
    // Google News appends " - 언론사" to every title.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const date = tag(body, "pubDate");
    const time = date ? new Date(date) : undefined;
    items.push({ title, link, source, publishedAt: time && !Number.isNaN(time.getTime()) ? time.toISOString() : undefined });
  }
  return items;
}

const normTitle = (t: string) => t.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();

/** Drops repeats of the same story (identical or near-identical titles from different outlets), newest first. */
export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const sorted = [...items].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const seen: string[] = [];
  const out: NewsItem[] = [];
  for (const item of sorted) {
    const key = normTitle(item.title);
    if (seen.some((s) => s === key || (key.length >= 12 && s.slice(0, 18) === key.slice(0, 18)))) continue;
    seen.push(key);
    out.push(item);
  }
  return out;
}

export function googleNewsUrl(query: string, days: number): string {
  const q = encodeURIComponent(`${query} when:${days}d`);
  return `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;
}

export function searchNews(query: string, days = 3, limit = 15): Promise<NewsItem[]> {
  return cached(`news:${days}:${query}`, 15 * 60_000, async () => {
    return dedupeNews(parseRss(await fetchText(googleNewsUrl(query, days)))).slice(0, limit);
  });
}

/** Macro headlines for the indicators on the market page. */
export const MACRO_QUERY = "(기준금리 OR 국채금리 OR 환율 OR 엔화 OR 국제유가 OR 금값) 시장";
