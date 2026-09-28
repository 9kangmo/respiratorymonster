import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import type { TokenFn } from "./google/api";
import { createAppDataFile, findAppDataFile, readAppDataFile, updateAppDataFile } from "./google/drive";
import { emptyDB, type DB } from "./types";

export interface DocStore<T> {
  load(): Promise<T>;
  save(doc: T): Promise<void>;
}

export type Store = DocStore<DB>;

interface DocSpec<T> {
  /** Suffix of the local file (`<email><suffix>.json`). */
  fileSuffix: string;
  /** File name in the Drive appDataFolder. */
  driveName: string;
  empty: () => T;
  parse: (raw: string) => T;
}

function parse(raw: string): DB {
  const data = JSON.parse(raw) as Partial<DB>;
  return { ...emptyDB(), ...data, settings: { ...data.settings } };
}

function fileStore<T>(email: string, spec: DocSpec<T>): DocStore<T> {
  const file = path.resolve(config.dataDir, `${email.replace(/[^a-z0-9@._-]/gi, "_")}${spec.fileSuffix}.json`);
  return {
    async load() {
      try {
        return spec.parse(await readFile(file, "utf8"));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return spec.empty();
        throw err;
      }
    },
    async save(doc) {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(doc, null, 2));
      await rename(tmp, file);
    },
  };
}

const driveFileIds = new Map<string, string>();

function driveStore<T>(email: string, token: TokenFn, spec: DocSpec<T>): DocStore<T> {
  const cacheKey = `${email}:${spec.driveName}`;
  return {
    async load() {
      const id = driveFileIds.get(cacheKey) ?? (await findAppDataFile(token, spec.driveName));
      if (!id) return spec.empty();
      driveFileIds.set(cacheKey, id);
      return spec.parse(await readAppDataFile(token, id));
    },
    async save(doc) {
      const content = JSON.stringify(doc);
      const id = driveFileIds.get(cacheKey) ?? (await findAppDataFile(token, spec.driveName));
      if (id) {
        await updateAppDataFile(token, id, content);
        driveFileIds.set(cacheKey, id);
      } else {
        driveFileIds.set(cacheKey, await createAppDataFile(token, spec.driveName, content));
      }
    },
  };
}

export function getDocStore<T>(email: string, token: TokenFn, spec: DocSpec<T>): DocStore<T> {
  return config.storage === "drive" ? driveStore(email, token, spec) : fileStore(email, spec);
}

const RESEARCH_DOC: DocSpec<DB> = { fileSuffix: "", driveName: "research-app-data.json", empty: emptyDB, parse };

export function getStore(email: string, token: TokenFn): Store {
  return getDocStore(email, token, RESEARCH_DOC);
}

/** Serialises read-modify-write cycles per user within this server process. */
const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(email) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(email, next);
  try {
    return await next;
  } finally {
    if (locks.get(email) === next) locks.delete(email);
  }
}
