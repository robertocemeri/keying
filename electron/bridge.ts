import http from "http";
import { randomBytes, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { app, BrowserWindow } from "electron";
import {
  listEntries,
  isUnlocked,
  isAutofillAllowed,
  getGlobalSettings,
  setGlobalSettings,
  addEntry,
  Entry,
} from "./vault";
import { totpAt } from "./totp";
import { generatePassword } from "./crypto";

const PORT = 17321;
const TOKENS_FILENAME = "bridge-tokens.json";

type TokenRecord = {
  token: string;
  client: string;
  createdAt: number;
  lastUsed: number;
};

type TokensFile = {
  v: 1;
  tokens: TokenRecord[];
};

type PendingPairing = {
  code: string;
  client: string;
  createdAt: number;
  resolve: (token: string | null) => void;
};

let pending: PendingPairing | null = null;
let server: http.Server | null = null;
let tokensCache: TokenRecord[] = [];

function tokensPath(): string {
  return path.join(app.getPath("userData"), TOKENS_FILENAME);
}

function broadcastToAll(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args);
  }
}

async function loadTokens(): Promise<void> {
  try {
    const raw = await fs.readFile(tokensPath(), "utf8");
    const file = JSON.parse(raw) as TokensFile;
    tokensCache = file.tokens ?? [];
  } catch {
    tokensCache = [];
  }
}

async function saveTokens(): Promise<void> {
  const file: TokensFile = { v: 1, tokens: tokensCache };
  await fs.writeFile(tokensPath(), JSON.stringify(file), { mode: 0o600 });
}

function tokenMatches(provided: string): TokenRecord | null {
  const providedBuf = Buffer.from(provided, "utf8");
  for (const rec of tokensCache) {
    const expected = Buffer.from(rec.token, "utf8");
    if (expected.length === providedBuf.length && timingSafeEqual(expected, providedBuf)) {
      return rec;
    }
  }
  return null;
}

function sixDigitCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

