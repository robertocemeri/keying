import { autoUpdater } from "electron-updater";
import { BrowserWindow, dialog, app } from "electron";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);
let initialized = false;

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string }
  // Auto-updates can't reliably apply because macOS is running the app from a
  // translocated read-only copy (Gatekeeper Path Randomization). The .app on
  // disk is never written to, so the relaunched app stays on the old version.
  // appPath/canFix tell the renderer whether we can repair it automatically.
  | { state: "blocked"; reason: "translocated" | "quarantined"; appPath: string; canFix: boolean };

let lastStatus: UpdateStatus = { state: "idle" };

function setStatus(next: UpdateStatus): void {
  lastStatus = next;
  broadcast("updater:status", next);
}

export function getUpdateStatus(): UpdateStatus {
  return lastStatus;
}

export function getCurrentVersion(): string {
  return app.getVersion();
}

// Walks up from the running executable to the enclosing .app bundle (or "" in
// dev where the binary is an Electron helper, not a packaged app).
function runningAppBundlePath(): string {
  if (process.platform !== "darwin") return "";
  let p = process.execPath;
  // .app/Contents/MacOS/<binary>  → walk up three dirs
  for (let i = 0; i < 4; i++) {
    if (p.endsWith(".app")) return p;
    p = path.dirname(p);
  }
  return "";
}

function isTranslocated(): boolean {
  if (process.platform !== "darwin") return false;
  // macOS App Translocation paths look like:
  //   /private/var/folders/.../AppTranslocation/<UUID>/d/Keying.app/...
  return /\/AppTranslocation\//.test(process.execPath);
}

async function hasQuarantineFlag(appPath: string): Promise<boolean> {
  if (!appPath) return false;
  try {
    const { stdout } = await execAsync(`/usr/bin/xattr ${JSON.stringify(appPath)}`);
    return stdout.split("\n").some((line) => line.trim() === "com.apple.quarantine");
  } catch {
    return false;
  }
}

type BlockedStatus = Extract<UpdateStatus, { state: "blocked" }>;

// Detects whether the auto-updater can actually replace this bundle on quit.
// Sets `lastStatus` to "blocked" if not. Idempotent — safe to call repeatedly.
async function detectUpdateBlocker(): Promise<BlockedStatus | null> {
  if (process.platform !== "darwin") return null;
  if (process.env.NODE_ENV === "development") return null;

  const translocated = isTranslocated();
  // When translocated, process.execPath is the random read-only copy; the
  // canonical install is usually /Applications/Keying.app.
  const candidatePath = translocated
    ? "/Applications/Keying.app"
    : runningAppBundlePath();

  if (translocated) {
    return {
      state: "blocked",
      reason: "translocated",
      appPath: candidatePath,
      canFix: true,
    };
  }

  const quarantined = await hasQuarantineFlag(candidatePath);
  if (quarantined) {
    return {
      state: "blocked",
      reason: "quarantined",
      appPath: candidatePath,
      canFix: true,
    };
  }
  return null;
}

