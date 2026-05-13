// Detects login forms, asks the bridge for matches for the current site,
// and shows an inline chip next to the username field. Click → fill.

(function () {
  if (window.__passwordVaultInjected) return;
  window.__passwordVaultInjected = true;

  const HOST = location.hostname.replace(/^www\./, "");
  let chip = null;
  let matches = [];
  let currentPw = null;
  let currentAnchor = null;

  function isPasswordInput(el) {
    return el instanceof HTMLInputElement && el.type === "password";
  }

  function findUsernameField(pwField) {
    if (!pwField) return null;
    // Walk DOM backwards from password field looking for a likely username/email input.
    const form = pwField.form;
    const candidates = form
      ? Array.from(form.querySelectorAll("input"))
      : Array.from(document.querySelectorAll("input"));
    const idx = candidates.indexOf(pwField);
    const before = idx >= 0 ? candidates.slice(0, idx).reverse() : candidates;
    for (const el of before) {
      const t = (el.type || "").toLowerCase();
      if (t === "email" || t === "text" || t === "tel" || t === "" || t === "username") {
        if (el.offsetParent !== null) return el;
      }
    }
    return null;
  }

  function findFirstLoginPair() {
    const pwFields = Array.from(document.querySelectorAll("input[type=password]")).filter(
      (el) => el.offsetParent !== null && !el.disabled && !el.readOnly
    );
    for (const pw of pwFields) {
      const user = findUsernameField(pw);
      return { user, pw };
    }
    return null;
  }

  function removeChip() {
    if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
    chip = null;
    currentPw = null;
    currentAnchor = null;
  }

  function positionChipNear(input) {
    if (!chip || !input) return;
    const rect = input.getBoundingClientRect();
    chip.style.top = window.scrollY + rect.top + rect.height / 2 - 14 + "px";
    chip.style.left = window.scrollX + rect.right - 30 + "px";
  }

  function buildChip(label, count) {
    removeChip();
    chip = document.createElement("div");
    chip.className = "__pv-chip";
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-label", label);
    chip.tabIndex = 0;
    chip.innerHTML = `
      <span class="__pv-icon" aria-hidden="true">🔑</span>
      <span class="__pv-text">${count > 1 ? count + " matches" : "Fill"}</span>
    `;
    document.body.appendChild(chip);
    return chip;
  }

  function showPicker(anchor, items, onPick) {
    const menu = document.createElement("div");
    menu.className = "__pv-menu";
    items.forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "__pv-row";
      row.innerHTML = `
        <span class="__pv-row-title">${escapeHtml(item.title || "(untitled)")}</span>
        <span class="__pv-row-sub">${escapeHtml(item.username || "")}</span>
      `;
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        document.body.removeChild(menu);
        onPick(item);
      });
      menu.appendChild(row);
    });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = window.scrollY + r.bottom + 6 + "px";
    menu.style.left = window.scrollX + r.left - 200 + "px";
    const dismiss = (e) => {
      if (!menu.contains(e.target)) {
        if (menu.parentNode) document.body.removeChild(menu);
        document.removeEventListener("mousedown", dismiss, true);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", dismiss, true), 0);
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

  function dispatchInput(el, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillWith(item, pair) {
    const res = await chrome.runtime.sendMessage({ type: "credentials", id: item.id });
    if (!res?.ok) {
      if (res?.status === 423) toast("Keying is locked.");
      else if (res?.status === 403) toast("Autofill is disabled for this entry.");
      else toast("Couldn't fetch credentials.");
      return;
    }
    const creds = res.credentials;
    if (pair.user && creds.username) {
      pair.user.focus();
      dispatchInput(pair.user, creds.username);
    }
    if (pair.pw && creds.password) {
      pair.pw.focus();
      dispatchInput(pair.pw, creds.password);
    }
    // Remember which entry was just filled — used to pre-select the right
    // entry when the 2FA page appears on the next navigation.
    try {
      await chrome.storage.session.set({
        ["lastFill:" + HOST]: {
          id: item.id,
          hasTotp: !!item.hasTotp,
          ts: Date.now(),
        },
      });
    } catch {
      /* ignore */
    }
    toast("Filled from Keying");
  }

  let toastEl = null;
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "__pv-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("__pv-toast-show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl?.classList.remove("__pv-toast-show"), 1800);
  }

  async function check() {
    const pair = findFirstLoginPair();
    if (!pair?.pw) {
      if (chip) removeChip();
      return;
    }
    const anchor = pair.user || pair.pw;

    // If the same login form is still on the page and we already drew a chip
    // for it, don't tear it down — just keep its position in sync. Rebuilding
    // the chip every DOM mutation causes hover state to flicker.
    if (chip && currentPw === pair.pw && currentAnchor === anchor) {
      positionChipNear(anchor);
      return;
    }

    try {
      const res = await chrome.runtime.sendMessage({ type: "query", domain: HOST });
      if (!res?.ok) {
        if (chip) removeChip();
        return;
      }
      matches = res.matches || [];
      if (!matches.length) {
        if (chip) removeChip();
        return;
      }
      const c = buildChip("Fill from Keying", matches.length);
      currentPw = pair.pw;
      currentAnchor = anchor;
      positionChipNear(anchor);
      c.addEventListener("click", () => {
        if (matches.length === 1) {
          fillWith(matches[0], pair);
        } else {
          showPicker(c, matches, (m) => fillWith(m, pair));
        }
      });
    } catch {
      if (chip) removeChip();
    }
  }

  // --- 2FA / TOTP autofill ---

  let totpChip = null;
  let currentOtpInput = null;
  let pendingTotpEntryId = null;

  const TOTP_KEYWORDS = /(otp|2fa|two[-_\s]?factor|totp|authenticator|verification[-_\s]?code|security[-_\s]?code|one[-_\s]?time)/i;

  function findOtpField() {
    // 1. Standard autocomplete attribute — gold signal
    const byAutocomplete = document.querySelector('input[autocomplete*="one-time-code" i]');
    if (byAutocomplete instanceof HTMLInputElement && isVisibleInput(byAutocomplete)) {
      return byAutocomplete;
    }
    // 2. Name / id / aria attribute patterns
    const candidates = document.querySelectorAll(
      "input[type=text], input[type=tel], input[type=number], input[type=password], input:not([type])"
    );
    for (const el of candidates) {
      if (!(el instanceof HTMLInputElement)) continue;
      if (!isVisibleInput(el)) continue;
      if (el.type === "password" && (el.value || "").length === 0) {
        // Skip if it really looks like a login password field (no OTP hints).
        if (!hasOtpHint(el)) continue;
      }
      if (hasOtpHint(el)) return el;
      // 3. maxlength=6 + numeric input mode (heuristic, lower confidence)
      if (
        el.maxLength === 6 &&
        (el.inputMode === "numeric" ||
          (el.pattern && /\\d|0-9/.test(el.pattern)))
      ) {
        return el;
      }
    }
    return null;
  }

  function hasOtpHint(el) {
    const blob =
      (el.name || "") +
      " " +
      (el.id || "") +
      " " +
      (el.autocomplete || "") +
      " " +
      (el.getAttribute("aria-label") || "") +
      " " +
      (el.placeholder || "");
    return TOTP_KEYWORDS.test(blob);
  }

  function isVisibleInput(el) {
    return el.offsetParent !== null && !el.disabled && !el.readOnly;
  }

  function removeTotpChip() {
    if (totpChip && totpChip.parentNode) totpChip.parentNode.removeChild(totpChip);
    totpChip = null;
    currentOtpInput = null;
    pendingTotpEntryId = null;
  }

  function buildTotpChip() {
    if (totpChip && totpChip.parentNode) totpChip.parentNode.removeChild(totpChip);
    totpChip = document.createElement("div");
    totpChip.className = "__pv-chip __pv-chip-totp";
    totpChip.setAttribute("role", "button");
    totpChip.setAttribute("aria-label", "Fill 2FA code from Keying");
    totpChip.tabIndex = 0;
    totpChip.innerHTML = `
      <span class="__pv-icon" aria-hidden="true">🔑</span>
      <span class="__pv-text">2FA</span>
    `;
    document.body.appendChild(totpChip);
    return totpChip;
  }

  function positionTotpChipNear(input) {
    if (!totpChip || !input) return;
    const rect = input.getBoundingClientRect();
    totpChip.style.top = window.scrollY + rect.top + rect.height / 2 - 14 + "px";
    totpChip.style.left = window.scrollX + rect.right - 38 + "px";
  }

  async function pickEntryIdForTotp() {
    // Prefer the entry that was just used to fill creds on this host
    try {
      const data = await chrome.storage.session.get("lastFill:" + HOST);
      const fill = data["lastFill:" + HOST];
      if (fill && Date.now() - fill.ts < 5 * 60_000) {
        return fill.id;
      }
    } catch {
      /* ignore */
    }
    // Fallback: a single TOTP-enabled entry for this host
    try {
      const res = await chrome.runtime.sendMessage({ type: "query", domain: HOST });
      if (res?.ok && Array.isArray(res.matches)) {
        const withTotp = res.matches.filter((m) => m.hasTotp);
        if (withTotp.length === 1) return withTotp[0].id;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  async function checkTotpFill() {
    const otp = findOtpField();
    if (!otp) {
      if (totpChip) removeTotpChip();
      return;
    }
    // Same field as before, same entry — just reposition
    if (totpChip && currentOtpInput === otp && pendingTotpEntryId) {
      positionTotpChipNear(otp);
      return;
    }
    const entryId = await pickEntryIdForTotp();
    if (!entryId) {
      if (totpChip) removeTotpChip();
      return;
    }
    // Verify entry actually has TOTP (defensive — query says hasTotp but bridge will refuse if not)
    const c = buildTotpChip();
    currentOtpInput = otp;
    pendingTotpEntryId = entryId;
    positionTotpChipNear(otp);
    c.addEventListener("click", async () => {
      const r = await chrome.runtime.sendMessage({ type: "totp", id: entryId });
      if (!r?.ok) {
        if (r?.status === 423) toast("Keying is locked.");
        else if (r?.status === 404) toast("No 2FA code on that entry.");
        else if (r?.status === 403) toast("Autofill is disabled for this entry.");
        else toast("Couldn't fetch 2FA code.");
        return;
      }
      otp.focus();
      dispatchInput(otp, r.code);
      toast("2FA code filled");
      try {
        await chrome.storage.session.remove("lastFill:" + HOST);
      } catch {
        /* ignore */
      }
    });
  }

  // --- Generate-password chip for signup forms ---

  let genChip = null;
  let currentNewPwField = null;

  function findNewPasswordField() {
    // Strongest signal: autocomplete="new-password"
    const byAutocomplete = Array.from(
      document.querySelectorAll('input[type="password"][autocomplete*="new-password" i]')
    ).find((el) => el.offsetParent !== null && !el.disabled && !el.readOnly);
    if (byAutocomplete) return byAutocomplete;

    // Fallback: two visible password fields on the page = likely signup with confirm
    const pwFields = Array.from(document.querySelectorAll("input[type=password]")).filter(
      (el) => el.offsetParent !== null && !el.disabled && !el.readOnly
    );
    if (pwFields.length >= 2) return pwFields[0];

    // Fallback: name/id/aria hints at "new" / "create" / "signup" / "register"
    const SIGNUP_RE = /(new|create|signup|sign-?up|register|choose)/i;
    for (const el of pwFields) {
      const haystack = `${el.name || ""} ${el.id || ""} ${el.getAttribute("aria-label") || ""} ${el.placeholder || ""}`;
      if (SIGNUP_RE.test(haystack)) return el;
    }
    return null;
  }

  function findConfirmPasswordField(primary) {
    const pwFields = Array.from(document.querySelectorAll("input[type=password]")).filter(
      (el) => el !== primary && el.offsetParent !== null && !el.disabled && !el.readOnly
    );
    return pwFields[0] || null;
  }

  function removeGenChip() {
    if (genChip && genChip.parentNode) genChip.parentNode.removeChild(genChip);
    genChip = null;
    currentNewPwField = null;
  }

  function positionGenChipNear(input) {
    if (!genChip || !input) return;
    const rect = input.getBoundingClientRect();
    genChip.style.top = window.scrollY + rect.top + rect.height / 2 - 14 + "px";
    genChip.style.left = window.scrollX + rect.right - 30 + "px";
  }

  async function fillGenerated(field) {
    const res = await chrome.runtime.sendMessage({ type: "generate", length: 24 });
    if (!res?.ok) {
      if (res?.status === 423) toast("Keying is locked.");
      else if (res?.status === 401) toast("Pair this browser with Keying first.");
      else toast("Couldn't generate password.");
      return;
    }
    field.focus();
    dispatchInput(field, res.password);
    const confirm = findConfirmPasswordField(field);
    if (confirm) {
      dispatchInput(confirm, res.password);
    }
    toast("Generated · save the form to add it to Keying");
  }

  function checkGenerate() {
    // Don't show on login forms — only signup-shaped pages
    const field = findNewPasswordField();
    if (!field) {
      if (genChip) removeGenChip();
      return;
    }
    if (genChip && currentNewPwField === field) {
      positionGenChipNear(field);
      return;
    }
    removeGenChip();
    genChip = document.createElement("div");
    genChip.className = "__pv-chip __pv-chip-gen";
    genChip.setAttribute("role", "button");
    genChip.setAttribute("aria-label", "Generate strong password");
    genChip.tabIndex = 0;
    genChip.innerHTML = `
      <span class="__pv-icon" aria-hidden="true">✨</span>
      <span class="__pv-text">Generate</span>
    `;
    document.body.appendChild(genChip);
    currentNewPwField = field;
    positionGenChipNear(field);
    genChip.addEventListener("click", () => fillGenerated(field));
  }

  // Re-check on DOM changes (SPA login flows, modals)
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      check();
      checkTotpFill();
      checkGenerate();
    }, 150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("scroll", () => {
    const pair = findFirstLoginPair();
    if (pair && chip) positionChipNear(pair.user || pair.pw);
    if (totpChip && currentOtpInput) positionTotpChipNear(currentOtpInput);
    if (genChip && currentNewPwField) positionGenChipNear(currentNewPwField);
  }, true);
  window.addEventListener("resize", () => {
    const pair = findFirstLoginPair();
    if (pair && chip) positionChipNear(pair.user || pair.pw);
    if (totpChip && currentOtpInput) positionTotpChipNear(currentOtpInput);
    if (genChip && currentNewPwField) positionGenChipNear(currentNewPwField);
  });

  check();
  checkTotpFill();
  checkGenerate();

  // --- "Save new login" detection ---

  const PENDING_KEY = "pending:" + HOST;
  // 10 minutes — long enough to cover 2FA flows where the user steps away
  // to fetch a code from their phone.
  const PENDING_TTL_MS = 10 * 60_000;

  function findUsernameFieldNear(pwField) {
    if (!pwField) return null;
    return findUsernameField(pwField);
  }

  async function storePending(username, password) {
    if (!password) return;
    try {
      await chrome.storage.session.set({
        [PENDING_KEY]: {
          username: username || "",
          password,
          url: location.origin,
          title: deriveTitle(),
          ts: Date.now(),
        },
      });
    } catch {
      /* storage may be unavailable in some contexts */
    }
  }

  function deriveTitle() {
    const raw = (document.title || "").trim();
    if (raw && raw.length < 80) {
      const cleaned = raw.split(/[-—|·•:]/)[0].trim();
      if (cleaned) return cleaned;
    }
    const host = HOST.split(".");
    if (host.length >= 2) {
      const stem = host[host.length - 2];
      return stem.charAt(0).toUpperCase() + stem.slice(1);
    }
    return HOST;
  }

  function captureFromForm(form) {
    if (!(form instanceof HTMLFormElement)) return;
    const pwField = form.querySelector("input[type=password]");
    if (!(pwField instanceof HTMLInputElement) || !pwField.value) return;
    const user = findUsernameFieldNear(pwField);
    storePending(user?.value || "", pwField.value);
  }

  function captureFromPwField(pwField) {
    if (!(pwField instanceof HTMLInputElement) || !pwField.value) return;
    const user = findUsernameFieldNear(pwField);
    storePending(user?.value || "", pwField.value);
  }

  document.addEventListener(
    "submit",
    (e) => {
      if (e.target instanceof HTMLFormElement) captureFromForm(e.target);
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const btn = target.closest("button, input[type=submit], [role=button]");
      if (!btn) return;
      const form = btn.closest("form");
      if (form) {
        captureFromForm(form);
      } else {
        const pw = document.querySelector("input[type=password]");
        if (pw) captureFromPwField(pw);
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter") return;
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "password") return;
      const form = target.closest("form");
      if (form) captureFromForm(form);
      else captureFromPwField(target);
    },
    true
  );

  async function checkPendingSave() {
    let pending;
    try {
      const data = await chrome.storage.session.get(PENDING_KEY);
      pending = data[PENDING_KEY];
    } catch {
      return;
    }
    if (!pending) return;
    if (Date.now() - pending.ts > PENDING_TTL_MS) {
      await chrome.storage.session.remove(PENDING_KEY);
      return;
    }
    // If there's still a VISIBLE, empty password field on this page, we're
    // likely back on the login form (failed login) or on a 2FA page that
    // re-shows the password field. Don't prompt yet. Hidden password
    // fields (used by sites for cross-page state) don't count.
    const visibleEmptyPw = Array.from(
      document.querySelectorAll("input[type=password]")
    ).some((el) => el.offsetParent !== null && !el.disabled && !el.value);
    if (visibleEmptyPw) return;

    // Skip if the vault already has a matching entry (same username on this host)
    try {
      const res = await chrome.runtime.sendMessage({ type: "query", domain: HOST });
      if (res?.ok && Array.isArray(res.matches)) {
        const exact = res.matches.some(
          (m) => (m.username || "") === (pending.username || "")
        );
        if (exact) {
          await chrome.storage.session.remove(PENDING_KEY);
          return;
        }
      }
    } catch {
      /* ignore — show prompt anyway */
    }

    showSaveBanner(pending);
  }

  function showSaveBanner(pending) {
    if (document.getElementById("__pv-save-banner")) return;
    const banner = document.createElement("div");
    banner.id = "__pv-save-banner";
    banner.className = "__pv-save-banner";

    const icon = document.createElement("div");
    icon.className = "__pv-save-icon";
    icon.textContent = "🔑";

    const textBox = document.createElement("div");
    textBox.className = "__pv-save-text";
    const line1 = document.createElement("div");
    line1.className = "__pv-save-title";
    line1.textContent = "Save this login to Keying?";
    const line2 = document.createElement("div");
    line2.className = "__pv-save-sub";
    line2.textContent = (pending.username || "(no username)") + " · " + HOST;
    textBox.appendChild(line1);
    textBox.appendChild(line2);

    const actions = document.createElement("div");
    actions.className = "__pv-save-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "__pv-save-btn-ghost";
    cancel.textContent = "Not now";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "__pv-save-btn-primary";
    save.textContent = "Save";

    actions.appendChild(cancel);
    actions.appendChild(save);

    banner.appendChild(icon);
    banner.appendChild(textBox);
    banner.appendChild(actions);
    document.body.appendChild(banner);

    function cleanup() {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }

    cancel.addEventListener("click", async () => {
      try {
        await chrome.storage.session.remove(PENDING_KEY);
      } catch {
        /* ignore */
      }
      cleanup();
    });

    save.addEventListener("click", async () => {
      save.disabled = true;
      save.textContent = "Saving…";
      const r = await chrome.runtime.sendMessage({
        type: "save-login",
        payload: {
          title: pending.title || HOST,
          url: pending.url,
          username: pending.username,
          password: pending.password,
        },
      });
      try {
        await chrome.storage.session.remove(PENDING_KEY);
      } catch {
        /* ignore */
      }
      cleanup();
      if (r?.ok) toast("Saved to Keying");
      else if (r?.error === "duplicate") toast("Already in Keying");
      else if (r?.status === 423) toast("Keying is locked — can't save");
      else toast("Couldn't save to Keying");
    });

    setTimeout(() => {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 30_000);
  }

  // Run after a short delay so SPAs have time to render the post-login state.
  setTimeout(checkPendingSave, 800);

  // Re-check on SPA navigations. Facebook, Google, etc. don't trigger a
  // full page load after sign-in / 2FA — they push history state. Listen
  // for that and also re-check on visibility regain (user returned to tab
  // after fetching a 2FA code on their phone).
  let lastUrl = location.href;
  const checkUrlChange = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    setTimeout(checkPendingSave, 800);
  };
  window.addEventListener("popstate", checkUrlChange);
  // pushState / replaceState don't fire events; monkey-patch them.
  const _push = history.pushState;
  history.pushState = function () {
    const r = _push.apply(this, arguments);
    setTimeout(checkUrlChange, 0);
    return r;
  };
  const _replace = history.replaceState;
  history.replaceState = function () {
    const r = _replace.apply(this, arguments);
    setTimeout(checkUrlChange, 0);
    return r;
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      setTimeout(checkPendingSave, 400);
    }
  });
})();