// App-initiated pairing: the user clicks "Pair new browser" inside the app
// and gets a code synchronously, with no dependency on IPC events between
// the bridge HTTP request and the renderer. Used as a fallback when the
// extension-initiated pair flow's IPC event gets lost or the renderer
// subscription isn't ready. Returns the code (and replaces any previous
// pending pairing).
export function startPairingFromApp(client: string): {
  code: string;
  expiresAt: number;
} {
  if (pending) {
    pending.resolve(null);
    pending = null;
  }
  const code = sixDigitCode();
  pending = {
    code,
    client,
    createdAt: Date.now(),
    resolve: () => {},
  };
  // Still broadcast in case any renderer is listening — harmless if not.
  broadcastToAll("bridge:pairing-prompt", { code, client });
  setTimeout(() => {
    if (pending && pending.code === code) {
      pending.resolve(null);
      pending = null;
      broadcastToAll("bridge:pairing-cancelled");
    }
  }, 90_000);
  return { code, expiresAt: Date.now() + 90_000 };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(data);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function normalizeDomain(input: string): string {
  if (!input) return "";
  let s = input.trim().toLowerCase();
  // Allow callers to pass full URLs
  try {
    if (/^https?:\/\//.test(s)) s = new URL(s).hostname;
  } catch {
    /* fall through */
  }
  // Strip leading www.
  s = s.replace(/^www\./, "");
  return s;
}

function entryDomain(entry: Entry): string {
  if (!entry.url) return "";
  try {
    const u = /^https?:\/\//i.test(entry.url) ? entry.url : "https://" + entry.url;
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return entry.url.toLowerCase().replace(/^www\./, "");
  }
}

function domainMatches(target: string, candidate: string): boolean {
  if (!target || !candidate) return false;
  if (target === candidate) return true;
  // Match parent domains (e.g. accounts.google.com matches google.com)
  return target.endsWith("." + candidate) || candidate.endsWith("." + target);
}

function entriesForDomain(domain: string): { allowed: Entry[]; filteredOut: number } {
  const target = normalizeDomain(domain);
  const matchingDomain = listEntries().filter((e) =>
    domainMatches(target, entryDomain(e))
  );
  const allowed: Entry[] = [];
  let filteredOut = 0;
  for (const e of matchingDomain) {
    if (isAutofillAllowed(e)) allowed.push(e);
    else filteredOut++;
  }
  return { allowed, filteredOut };
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  // Bridge is bound to 127.0.0.1 only and sensitive endpoints require a paired
  // token, so the loopback + token combo is the real perimeter. Origin headers
  // are unreliable from extension service workers (Chrome elides them for URLs
  // covered by host_permissions), so we don't gate on them.

  const url = new URL(req.url ?? "/", "http://localhost");
  const route = `${req.method} ${url.pathname}`;

  // Public endpoints
  if (route === "GET /status") {
    sendJson(res, 200, {
      ok: true,
      unlocked: isUnlocked(),
      app: "Keying",
      v: 1,
    });
    return;
  }

  if (route === "POST /pair/start") {
    const body = await readBody(req);
    let client = "Unknown browser";
    try {
      const parsed = JSON.parse(body || "{}");
      if (typeof parsed.client === "string" && parsed.client.length < 80) client = parsed.client;
    } catch {
      /* tolerate */
    }
    if (pending) {
      // Cancel previous pending
      pending.resolve(null);
      pending = null;
    }
    const code = sixDigitCode();
    broadcastToAll("bridge:pairing-prompt", { code, client });
    const tokenPromise = new Promise<string | null>((resolve) => {
      pending = { code, client, createdAt: Date.now(), resolve };
    });
    // Auto-expire pairing after 90s
    const timer = setTimeout(() => {
      if (pending && pending.code === code) {
        pending.resolve(null);
        pending = null;
        broadcastToAll("bridge:pairing-cancelled");
      }
    }, 90_000);
    sendJson(res, 200, { ok: true });
    // Pairing token will arrive via /pair/verify; nothing async to do here.
    void tokenPromise;
    void timer;
    return;
  }

  if (route === "POST /pair/verify") {
    const body = await readBody(req);
    let code = "";
    let client = "Unknown browser";
    try {
      const parsed = JSON.parse(body || "{}");
      if (typeof parsed.code === "string") code = parsed.code.trim();
      if (typeof parsed.client === "string" && parsed.client.length < 80) client = parsed.client;
    } catch {
      sendJson(res, 400, { error: "bad-request" });
      return;
    }
    if (!pending) {
      sendJson(res, 400, { error: "no-pending-pairing" });
      return;
    }
    if (pending.code !== code) {
      sendJson(res, 401, { error: "invalid-code" });
      return;
    }
    const token = randomBytes(32).toString("base64url");
    const rec: TokenRecord = {
      token,
      client,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
    tokensCache.push(rec);
    await saveTokens();
    const resolve = pending.resolve;
    pending = null;
    resolve(token);
    broadcastToAll("bridge:pairing-completed", { client });
    sendJson(res, 200, { ok: true, token });
    return;
  }

  // Token-required endpoints
  const auth = req.headers.authorization ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const tokenRecord = bearer ? tokenMatches(bearer) : null;
  if (!tokenRecord) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  tokenRecord.lastUsed = Date.now();

  if (!isUnlocked()) {
    sendJson(res, 423, { error: "vault-locked" });
    return;
  }

  if (route === "GET /preferences") {
    const g = getGlobalSettings();
    sendJson(res, 200, { ok: true, autofillDisabled: !!g.autofillDisabled });
    return;
  }

  if (route === "POST /preferences") {
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body || "{}");
      const patch: Record<string, unknown> = {};
      if (typeof parsed.autofillDisabled === "boolean") {
        patch.autofillDisabled = parsed.autofillDisabled || undefined;
      }
      await setGlobalSettings(patch);
      broadcastToAll("vault:global-settings-changed", getGlobalSettings());
      const g = getGlobalSettings();
      sendJson(res, 200, { ok: true, autofillDisabled: !!g.autofillDisabled });
    } catch {
      sendJson(res, 400, { error: "bad-request" });
    }
    return;
  }

  if (route === "GET /query") {
    const domain = url.searchParams.get("domain") ?? "";
    const { allowed, filteredOut } = entriesForDomain(domain);
    const matches = allowed.map((e) => ({
      id: e.id,
      title: e.title,
      username: e.username,
      url: e.url,
      hasTotp: !!e.totpSecret,
    }));
    sendJson(res, 200, { ok: true, matches, filteredOut });
    return;
  }

  if (route === "GET /totp") {
    const id = url.searchParams.get("id") ?? "";
    const entry = listEntries().find((e) => e.id === id);
    if (!entry || !entry.totpSecret) {
      sendJson(res, 404, { error: "not-found" });
      return;
    }
    if (!isAutofillAllowed(entry)) {
      sendJson(res, 403, { error: "autofill-disabled" });
      return;
    }
    try {
      const { code, expiresInMs, periodMs } = totpAt(entry.totpSecret);
      sendJson(res, 200, { ok: true, code, expiresInMs, periodMs });
    } catch {
      sendJson(res, 500, { error: "totp-failed" });
    }
    return;
  }

  if (route === "GET /credentials") {
    const id = url.searchParams.get("id") ?? "";
    const entry = listEntries().find((e) => e.id === id);
    if (!entry) {
      sendJson(res, 404, { error: "not-found" });
      return;
    }
    if (!isAutofillAllowed(entry)) {
      sendJson(res, 403, { error: "autofill-disabled" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      credentials: {
        id: entry.id,
        title: entry.title,
        username: entry.username,
        password: entry.password,
        url: entry.url,
      },
    });
    return;
  }

  if (route === "GET /generate") {
    const length = Math.min(
      Math.max(parseInt(url.searchParams.get("length") ?? "20", 10) || 20, 8),
      128
    );
    const password = generatePassword({
      length,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
    });
    sendJson(res, 200, { ok: true, password });
    return;
  }

  if (route === "POST /save") {
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body || "{}") as {
        title?: unknown;
        url?: unknown;
        username?: unknown;
        password?: unknown;
      };
      const title = String(parsed.title || "").trim().slice(0, 120);
      const username = String(parsed.username || "").slice(0, 200);
      const password = String(parsed.password || "");
      const entryUrl = String(parsed.url || "").slice(0, 500);
      if (!title) {
        sendJson(res, 400, { error: "title-required" });
        return;
      }
      if (!password) {
        sendJson(res, 400, { error: "password-required" });
        return;
      }
      const targetDomain = normalizeDomain(entryUrl);
      const duplicate = listEntries().find(
        (e) =>
          domainMatches(targetDomain, entryDomain(e)) &&
          e.username === username
      );
      if (duplicate) {
        sendJson(res, 409, { error: "duplicate", id: duplicate.id });
        return;
      }
      const created = await addEntry({
        title,
        username,
        password,
        url: entryUrl,
        notes: "",
        folder: "",
      });
      sendJson(res, 200, { ok: true, id: created.id });
    } catch {
      sendJson(res, 400, { error: "bad-request" });
    }
    return;
  }

  sendJson(res, 404, { error: "not-found" });
}

export async function startBridge(): Promise<void> {
  await loadTokens();
  if (server) return;
  server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Bridge error", err);
      try {
        sendJson(res, 500, { error: "internal" });
      } catch {
        /* ignore */
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(PORT, "127.0.0.1", () => resolve());
  });
}

export async function stopBridge(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
}

export async function listPairedClients(): Promise<{ client: string; createdAt: number; lastUsed: number }[]> {
  await loadTokens();
  return tokensCache.map((t) => ({
    client: t.client,
    createdAt: t.createdAt,
    lastUsed: t.lastUsed,
  }));
}

export async function revokeAllTokens(): Promise<void> {
  tokensCache = [];
  await saveTokens();
}

export function cancelPendingPairing(): void {
  if (pending) {
    pending.resolve(null);
    pending = null;
  }
}
