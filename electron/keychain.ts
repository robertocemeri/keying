import keytar from "keytar";
import { systemPreferences } from "electron";

const SERVICE = "Keying";
const ACCOUNT = "vault-key";

export async function hasStoredKey(): Promise<boolean> {
  const value = await keytar.getPassword(SERVICE, ACCOUNT);
  return value !== null && value.length > 0;
}

export async function storeKey(keyB64: string): Promise<void> {
  await keytar.setPassword(SERVICE, ACCOUNT, keyB64);
}

export async function getStoredKey(): Promise<string | null> {
  return await keytar.getPassword(SERVICE, ACCOUNT);
}

export async function deleteStoredKey(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}

export function isTouchIDAvailable(): boolean {
  try {
    return systemPreferences.canPromptTouchID?.() ?? false;
  } catch {
    return false;
  }
}

export async function promptTouchID(reason: string): Promise<boolean> {
  if (!isTouchIDAvailable()) return false;
  try {
    await systemPreferences.promptTouchID(reason);
    return true;
  } catch {
    return false;
  }
}
