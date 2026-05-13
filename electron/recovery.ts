import { randomBytes } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid recovery character: " + c);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateRecoveryKey(): { groups: string[]; raw: Buffer } {
  const raw = randomBytes(20);
  const encoded = base32Encode(raw);
  const groups: string[] = [];
  for (let i = 0; i < encoded.length; i += 5) {
    groups.push(encoded.slice(i, i + 5));
  }
  return { groups, raw };
}

export function formatRecoveryKey(groups: string[]): string {
  return groups.join("-");
}

export function parseRecoveryKey(input: string): Buffer | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (cleaned.length < 24) return null;
  try {
    const buf = base32Decode(cleaned);
    if (buf.length < 16) return null;
    return buf.subarray(0, 20);
  } catch {
    return null;
  }
}
