import { app } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  deriveKey,
  encryptWithKey,
  decryptWithKey,
  generateSalt,
  EncryptedBlob,
} from "./crypto";

export type Entry = {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  folder: string;
  autofillDisabled?: boolean;
  totpSecret?: string;
  createdAt: number;
  updatedAt: number;
};

export type FolderSettings = {
  autofillDisabled?: boolean;
};

export type GlobalSettings = {
  autofillDisabled?: boolean;
};

type VaultData = {
  entries: Entry[];
  folders: string[];
  folderSettings: Record<string, FolderSettings>;
  globalSettings: GlobalSettings;
};

function migrateData(raw: unknown): VaultData {
  const obj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const entriesIn = Array.isArray(obj.entries) ? (obj.entries as Record<string, unknown>[]) : [];
  const entries: Entry[] = entriesIn.map((e) => ({
    id: String(e.id ?? ""),
    title: String(e.title ?? ""),
    username: String(e.username ?? ""),
    password: String(e.password ?? ""),
    url: String(e.url ?? ""),
    notes: String(e.notes ?? ""),
    folder: typeof e.folder === "string" ? e.folder : "",
    autofillDisabled: e.autofillDisabled === true ? true : undefined,
    totpSecret:
      typeof e.totpSecret === "string" && e.totpSecret.length > 0
        ? e.totpSecret
        : undefined,
    createdAt: Number(e.createdAt ?? Date.now()),
    updatedAt: Number(e.updatedAt ?? Date.now()),
  }));
  const folders = Array.isArray(obj.folders)
    ? (obj.folders as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const folderSettingsRaw =
    obj.folderSettings && typeof obj.folderSettings === "object"
      ? (obj.folderSettings as Record<string, unknown>)
      : {};
  const folderSettings: Record<string, FolderSettings> = {};
  for (const [k, v] of Object.entries(folderSettingsRaw)) {
    if (v && typeof v === "object") {
      const fs = v as Record<string, unknown>;
      folderSettings[k] = {
        autofillDisabled: fs.autofillDisabled === true ? true : undefined,
      };
    }
  }
  const globalSettingsRaw =
    obj.globalSettings && typeof obj.globalSettings === "object"
      ? (obj.globalSettings as Record<string, unknown>)
      : {};
  const globalSettings: GlobalSettings = {
    autofillDisabled: globalSettingsRaw.autofillDisabled === true ? true : undefined,
  };
  return { entries, folders, folderSettings, globalSettings };
}

type VaultFile = {
  v: 1;
  saltB64: string;
  blob: EncryptedBlob;
};

const VAULT_FILENAME = "vault.enc";

let cachedKey: Buffer | null = null;
let cachedSalt: Buffer | null = null;
let cachedData: VaultData | null = null;

function vaultPath(): string {
  return path.join(app.getPath("userData"), VAULT_FILENAME);
}

export async function vaultExists(): Promise<boolean> {
  try {
    await fs.access(vaultPath());
    return true;
  } catch {
    return false;
  }
}

async function readVaultFile(): Promise<VaultFile> {
  const buf = await fs.readFile(vaultPath(), "utf8");
  return JSON.parse(buf) as VaultFile;
}

async function writeVaultFile(file: VaultFile): Promise<void> {
  const tmp = vaultPath() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(file), { mode: 0o600 });
  await fs.rename(tmp, vaultPath());
}

export async function getSaltIfExists(): Promise<Buffer | null> {
  if (!(await vaultExists())) return null;
  const file = await readVaultFile();
  return Buffer.from(file.saltB64, "base64");
}

export async function createVault(masterPassword: string): Promise<void> {
  if (await vaultExists()) {
    throw new Error("Vault already exists");
  }
  const salt = generateSalt();
  const key = deriveKey(masterPassword, salt);
  const data: VaultData = { entries: [], folders: [], folderSettings: {}, globalSettings: {} };
  const blob = encryptWithKey(key, JSON.stringify(data), salt);
  await writeVaultFile({ v: 1, saltB64: salt.toString("base64"), blob });
  cachedKey = key;
  cachedSalt = salt;
  cachedData = data;
}

