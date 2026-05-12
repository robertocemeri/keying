import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from "crypto";

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

export type EncryptedBlob = {
  v: 1;
  salt: string;
  iv: string;
  tag: string;
  ct: string;
  iterations: number;
};

export function deriveKey(masterPassword: string, salt: Buffer): Buffer {
  return pbkdf2Sync(masterPassword, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
}

export function generateSalt(): Buffer {
  return randomBytes(SALT_LEN);
}

export function encryptWithKey(key: Buffer, plaintext: string, salt: Buffer): EncryptedBlob {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
    iterations: PBKDF2_ITERATIONS,
  };
}

export function decryptWithKey(key: Buffer, blob: EncryptedBlob): string {
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const ct = Buffer.from(blob.ct, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

export function encryptString(masterPassword: string, plaintext: string): EncryptedBlob {
  const salt = generateSalt();
  const key = deriveKey(masterPassword, salt);
  return encryptWithKey(key, plaintext, salt);
}

export function decryptString(masterPassword: string, blob: EncryptedBlob): string {
  const salt = Buffer.from(blob.salt, "base64");
  const key = deriveKey(masterPassword, salt);
  return decryptWithKey(key, blob);
}

export function generatePassword(opts: {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
}): string {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const nums = "0123456789";
  const syms = "!@#$%^&*()-_=+[]{};:,.<>?";
  let pool = "";
  if (opts.lowercase) pool += lower;
  if (opts.uppercase) pool += upper;
  if (opts.digits) pool += nums;
  if (opts.symbols) pool += syms;
  if (!pool) pool = lower + upper + nums;
  const bytes = randomBytes(opts.length);
  let out = "";
  for (let i = 0; i < opts.length; i++) {
    out += pool[bytes[i] % pool.length];
  }
  return out;
}
