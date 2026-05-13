import { autoUpdater } from "electron-updater";
import { BrowserWindow, dialog, app } from "electron";

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
  | { state: "error"; message: string };

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