// Called as the VERY FIRST thing in app.whenReady() — before createOverlay /
// createWindow / pinRegularActivationPolicy / anything else that would put a
// Dock icon on screen at the translocated path. If the app is running from a
// translocated location, we clear quarantine on /Applications/Keying.app and
// auto-relaunch from there, then quit this process. Returns true if the caller
// should bail out (because we're about to quit and respawn).
//
// For the non-translocated-but-quarantined case (rarer: the bundle has the
// quarantine flag but macOS hasn't translocated it for this run), we just
// clear the flag silently. No UI, no relaunch needed — the running session is
// fine; future launches just won't get translocated.
export async function handleTranslocationEarly(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  if (process.env.NODE_ENV === "development") return false;

  const translocated = isTranslocated();

  // Always try to clean up the canonical bundle's quarantine flag, whether or
  // not we're translocated right now. Best-effort; no UI on failure.
  const canonical = "/Applications/Keying.app";
  if (await hasQuarantineFlag(canonical)) {
    try {
      await execAsync(`/usr/bin/xattr -dr com.apple.quarantine ${JSON.stringify(canonical)}`);
    } catch {
      /* ignore — we'll surface this in Settings if it persists */
    }
  }

  if (!translocated) return false;

  // We're running from /private/var/folders/.../AppTranslocation/... — the
  // user can't auto-update from here and every launch spawns a new Dock icon.
  // Quarantine is now cleared on the canonical bundle, so the next launch
  // from /Applications won't be translocated. Tell the user, then relaunch.
  const choice = await dialog.showMessageBox({
    type: "warning",
    message: "Keying needs to finish setup",
    detail:
      "macOS is running Keying from a temporary copy, which prevents auto-updates and creates duplicate Dock icons. " +
      "Click OK to finish setup — Keying will close and reopen automatically from /Applications.",
    buttons: ["OK", "Skip"],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice.response !== 0) return false;

  // Spawn `open -n -a /Applications/Keying.app` detached so it survives this
  // process quitting. `-n` forces a new instance; without it, macOS may
  // foreground the current (translocated) process instead.
  try {
    const child = spawn("/usr/bin/open", ["-n", "-a", canonical], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (e) {
    await dialog.showMessageBox({
      type: "error",
      message: "Couldn't relaunch Keying",
      detail:
        (e instanceof Error ? e.message : String(e)) +
        "\n\nPlease quit Keying manually and reopen it from /Applications.",
      buttons: ["OK"],
    });
    return false;
  }
  app.quit();
  return true;
}

// Removes com.apple.quarantine recursively from the installed .app bundle.
// We don't need root — the user owns the app, since they installed it.
export async function repairUpdateBlocker(): Promise<{ ok: boolean; message?: string }> {
  if (process.platform !== "darwin") return { ok: false, message: "only-mac" };
  const target = isTranslocated() ? "/Applications/Keying.app" : runningAppBundlePath();
  if (!target) return { ok: false, message: "could-not-resolve-app-path" };
  try {
    await execAsync(`/usr/bin/xattr -dr com.apple.quarantine ${JSON.stringify(target)}`);
    // Re-detect — if we're translocated, the user still needs to relaunch from
    // the canonical path, but clearing quarantine means the next launch won't
    // re-translocate.
    const blocker = await detectUpdateBlocker();
    if (blocker) {
      lastStatus = blocker;
      broadcast("updater:status", blocker);
    } else {
      lastStatus = { state: "idle" };
      broadcast("updater:status", lastStatus);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

function initOnce(): void {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => setStatus({ state: "checking" }));
  autoUpdater.on("update-available", (info) =>
    setStatus({ state: "available", version: info.version })
  );
  autoUpdater.on("update-not-available", (info) =>
    setStatus({ state: "not-available", version: info.version })
  );
  autoUpdater.on("download-progress", (p) =>
    setStatus({ state: "downloading", percent: Math.round(p.percent) })
  );
  autoUpdater.on("update-downloaded", (info) =>
    setStatus({ state: "ready", version: info.version })
  );
  autoUpdater.on("error", (err) =>
    setStatus({
      state: "error",
      message: err instanceof Error ? err.message : String(err),
    })
  );
}

export async function checkOnStartup(): Promise<void> {
  if (process.env.NODE_ENV === "development") return;
  if (process.platform !== "darwin") return; // only mac is signed for now
  initOnce();
  const blocker = await detectUpdateBlocker();
  if (blocker) {
    setStatus(blocker);
    return;
  }
  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (e) {
    // Likely no `app-update.yml` in dev, or no network. Don't spam the UI.
    // eslint-disable-next-line no-console
    console.warn("Auto-update check failed:", e);
  }
}

export async function checkNow(): Promise<UpdateStatus> {
  initOnce();
  const blocker = await detectUpdateBlocker();
  if (blocker) {
    setStatus(blocker);
    return lastStatus;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setStatus({ state: "error", message });
  }
  return lastStatus;
}

export async function installNow(): Promise<void> {
  initOnce();
  // Don't bother showing "no update is ready" — the user only sees the install
  // button when state === "ready" — but stay defensive.
  const blocker = await detectUpdateBlocker();
  if (blocker) {
    setStatus(blocker);
    await dialog.showMessageBox({
      type: "warning",
      message: "Auto-update can't be applied right now.",
      detail:
        blocker.reason === "translocated"
          ? "macOS is running Keying from a temporary read-only copy. Quit Keying, drag /Applications/Keying.app to the Trash, and reinstall from the latest DMG."
          : "Keying's .app bundle is still quarantined by macOS. Use the 'Repair auto-update' button in Settings to clear it, then check for updates again.",
      buttons: ["OK"],
    });
    return;
  }
  if (lastStatus.state !== "ready") {
    const res = await dialog.showMessageBox({
      type: "info",
      message: "No update is ready to install.",
      detail: "Use 'Check for updates' to look for a new version.",
      buttons: ["OK"],
    });
    void res;
    return;
  }
  autoUpdater.quitAndInstall();
}
