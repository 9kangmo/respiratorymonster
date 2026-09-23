import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import type { TokenFn } from "./google/api";
import { createAppDataFile, findAppDataFile, readAppDataFile, updateAppDataFile } from "./google/drive";
import { emptyDB, type DB } from "./types";

export interface Store {
  load(): Promise<DB>;
  save(db: DB): Promise<void>;
}

function parse(raw: string): DB {
  const data = JSON.parse(raw) as Partial<DB>;
  return { ...emptyDB(), ...data, settings: { ...data.settings } };
}

function fileStore(email: string): Store {
  const file = path.resolve(config.dataDir, `${email.replace(/[^a-z0-9@._-]/gi, "_")}.json`);
  return {
    async load() {
      try {
        return parse(await readFile(file, "utf8"));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyDB();
        throw err;
      }
    },
    async save(db) {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(db, null, 2));
      await rename(tmp, file);
    },
  };
}

const DRIVE_FILE = "research-app-data.json";
const driveFileIds = new Map<string, string>();

function driveStore(email: string, token: TokenFn): Store {
  return {
    async load() {
      const id = driveFileIds.get(email) ?? (await findAppDataFile(token, DRIVE_FILE));
      if (!id) return emptyDB();
      driveFileIds.set(email, id);
      return parse(await readAppDataFile(token, id));
    },
    async save(db) {
      const content = JSON.stringify(db);
      const id = driveFileIds.get(email) ?? (await findAppDataFile(token, DRIVE_FILE));
      if (id) {
        await updateAppDataFile(token, id, content);
        driveFileIds.set(email, id);
      } else {
        driveFileIds.set(email, await createAppDataFile(token, DRIVE_FILE, content));
      }
    },
  };
}

export function getStore(email: string, token: TokenFn): Store {
  return config.storage === "drive" ? driveStore(email, token) : fileStore(email);
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
