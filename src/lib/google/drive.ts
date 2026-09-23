import { gfetch, type TokenFn } from "./api";

/** Minimal client for a single JSON file in the Drive appDataFolder (hidden from the user's Drive UI). */
export async function findAppDataFile(token: TokenFn, name: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: "files(id)",
    pageSize: "1",
  });
  const res = await gfetch<{ files: { id: string }[] }>(token, `https://www.googleapis.com/drive/v3/files?${params}`);
  return res.files[0]?.id ?? null;
}

export async function readAppDataFile(token: TokenFn, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${await token()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Drive read failed: ${res.status}`);
  return res.text();
}

export async function createAppDataFile(token: TokenFn, name: string, content: string): Promise<string> {
  const boundary = `rm${crypto.randomUUID()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: ["appDataFolder"], mimeType: "application/json" }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await gfetch<{ id: string }>(
    token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", body, headers: { "Content-Type": `multipart/related; boundary=${boundary}` } },
  );
  return res.id;
}

export async function updateAppDataFile(token: TokenFn, fileId: string, content: string): Promise<void> {
  await gfetch(token, `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id`, {
    method: "PATCH",
    body: content,
    headers: { "Content-Type": "application/json" },
  });
}