export async function unlockWithPassword(masterPassword: string): Promise<void> {
  const file = await readVaultFile();
  const salt = Buffer.from(file.saltB64, "base64");
  const key = deriveKey(masterPassword, salt);
  const plaintext = decryptWithKey(key, file.blob);
  cachedKey = key;
  cachedSalt = salt;
  cachedData = migrateData(JSON.parse(plaintext));
}

export async function unlockWithKey(keyB64: string): Promise<void> {
  const file = await readVaultFile();
  const salt = Buffer.from(file.saltB64, "base64");
  const key = Buffer.from(keyB64, "base64");
  const plaintext = decryptWithKey(key, file.blob);
  cachedKey = key;
  cachedSalt = salt;
  cachedData = migrateData(JSON.parse(plaintext));
}

export function getCachedKeyB64(): string | null {
  return cachedKey ? cachedKey.toString("base64") : null;
}

export function isUnlocked(): boolean {
  return cachedKey !== null && cachedData !== null;
}

export function lock(): void {
  if (cachedKey) cachedKey.fill(0);
  cachedKey = null;
  cachedSalt = null;
  cachedData = null;
}

function ensureUnlocked(): { key: Buffer; salt: Buffer; data: VaultData } {
  if (!cachedKey || !cachedSalt || !cachedData) {
    throw new Error("Vault is locked");
  }
  return { key: cachedKey, salt: cachedSalt, data: cachedData };
}

async function persist(): Promise<void> {
  const { key, salt, data } = ensureUnlocked();
  const blob = encryptWithKey(key, JSON.stringify(data), salt);
  await writeVaultFile({ v: 1, saltB64: salt.toString("base64"), blob });
}

export function listEntries(): Entry[] {
  const { data } = ensureUnlocked();
  return [...data.entries].sort((a, b) =>
    a.title.toLowerCase().localeCompare(b.title.toLowerCase())
  );
}

export async function addEntry(
  input: Omit<Entry, "id" | "createdAt" | "updatedAt">
): Promise<Entry> {
  const { data } = ensureUnlocked();
  const now = Date.now();
  const entry: Entry = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
  data.entries.push(entry);
  if (entry.folder && !data.folders.includes(entry.folder)) {
    data.folders.push(entry.folder);
  }
  await persist();
  return entry;
}

export async function bulkAddEntries(
  inputs: Array<Omit<Entry, "id" | "createdAt" | "updatedAt">>,
  opts: { skipDuplicates: boolean }
): Promise<{ imported: number; skipped: number }> {
  const { data } = ensureUnlocked();
  let imported = 0;
  let skipped = 0;
  const now = Date.now();
  for (const input of inputs) {
    if (opts.skipDuplicates) {
      const dup = data.entries.some(
        (e) =>
          e.title === input.title &&
          e.username === input.username &&
          e.url === input.url
      );
      if (dup) {
        skipped++;
        continue;
      }
    }
    const entry: Entry = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    data.entries.push(entry);
    if (entry.folder && !data.folders.includes(entry.folder)) {
      data.folders.push(entry.folder);
    }
    imported++;
  }
  if (imported > 0) await persist();
  return { imported, skipped };
}

export async function updateEntry(
  id: string,
  patch: Partial<Omit<Entry, "id" | "createdAt">>
): Promise<Entry> {
  const { data } = ensureUnlocked();
  const idx = data.entries.findIndex((e) => e.id === id);
  if (idx < 0) throw new Error("Entry not found");
  const updated: Entry = { ...data.entries[idx], ...patch, id, updatedAt: Date.now() };
  data.entries[idx] = updated;
  if (updated.folder && !data.folders.includes(updated.folder)) {
    data.folders.push(updated.folder);
  }
  await persist();
  return updated;
}

export async function deleteEntry(id: string): Promise<void> {
  const { data } = ensureUnlocked();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.id !== id);
  if (data.entries.length === before) throw new Error("Entry not found");
  await persist();
}

