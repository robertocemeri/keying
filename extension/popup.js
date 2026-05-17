const $ = (id) => document.getElementById(id);

const APP_DOWNLOAD_URL = "https://keying.app/";
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || "") ||
  /Mac OS X/.test(navigator.userAgent || "");

$("btn-get-app").href = APP_DOWNLOAD_URL;

async function send(msg) {
  return await chrome.runtime.sendMessage(msg);
}

function setPill(text, kind) {
  const pill = $("status-pill");
  pill.textContent = text;
  pill.className = "pill " + (kind || "");
}

function show(view) {
  ["view-status", "view-pair", "view-matches"].forEach((id) => {
    $(id).hidden = id !== view;
  });
}

async function refresh() {
  const s = await send({ type: "status" });
  if (!s?.reachable) {
    setPill("Offline", "err");
    show("view-status");
    if (!IS_MAC) {
      $("status-title").textContent = "Keying needs the Mac app";
      $("status-detail").textContent =
        "Keying is a local password manager — the browser extension talks to a companion app that currently runs on macOS only.";
      $("btn-pair").hidden = true;
      $("btn-get-app").hidden = false;
      $("btn-retry").hidden = true;
    } else {
      $("status-title").textContent = "Keying app not running";
      $("status-detail").textContent =
        "Open the Keying app on your Mac, then try again. Don't have it yet?";
      $("btn-pair").hidden = true;
      $("btn-get-app").hidden = false;
      $("btn-retry").hidden = false;
    }
    return;
  }
  $("btn-get-app").hidden = true;

  const t = await send({ type: "has-token" });
  if (!t.paired) {
    setPill("Setup", "warn");
    show("view-status");
    $("status-title").textContent = "Not paired yet";
    $("status-detail").textContent = "Pair this browser with Keying to start autofilling.";
    $("btn-pair").hidden = false;
    $("btn-retry").hidden = true;
    return;
  }

  if (!s.unlocked) {
    setPill("Locked", "warn");
    show("view-status");
    $("status-title").textContent = "Keying is locked";
    $("status-detail").textContent =
      "Unlock Keying on your Mac (Touch ID or master password), then reopen this popup.";
    $("btn-pair").hidden = true;
    $("btn-retry").hidden = false;
    return;
  }

  setPill("Connected", "ok");

  // Vault is unlocked. Show matches for current tab's host.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* about: or chrome: pages */
  }
  $("matches-title").textContent = host ? "Matches on " + host : "Matches";
  show("view-matches");

  // Load global pref state
  const prefs = await send({ type: "get-prefs" });
  if (prefs?.ok) {
    const paused = prefs.autofillDisabled;
    $("pause-toggle").checked = !paused;
    $("prefs-state").textContent = paused ? "Paused everywhere" : "On for all sites";
    $("prefs-row").classList.toggle("paused", !!paused);
  }
  $("matches-list").innerHTML = "";
  $("no-matches").hidden = true;

  if (!host) {
    $("no-matches").hidden = false;
    $("no-matches").textContent = "Open a website to see matches.";
    return;
  }

  const q = await send({ type: "query", domain: host });
  if (!q?.ok) {
    $("no-matches").hidden = false;
    if (q?.status === 423) {
      setPill("Locked", "warn");
      $("no-matches").textContent = "Keying is locked. Unlock it in the app.";
    } else if (q?.status === 401) {
      $("no-matches").textContent =
        "Pairing not recognized. Click 'Unpair this browser' below, then pair again.";
    } else if (typeof q?.status !== "number") {
      $("no-matches").textContent = "Couldn't reach Keying. Is the app running?";
    } else {
      $("no-matches").textContent = "Couldn't fetch matches (HTTP " + q.status + ").";
    }
    return;
  }
  if (!q.matches.length) {
    $("no-matches").hidden = false;
    if (q.filteredOut > 0) {
      $("no-matches").textContent =
        q.filteredOut === 1
          ? "1 entry exists for this site but is excluded from autofill."
          : `${q.filteredOut} entries exist for this site but are excluded from autofill.`;
    } else {
      $("no-matches").textContent = "No entries for this site yet.";
    }
    return;
  }
  q.matches.forEach((m) => {
    const li = document.createElement("li");
    li.className = "match-row";

    const fillBtn = document.createElement("button");
    fillBtn.className = "match-fill";
    fillBtn.innerHTML = `<span class="title">${escapeHtml(m.title || "(untitled)")}</span><span class="sub">${escapeHtml(m.username || "")}</span>`;
    fillBtn.addEventListener("click", async () => {
      const r = await send({ type: "credentials", id: m.id });
      if (!r?.ok) {
        const msg =
          r?.status === 423 ? "Keying is locked." :
          r?.status === 403 ? "Autofill is disabled for this entry." :
          "Couldn't fetch credentials.";
        alert(msg);
        return;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillCreds,
        args: [r.credentials.username, r.credentials.password],
      });
      window.close();
    });
    li.appendChild(fillBtn);

    if (m.hasTotp) {
      const totpBtn = document.createElement("button");
      totpBtn.className = "match-totp";
      totpBtn.title = "Copy one-time code";
      totpBtn.textContent = "Code";
      totpBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const r = await send({ type: "totp", id: m.id });
        if (!r?.ok) {
          alert(r?.status === 423 ? "Keying is locked." : "Couldn't fetch code.");
          return;
        }
        await navigator.clipboard.writeText(r.code);
        totpBtn.textContent = "Copied";
        setTimeout(() => window.close(), 400);
      });
      li.appendChild(totpBtn);
    }

    $("matches-list").appendChild(li);
  });
}

function fillCreds(username, password) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  const fire = (el, v) => {
    if (set) set.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const pw = document.querySelector("input[type=password]");
  if (!pw) return;
  const user =
    (pw.form &&
      Array.from(pw.form.querySelectorAll("input")).find((i) => {
        const t = (i.type || "").toLowerCase();
        return t === "email" || t === "text" || t === "tel" || t === "username" || t === "";
      })) ||
    null;
  if (user && username) fire(user, username);
  fire(pw, password);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

$("btn-pair").addEventListener("click", async () => {
  const r = await send({ type: "pair-start" });
  if (!r?.ok && r?.status !== 200) {
    // /pair/start always returns 200 if reachable
  }
  show("view-pair");
  $("code").value = "";
  $("pair-err").hidden = true;
  setTimeout(() => $("code").focus(), 50);
});

$("btn-cancel-pair").addEventListener("click", () => {
  refresh();
});

$("btn-verify").addEventListener("click", async () => {
  const code = ($("code").value || "").trim();
  if (!/^\d{6}$/.test(code)) {
    $("pair-err").hidden = false;
    $("pair-err").textContent = "Enter the 6-digit code from the Keying app.";
    return;
  }
  const r = await send({ type: "pair-verify", code });
  if (!r?.ok) {
    $("pair-err").hidden = false;
    $("pair-err").textContent = r?.error === "invalid-code" ? "Wrong code. Try again." : "Pairing failed.";
    return;
  }
  refresh();
});

$("code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btn-verify").click();
});

$("btn-retry").addEventListener("click", refresh);

$("btn-unpair").addEventListener("click", async () => {
  await send({ type: "unpair" });
  refresh();
});

$("pause-toggle").addEventListener("change", async (e) => {
  const enabled = e.target.checked;
  const r = await send({ type: "set-prefs", patch: { autofillDisabled: !enabled } });
  if (r?.ok) {
    const paused = r.autofillDisabled;
    $("prefs-state").textContent = paused ? "Paused everywhere" : "On for all sites";
    $("prefs-row").classList.toggle("paused", paused);
  }
});

refresh();
