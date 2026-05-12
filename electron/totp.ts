import { createHmac } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid base32 character: " + c);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpAt(secretB32: string, atMs: number = Date.now()): {
  code: string;
  expiresInMs: number;
  periodMs: number;
} {
  const period = 30_000;
  const counter = Math.floor(atMs / period);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const key = base32Decode(secretB32);
  const digest = createHmac("sha1", key).update(buf).digest();
  const offset = digest[19] & 0x0f;
  const binCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const code = String(binCode % 1_000_000).padStart(6, "0");

  const expiresInMs = period - (atMs % period);
  return { code, expiresInMs, periodMs: period };
}

/**
 * Accepts either:
 *   - a raw base32 secret (e.g. "JBSWY3DPEHPK3PXP")
 *   - a full otpauth URI (e.g. "otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example")
 * Returns the normalized base32 secret, or null if invalid.
 */
export function normalizeTotpInput(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.toLowerCase().startsWith("otpauth://")) {
    try {
      const u = new URL(trimmed);
      const secret = u.searchParams.get("secret");
      if (!secret) return null;
      return cleanBase32(secret);
    } catch {
      return null;
    }
  }

  return cleanBase32(trimmed);
}

function cleanBase32(s: string): string | null {
  const cleaned = s.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  if (!cleaned) return null;
  if (!/^[A-Z2-7]+$/.test(cleaned)) return null;
  // Try to decode — invalid lengths/chars will throw.
  try {
    base32Decode(cleaned);
  } catch {
    return null;
  }
  return cleaned;
}
