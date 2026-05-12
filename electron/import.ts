import { normalizeTotpInput } from "./totp";

export type ImportedEntry = {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  folder: string;
  totpSecret?: string;
};

export type ImportResult = {
  format: string;
  entries: ImportedEntry[];
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        field = "";
        row = [];
      } else {
        field += c;
      }
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-]+/g, " ").trim();
}

const HEADER_ALIASES: Record<string, string[]> = {
  title: ["title", "name", "item name", "site"],
  url: ["url", "website", "uri", "login uri", "web site", "address"],
  username: [
    "username",
    "email",
    "login",
    "login username",
    "user",
    "user name",
    "account",
  ],
  password: ["password", "pass", "login password"],
  notes: ["notes", "comment", "comments", "note", "extra"],
  totp: [
    "totp",
    "otpauth",
    "otp",
    "login totp",
    "one time password",
    "2fa",
    "otp auth",
  ],
  folder: ["folder", "group", "grouping", "category", "tags"],
};

function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalized = headers.map(normalizeHeader);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx >= 0) {
        map[key] = idx;
        break;
      }
    }
  }
  return map;
}

function getField(row: string[], map: Record<string, number>, key: string): string {
  const idx = map[key];
  if (idx === undefined) return "";
  return row[idx] ?? "";
}

function parseGenericCsv(text: string): ImportedEntry[] {
  const rows = parseCsv(text).filter((r) => r.length > 0 && r.some((c) => c));
  if (rows.length < 2) return [];
  const headers = rows[0];
  const map = buildHeaderMap(headers);
  if (map.password === undefined && map.title === undefined && map.url === undefined) {
    return [];
  }
  const out: ImportedEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = getField(r, map, "title").trim();
    const username = getField(r, map, "username").trim();
    const password = getField(r, map, "password");
    if (!title && !username && !password) continue;
    const totpRaw = getField(r, map, "totp").trim();
    const totp = totpRaw ? normalizeTotpInput(totpRaw) : null;
    out.push({
      title: title || "Imported",
      username,
      password,
      url: getField(r, map, "url").trim(),
      notes: getField(r, map, "notes").trim(),
      folder: getField(r, map, "folder").trim(),
      totpSecret: totp || undefined,
    });
  }
  return out;
}

function parseBitwardenJson(text: string): ImportedEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const obj = parsed as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? (obj.items as Array<Record<string, unknown>>) : null;
  if (!items) return [];

  const folders: Record<string, string> = {};
  if (Array.isArray(obj.folders)) {
    for (const f of obj.folders as Array<Record<string, unknown>>) {
      if (typeof f?.id === "string" && typeof f.name === "string") {
        folders[f.id] = f.name;
      }
    }
  }

  const out: ImportedEntry[] = [];
  for (const item of items) {
    // Bitwarden type 1 = login. Skip notes (2), card (3), identity (4).
    if (item?.type !== 1) continue;
    const login = (item.login || {}) as Record<string, unknown>;
    const uris = Array.isArray(login.uris) ? (login.uris as Array<Record<string, unknown>>) : [];
    const firstUri = uris[0] && typeof uris[0].uri === "string" ? String(uris[0].uri) : "";
    const totpRaw = typeof login.totp === "string" ? login.totp : "";
    const totp = totpRaw ? normalizeTotpInput(totpRaw) : null;
    const folderId = typeof item.folderId === "string" ? item.folderId : null;
    out.push({
      title: String(item.name || "").trim() || "Imported",
      username: String(login.username || "").trim(),
      password: String(login.password || ""),
      url: firstUri.trim(),
      notes: String(item.notes || "").trim(),
      folder: folderId && folders[folderId] ? folders[folderId] : "",
      totpSecret: totp || undefined,
    });
  }
  return out;
}

function detectCsvDialect(headers: string[]): string {
  const normalized = headers.map(normalizeHeader);
  if (normalized.includes("login uri") && normalized.includes("login password")) {
    return "Bitwarden CSV";
  }
  if (normalized.includes("otpauth") && normalized.includes("url")) {
    return "1Password / iCloud Keychain CSV";
  }
  if (normalized.includes("url") && normalized.includes("username") && normalized.includes("password")) {
    return "Browser CSV";
  }
  return "Generic CSV";
}

export function detectAndParse(text: string): ImportResult {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const entries = parseBitwardenJson(trimmed);
    if (entries.length) return { format: "Bitwarden JSON", entries };
  }
  const entries = parseGenericCsv(text);
  if (entries.length) {
    const headers = parseCsv(text)[0] ?? [];
    return { format: detectCsvDialect(headers), entries };
  }
  return { format: "Unknown", entries: [] };
}