export function listFolders(): string[] {
  const { data } = ensureUnlocked();
  // Insertion-order folders first, then any folders that exist on entries
  // but aren't in the explicit list (appended in entry order for stability).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of data.folders) {
    if (f && !seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  for (const e of data.entries) {
    if (e.folder && !seen.has(e.folder)) {
      seen.add(e.folder);
      out.push(e.folder);
    }
  }
  return out;
}

export async function addFolder(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name required");
  const { data } = ensureUnlocked();
  const existing = new Set([...data.folders, ...data.entries.map((e) => e.folder)]);
  if (existing.has(trimmed)) return;
  data.folders.push(trimmed);
  await persist();
}

export async function renameFolder(oldName: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Folder name required");
  if (trimmed === oldName) return;
  const { data } = ensureUnlocked();
  data.folders = Array.from(new Set(data.folders.map((f) => (f === oldName ? trimmed : f))));
  for (const e of data.entries) {
    if (e.folder === oldName) e.folder = trimmed;
  }
  await persist();
}

export async function deleteFolder(name: string): Promise<void> {
  const { data } = ensureUnlocked();
  data.folders = data.folders.filter((f) => f !== name);
  for (const e of data.entries) {
    if (e.folder === name) e.folder = "";
  }
  await persist();
}

export function getFolderSettings(name: string): FolderSettings {
  const { data } = ensureUnlocked();
  return data.folderSettings[name] ?? {};
}

export function getAllFolderSettings(): Record<string, FolderSettings> {
  const { data } = ensureUnlocked();
  return { ...data.folderSettings };
}

export async function setFolderSettings(
  name: string,
  patch: Partial<FolderSettings>
): Promise<void> {
  const { data } = ensureUnlocked();
  const next: FolderSettings = { ...(data.folderSettings[name] ?? {}), ...patch };
  // Drop falsy keys so the file stays clean.
  if (next.autofillDisabled !== true) delete next.autofillDisabled;
  if (Object.keys(next).length === 0) {
    delete data.folderSettings[name];
  } else {
    data.folderSettings[name] = next;
  }
  await persist();
}

export function getGlobalSettings(): GlobalSettings {
  const { data } = ensureUnlocked();
  return { ...data.globalSettings };
}

export async function setGlobalSettings(patch: Partial<GlobalSettings>): Promise<void> {
  const { data } = ensureUnlocked();
  const next: GlobalSettings = { ...data.globalSettings, ...patch };
  if (next.autofillDisabled !== true) delete next.autofillDisabled;
  data.globalSettings = next;
  await persist();
}

export function isAutofillAllowed(entry: Entry): boolean {
  const { data } = ensureUnlocked();
  if (data.globalSettings.autofillDisabled) return false;
  if (entry.autofillDisabled) return false;
  if (entry.folder && data.folderSettings[entry.folder]?.autofillDisabled) return false;
  return true;
}

export async function reorderFolders(order: string[]): Promise<void> {
  const { data } = ensureUnlocked();
  // Trust the renderer's order but constrain it to known folder names.
  // Append any folders missing from the new order (defensive against races).
  const known = new Set([...data.folders, ...data.entries.map((e) => e.folder).filter(Boolean)]);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const name of order) {
    if (known.has(name) && !seen.has(name)) {
      seen.add(name);
      next.push(name);
    }
  }
  for (const name of known) {
    if (!seen.has(name)) next.push(name);
  }
  data.folders = next;
  await persist();
}

export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const file = await readVaultFile();
  const oldSalt = Buffer.from(file.saltB64, "base64");
  const oldKey = deriveKey(currentPassword, oldSalt);
  const plaintext = decryptWithKey(oldKey, file.blob);
  const data = JSON.parse(plaintext);

  const migrated = migrateData(data);
  const newSalt = generateSalt();
  const newKey = deriveKey(newPassword, newSalt);
  const blob = encryptWithKey(newKey, JSON.stringify(migrated), newSalt);
  await writeVaultFile({ v: 1, saltB64: newSalt.toString("base64"), blob });
  cachedKey = newKey;
  cachedSalt = newSalt;
  cachedData = migrated;
}
