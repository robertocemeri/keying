import { app } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
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
  // Minutes of inactivity before the vault auto-locks. 0 = never.
  // Undefined means "use default" (15 min).
  autoLockMinutes?: number;
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
    id: String(e.id ?? randomUUID()),
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
  const rawAutoLock = globalSettingsRaw.autoLockMinutes;
  const globalSettings: GlobalSettings = {
    autofillDisabled: globalSettingsRaw.autofillDisabled === true ? true : undefined,
    autoLockMinutes:
      typeof rawAutoLock === "number" && Number.isFinite(rawAutoLock) && rawAutoLock >= 0
        ? Math.floor(rawAutoLock)
        : undefined,
  };
  return { entries, folders, folderSettings, globalSettings };
}

type VaultFileV1 = {
  v: 1;
  saltB64: string;
  blob: EncryptedBlob;
};

// v2 introduces key-wrapping: a random Data Encryption Key (DEK) is generated
// once at vault creation. The DEK encrypts the data blob. The DEK itself is
// wrapped separately by (a) the password-derived key, and (b) optionally by a
// recovery-key-derived key. This lets us add a recovery key, change the
// master password, or rotate the recovery key without re-encrypting the data.
type VaultFileV2 = {
  v: 2;
  pw: {
    saltB64: string;
    wrapped: EncryptedBlob;
  };
  rec?: {
    saltB64: string;
    wrapped: EncryptedBlob;
  };
  blob: EncryptedBlob;
};

type VaultFile = VaultFileV1 | VaultFileV2;

const VAULT_FILENAME = "vault.enc";

let cachedDek: Buffer | null = null;
let cachedData: VaultData | null = null;

function vaultPath(): string {
  return path.join(app.getPath("userData"), VAULT_FILENAME);
}

