// Service worker: handles communication with the Keying app over HTTP.
// Keeps the auth token in chrome.storage.local. All credential fetching goes
// through here so the token never lives in content scripts.

const BRIDGE_URL = "http://127.0.0.1:17321";
const STORAGE_KEY = "vault.token";
const APP_DOWNLOAD_URL = "https://keying.app/";

// On first install, open the download page in a new tab so users discover the
// companion app — without it the extension can't reach the loopback bridge and
// silently does nothing. Only fires on "install", not on update.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.tabs.create({ url: APP_DOWNLOAD_URL });
  }
});

// Content scripts use chrome.storage.session to stash pending logins (so the
// "Save this login?" banner survives the navigation to the post-login page)
// and the last-filled entry id (so the 2FA chip knows which entry's TOTP to
// pull). Default access level for storage.session is TRUSTED_CONTEXTS, which
// excludes content scripts — without this grant, every read/write from
// content.js throws and is silently swallowed by its try/catch, so the save
// banner never appears. Firefox doesn't implement setAccessLevel; the
// try/catch keeps the SW from crashing there.
try {
  chrome.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
  });
} catch {
  /* not supported (Firefox); content-script storage access stays restricted */
}

function clientName() {
  // The host app uses this to label the pairing prompt.
  const ua = (globalThis.navigator && navigator.userAgent) || "";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Arc/")) return "Arc";
  if (ua.includes("Brave")) return "Brave";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  return "Chrome";
}

async function getToken() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || null;
}

async function setToken(token) {
  await chrome.storage.local.set({ [STORAGE_KEY]: token });
}

async function clearToken() {
  await chrome.storage.local.remove(STORAGE_KEY);
}

async function fetchJson(path, init = {}) {
  const res = await fetch(BRIDGE_URL + path, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: "bad-json" };
  }
  return { status: res.status, body };
}

async function authedJson(path, init = {}) {
  const token = await getToken();
  if (!token) return { status: 401, body: { error: "not-paired" } };
  return fetchJson(path, {
    ...init,
    headers: { Authorization: "Bearer " + token, ...(init.headers || {}) },
  });
}

async function status() {
  try {
    const { body } = await fetchJson("/status");
    return { reachable: true, unlocked: !!body.unlocked };
  } catch {
    return { reachable: false, unlocked: false };
  }
}

async function pairStart() {
  return fetchJson("/pair/start", {
    method: "POST",
    body: JSON.stringify({ client: clientName() }),
  });
}

async function pairVerify(code) {
  const { status, body } = await fetchJson("/pair/verify", {
    method: "POST",
    body: JSON.stringify({ code, client: clientName() }),
  });
  if (status === 200 && body.token) {
    await setToken(body.token);
    return { ok: true };
  }
  return { ok: false, error: body.error || "verify-failed" };
}

async function query(domain) {
  const { status, body } = await authedJson("/query?domain=" + encodeURIComponent(domain));
  if (status === 200) {
    return {
      ok: true,
      matches: body.matches || [],
      filteredOut: typeof body.filteredOut === "number" ? body.filteredOut : 0,
    };
  }
  return { ok: false, error: body.error || "query-failed", status };
}

async function credentials(id) {
  const { status, body } = await authedJson("/credentials?id=" + encodeURIComponent(id));
  if (status === 200) return { ok: true, credentials: body.credentials };
  return { ok: false, error: body.error || "credentials-failed", status };
}

async function getPreferences() {
  const { status, body } = await authedJson("/preferences");
  if (status === 200) return { ok: true, autofillDisabled: !!body.autofillDisabled };
  return { ok: false, error: body.error || "prefs-failed", status };
}

async function setPreferences(patch) {
  const { status, body } = await authedJson("/preferences", {
    method: "POST",
    body: JSON.stringify(patch),
  });
  if (status === 200) return { ok: true, autofillDisabled: !!body.autofillDisabled };
  return { ok: false, error: body.error || "prefs-failed", status };
}

async function saveLogin(payload) {
  const { status, body } = await authedJson("/save", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (status === 200) return { ok: true, id: body.id };
  return { ok: false, error: body.error || "save-failed", status };
}

async function totp(id) {
  const { status, body } = await authedJson("/totp?id=" + encodeURIComponent(id));
  if (status === 200) return { ok: true, code: body.code, expiresInMs: body.expiresInMs };
  return { ok: false, error: body.error || "totp-failed", status };
}

async function generate(length) {
  const len = Math.min(Math.max(parseInt(length, 10) || 20, 8), 128);
  const { status, body } = await authedJson("/generate?length=" + len);
  if (status === 200) return { ok: true, password: body.password };
  return { ok: false, error: body.error || "generate-failed", status };
}

// chrome.storage.session is gated to TRUSTED_CONTEXTS by default and we grant
// content-script access via setAccessLevel above — but when the SW idles out
// and restarts, a content-script set() can race the setAccessLevel call. To
// eliminate that race, route all session storage I/O through the SW (these
// handlers always run privileged). Content scripts call us via sendMessage.
async function sessionGet(key) {
  const data = await chrome.storage.session.get(key);
  return { ok: true, value: data[key] ?? null };
}
async function sessionSet(key, value) {
  await chrome.storage.session.set({ [key]: value });
  return { ok: true };
}
async function sessionRemove(key) {
  await chrome.storage.session.remove(key);
  return { ok: true };
}

// Message routing from popup + content scripts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "status":
          sendResponse(await status());
          return;
        case "pair-start":
          sendResponse(await pairStart());
          return;
        case "pair-verify":
          sendResponse(await pairVerify(msg.code));
          return;
        case "query":
          sendResponse(await query(msg.domain));
          return;
        case "credentials":
          sendResponse(await credentials(msg.id));
          return;
        case "unpair":
          await clearToken();
          sendResponse({ ok: true });
          return;
        case "has-token":
          sendResponse({ ok: true, paired: !!(await getToken()) });
          return;
        case "get-prefs":
          sendResponse(await getPreferences());
          return;
        case "set-prefs":
          sendResponse(await setPreferences(msg.patch || {}));
          return;
        case "save-login":
          sendResponse(await saveLogin(msg.payload || {}));
          return;
        case "totp":
          sendResponse(await totp(msg.id));
          return;
        case "generate":
          sendResponse(await generate(msg.length));
          return;
        case "session-get":
          sendResponse(await sessionGet(msg.key));
          return;
        case "session-set":
          sendResponse(await sessionSet(msg.key, msg.value));
          return;
        case "session-remove":
          sendResponse(await sessionRemove(msg.key));
          return;
        default:
          sendResponse({ ok: false, error: "unknown-message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true; // keep channel open for async sendResponse
});