export function getVaultPath(): string {
  return vaultPath();
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

function generateDek(): Buffer {
  return randomBytes(32);
}

function wrapDek(wrappingKey: Buffer, dek: Buffer, salt: Buffer): EncryptedBlob {
  return encryptWithKey(wrappingKey, dek.toString("base64"), salt);
}

function unwrapDek(wrappingKey: Buffer, blob: EncryptedBlob): Buffer {
  const decoded = decryptWithKey(wrappingKey, blob);
  return Buffer.from(decoded, "base64");
}

export async function createVault(masterPassword: string): Promise<{ recoveryKey: string }> {
  if (await vaultExists()) {
    throw new Error("Vault already exists");
  }

  const dek = generateDek();
  const pwSalt = generateSalt();
  const pwKey = deriveKey(masterPassword, pwSalt);
  const pwWrapped = wrapDek(pwKey, dek, pwSalt);

  const { generateRecoveryKey, formatRecoveryKey } = await import("./recovery");
  const { groups, raw: recRaw } = generateRecoveryKey();
  const recSalt = generateSalt();
  const recKey = deriveKey(recRaw.toString("base64"), recSalt);
  const recWrapped = wrapDek(recKey, dek, recSalt);

  const data: VaultData = { entries: [], folders: [], folderSettings: {}, globalSettings: {} };
  const dataBlob = encryptWithKey(dek, JSON.stringify(data), generateSalt());

  await writeVaultFile({
    v: 2,
    pw: { saltB64: pwSalt.toString("base64"), wrapped: pwWrapped },
    rec: { saltB64: recSalt.toString("base64"), wrapped: recWrapped },
    blob: dataBlob,
  });

  cachedDek = dek;
  cachedData = data;
  return { recoveryKey: formatRecoveryKey(groups) };
}

async function migrateV1ToV2(file: VaultFileV1, masterPassword: string): Promise<{ file: VaultFileV2; dek: Buffer; data: VaultData; recoveryKey: string }> {
  const oldSalt = Buffer.from(file.saltB64, "base64");
  const oldKey = deriveKey(masterPassword, oldSalt);
  const plaintext = decryptWithKey(oldKey, file.blob);
  const data = migrateData(JSON.parse(plaintext));

  const dek = generateDek();
  const pwSalt = generateSalt();
  const pwKey = deriveKey(masterPassword, pwSalt);
  const pwWrapped = wrapDek(pwKey, dek, pwSalt);

  const { generateRecoveryKey, formatRecoveryKey } = await import("./recovery");
  const { groups, raw: recRaw } = generateRecoveryKey();
  const recSalt = generateSalt();
  const recKey = deriveKey(recRaw.toString("base64"), recSalt);
  const recWrapped = wrapDek(recKey, dek, recSalt);

  const dataBlob = encryptWithKey(dek, JSON.stringify(data), generateSalt());
  const newFile: VaultFileV2 = {
    v: 2,
    pw: { saltB64: pwSalt.toString("base64"), wrapped: pwWrapped },
    rec: { saltB64: recSalt.toString("base64"), wrapped: recWrapped },
    blob: dataBlob,
  };
  await writeVaultFile(newFile);
  return { file: newFile, dek, data, recoveryKey: formatRecoveryKey(groups) };
}

let pendingMigrationRecoveryKey: string | null = null;

export function takePendingRecoveryKey(): string | null {
  const k = pendingMigrationRecoveryKey;
  pendingMigrationRecoveryKey = null;
  return k;
}

export async function unlockWithPassword(masterPassword: string): Promise<void> {
  const file = await readVaultFile();
  if (file.v === 1) {
    // Auto-migrate to v2 — generate a recovery key and surface it to the UI.
    const migrated = await migrateV1ToV2(file, masterPassword);
    cachedDek = migrated.dek;
    cachedData = migrated.data;
    pendingMigrationRecoveryKey = migrated.recoveryKey;
    return;
  }
  const pwSalt = Buffer.from(file.pw.saltB64, "base64");
  const pwKey = deriveKey(masterPassword, pwSalt);
  const dek = unwrapDek(pwKey, file.pw.wrapped);
  const plaintext = decryptWithKey(dek, file.blob);
  cachedDek = dek;
  cachedData = migrateData(JSON.parse(plaintext));
}

export async function unlockWithKey(keyB64: string): Promise<void> {
  const file = await readVaultFile();
  if (file.v === 1) {
    // Touch ID stored an old-format key. Decrypt with it directly.
    const key = Buffer.from(keyB64, "base64");
    const plaintext = decryptWithKey(key, file.blob);
    cachedDek = key;
    cachedData = migrateData(JSON.parse(plaintext));
    return;
  }
  const dek = Buffer.from(keyB64, "base64");
  const plaintext = decryptWithKey(dek, file.blob);
  cachedDek = dek;
  cachedData = migrateData(JSON.parse(plaintext));
}

export async function unlockWithRecoveryKey(recoveryKeyInput: string, newPassword: string): Promise<{ ok: true }> {
  const { parseRecoveryKey } = await import("./recovery");
  const recRaw = parseRecoveryKey(recoveryKeyInput);
  if (!recRaw) throw new Error("That doesn't look like a Keying recovery key.");
  const file = await readVaultFile();
  if (file.v !== 2 || !file.rec) {
    throw new Error("This vault has no recovery key. You'll need the master password.");
  }
  if (!newPassword || newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  const recSalt = Buffer.from(file.rec.saltB64, "base64");
  const recKey = deriveKey(recRaw.toString("base64"), recSalt);
  let dek: Buffer;
  try {
    dek = unwrapDek(recKey, file.rec.wrapped);
  } catch {
    throw new Error("Recovery key didn't match. Check for typos.");
  }
  const plaintext = decryptWithKey(dek, file.blob);
  const data = migrateData(JSON.parse(plaintext));

  // Re-wrap the DEK with the new password. Keep the recovery wrapper as-is so
  // the same printed recovery key keeps working.
  const newPwSalt = generateSalt();
  const newPwKey = deriveKey(newPassword, newPwSalt);
  const newPwWrapped = wrapDek(newPwKey, dek, newPwSalt);
  await writeVaultFile({
    v: 2,
    pw: { saltB64: newPwSalt.toString("base64"), wrapped: newPwWrapped },
    rec: file.rec,
    blob: file.blob,
  });
  cachedDek = dek;
  cachedData = data;
  return { ok: true };
}

export async function rotateRecoveryKey(): Promise<{ recoveryKey: string }> {
  ensureUnlocked();
  const file = await readVaultFile();
  if (file.v !== 2) throw new Error("Vault must be on v2 format.");
  const { generateRecoveryKey, formatRecoveryKey } = await import("./recovery");
  const { groups, raw: recRaw } = generateRecoveryKey();
  const recSalt = generateSalt();
  const recKey = deriveKey(recRaw.toString("base64"), recSalt);
  const recWrapped = wrapDek(recKey, cachedDek!, recSalt);
  await writeVaultFile({
    v: 2,
    pw: file.pw,
    rec: { saltB64: recSalt.toString("base64"), wrapped: recWrapped },
    blob: file.blob,
  });
  return { recoveryKey: formatRecoveryKey(groups) };
}

export async function hasRecoveryKey(): Promise<boolean> {
  if (!(await vaultExists())) return false;
  const file = await readVaultFile();
  return file.v === 2 && !!file.rec;
}

export function getCachedKeyB64(): string | null {
  return cachedDek ? cachedDek.toString("base64") : null;
}

export function isUnlocked(): boolean {
  return cachedDek !== null && cachedData !== null;
}

export function lock(): void {
  if (cachedDek) cachedDek.fill(0);
  cachedDek = null;
  cachedData = null;
}

export async function deleteVaultFile(): Promise<void> {
  lock();
  pendingMigrationRecoveryKey = null;
  try {
    await fs.unlink(vaultPath());
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw err;
  }
  try {
    await fs.unlink(vaultPath() + ".tmp");
  } catch {
    /* ignore — temp file may not exist */
  }
}

function ensureUnlocked(): { dek: Buffer; data: VaultData } {
  if (!cachedDek || !cachedData) {
    throw new Error("Vault is locked");
  }
  return { dek: cachedDek, data: cachedData };
}

async function persist(): Promise<void> {
  const { dek, data } = ensureUnlocked();
  const file = await readVaultFile();
  if (file.v === 1) {
    // Legacy v1 vault still on disk — happens when the user unlocked via
    // Touch ID (which uses the stored key directly without going through the
    // password-derived migration path). Keep writing as v1 so saves work;
    // the vault will migrate to v2 on the next password unlock.
    const salt = Buffer.from(file.saltB64, "base64");
    const blob = encryptWithKey(dek, JSON.stringify(data), salt);
    await writeVaultFile({ v: 1, saltB64: file.saltB64, blob });
    return;
  }
  const blob = encryptWithKey(dek, JSON.stringify(data), generateSalt());
  await writeVaultFile({
    v: 2,
    pw: file.pw,
    rec: file.rec,
    blob,
  });
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
  if (file.v === 1) {
    // Migrate while changing password.
    const migrated = await migrateV1ToV2(file, currentPassword);
    cachedDek = migrated.dek;
    cachedData = migrated.data;
    pendingMigrationRecoveryKey = migrated.recoveryKey;
    // Now re-wrap with new password.
    const newSalt = generateSalt();
    const newKey = deriveKey(newPassword, newSalt);
    const newWrapped = wrapDek(newKey, cachedDek, newSalt);
    await writeVaultFile({
      v: 2,
      pw: { saltB64: newSalt.toString("base64"), wrapped: newWrapped },
      rec: migrated.file.rec,
      blob: migrated.file.blob,
    });
    return;
  }
  // v2: verify current password by unwrapping
  const oldPwSalt = Buffer.from(file.pw.saltB64, "base64");
  const oldPwKey = deriveKey(currentPassword, oldPwSalt);
  let dek: Buffer;
  try {
    dek = unwrapDek(oldPwKey, file.pw.wrapped);
  } catch {
    throw new Error("Current password is incorrect.");
  }
  const newPwSalt = generateSalt();
  const newPwKey = deriveKey(newPassword, newPwSalt);
  const newPwWrapped = wrapDek(newPwKey, dek, newPwSalt);
  await writeVaultFile({
    v: 2,
    pw: { saltB64: newPwSalt.toString("base64"), wrapped: newPwWrapped },
    rec: file.rec,
    blob: file.blob,
  });
  cachedDek = dek;
}

export async function readEncryptedFileBytes(): Promise<Buffer> {
  return fs.readFile(vaultPath());
}

export async function restoreFromBackup(backupPath: string): Promise<void> {
  const buf = await fs.readFile(backupPath);
  // Validate it parses as a vault file (v1 or v2 shape) before overwriting.
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch {
    throw new Error("Backup file is not valid — could not parse as JSON.");
  }
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  if (!obj) throw new Error("Backup file is not a valid vault.");
  if (obj.v === 1) {
    if (typeof obj.saltB64 !== "string" || !obj.blob) {
      throw new Error("Backup file is not a valid v1 vault.");
    }
  } else if (obj.v === 2) {
    if (!obj.pw || !obj.blob) {
      throw new Error("Backup file is not a valid v2 vault.");
    }
  } else {
    throw new Error(`Backup file has unsupported version: ${String(obj.v)}`);
  }
  // Lock any currently-unlocked state so the next unlock uses the restored data.
  lock();
  pendingMigrationRecoveryKey = null;
  // Write via the same atomic-rename path as normal saves.
  const tmp = vaultPath() + ".tmp";
  await fs.writeFile(tmp, buf, { mode: 0o600 });
  await fs.rename(tmp, vaultPath());
}
