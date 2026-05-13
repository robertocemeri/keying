import { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog, nativeImage } from "electron";
import path from "path";
import { promises as fs } from "fs";
import {
  vaultExists,
  createVault,
  unlockWithPassword,
  unlockWithKey,
  unlockWithRecoveryKey,
  hasRecoveryKey,
  rotateRecoveryKey,
  takePendingRecoveryKey,
  lock,
  isUnlocked,
  listEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  changeMasterPassword,
  getCachedKeyB64,
  listFolders,
  addFolder,
  renameFolder,
  deleteFolder,
  reorderFolders,
  getFolderSettings,
  getAllFolderSettings,
  setFolderSettings,
  getGlobalSettings,
  setGlobalSettings,
  bulkAddEntries,
  readEncryptedFileBytes,
  getVaultPath,
  deleteVaultFile,
  Entry,
} from "./vault";
import {
  hasStoredKey,
  storeKey,
  getStoredKey,
  deleteStoredKey,
  isTouchIDAvailable,
  promptTouchID,
} from "./keychain";
import { generatePassword } from "./crypto";
import { totpAt, normalizeTotpInput } from "./totp";
import { detectAndParse, ImportedEntry } from "./import";
import { entriesToCsv, entriesToBitwardenJson } from "./export";
import {
  startBridge,
  stopBridge,
  listPairedClients,
  revokeAllTokens,
  cancelPendingPairing,
} from "./bridge";
import {
  createOverlay,
  showOverlay,
  hideOverlay,
  toggleOverlay,
  destroyOverlay,
  setOverlayDev,
} from "./overlay";
import {
  checkOnStartup,
  checkNow,
  installNow,
  getUpdateStatus,
  getCurrentVersion,
} from "./updater";

const isDev = process.env.NODE_ENV === "development";
const DEFAULT_AUTO_LOCK_MINUTES = 15;

function currentAutoLockMs(): number | null {
  if (!isUnlocked()) return null;
  let configured: number | undefined;
  try {
    configured = getGlobalSettings().autoLockMinutes;
  } catch {
    configured = undefined;
  }
  const minutes = configured === undefined ? DEFAULT_AUTO_LOCK_MINUTES : configured;
  if (minutes <= 0) return null; // "Never"
  return minutes * 60 * 1000;
}

app.setName("Keyring");

let mainWindow: BrowserWindow | null = null;
let autoLockTimer: NodeJS.Timeout | null = null;

function broadcast(channel: string, ...args: unknown[]) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args);
  }
}

export function broadcastGlobalSettings() {
  broadcast("vault:global-settings-changed", getGlobalSettings());
}

function resetAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
  const ms = currentAutoLockMs();
  if (ms === null) return;
  autoLockTimer = setTimeout(() => {
    if (isUnlocked()) {
      lock();
      broadcast("vault:auto-locked");
      hideOverlay();
    }
  }, ms);
}

function clearAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 920,
    minHeight: 560,
    backgroundColor: "#0a0a0c",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 18 },
    title: "Keyring",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    lock();
    clearAutoLockTimer();
  });
}

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    const iconPath = path.join(__dirname, "..", "build", "icon-1024.png");
    const dockImg = nativeImage.createFromPath(iconPath);
    if (dockImg.isEmpty()) {
      // eslint-disable-next-line no-console
      console.warn("[dock-icon] failed to load image at", iconPath);
    } else {
      const applyDockIcon = () => {
        if (app.dock) app.dock.setIcon(dockImg);
      };
      applyDockIcon();
      // In dev mode the bundle identity is Electron.app, and macOS resyncs
      // the Dock representation to the bundle's icon at unpredictable
      // moments (Touch ID dialog dismissal, Dock badge refresh, system
      // events). Lifecycle listeners don't catch all of them. Reapply on a
      // short interval — wasteful but the only reliable approach. In a
      // packaged build the bundle is Keyring.app, so this isn't needed.
      if (isDev) {
        setInterval(applyDockIcon, 1000);
      }
    }
  }

  setOverlayDev(isDev);
  createOverlay();

  const registered = globalShortcut.register("Alt+CommandOrControl+K", () => {
    toggleOverlay();
  });
  if (!registered) {
    // eslint-disable-next-line no-console
    console.warn("Could not register global shortcut Alt+CommandOrControl+K");
  }

  try {
    await startBridge();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Failed to start bridge", e);
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Settings…",
            accelerator: "CmdOrCtrl+,",
            click: () => {
              if (!isUnlocked()) return;
              mainWindow?.focus();
              mainWindow?.webContents.send("menu:settings");
            },
          },
          {
            label: "Check for Updates…",
            click: () => {
              void checkNow();
            },
          },
          { type: "separator" },
          {
            label: "Import…",
            accelerator: "CmdOrCtrl+I",
            click: () => {
              if (!isUnlocked()) return;
              mainWindow?.focus();
              mainWindow?.webContents.send("menu:import");
            },
          },
          {
            label: "Export…",
            accelerator: "CmdOrCtrl+E",
            click: () => {
              if (!isUnlocked()) return;
              mainWindow?.focus();
              mainWindow?.webContents.send("menu:export");
            },
          },
          { type: "separator" },
          {
            label: "Lock Vault",
            accelerator: "CmdOrCtrl+L",
            click: () => {
              if (isUnlocked()) {
                lock();
                broadcast("vault:auto-locked");
                hideOverlay();
              }
            },
          },
          { type: "separator" },
          { role: "hide" },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "windowMenu" },
    ])
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  void checkOnStartup();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  globalShortcut.unregisterAll();
  destroyOverlay();
  try {
    await stopBridge();
  } catch {
    /* ignore */
  }
});

app.on("browser-window-blur", () => {
  // Optional: tighter security would lock on blur. Skipping for usability.
});

ipcMain.handle("vault:exists", () => vaultExists());
ipcMain.handle("vault:isUnlocked", () => isUnlocked());

ipcMain.handle(
  "vault:setup",
  async (_e, masterPassword: string, enableTouchID: boolean) => {
    if (!masterPassword || masterPassword.length < 8) {
      throw new Error("Master password must be at least 8 characters");
    }
    const { recoveryKey } = await createVault(masterPassword);
    if (enableTouchID && isTouchIDAvailable()) {
      const ok = await promptTouchID("save the encryption key for quick unlock");
      if (ok) {
        const keyB64 = getCachedKeyB64();
        if (keyB64) await storeKey(keyB64);
      }
    }
    resetAutoLockTimer();
    return { ok: true, recoveryKey };
  }
);

ipcMain.handle(
  "vault:unlockPassword",
  async (_e, masterPassword: string, enableTouchID: boolean) => {
    await unlockWithPassword(masterPassword);
    const recoveryKey = takePendingRecoveryKey();
    if (enableTouchID && isTouchIDAvailable()) {
      const ok = await promptTouchID("save the encryption key for quick unlock");
      if (ok) {
        const keyB64 = getCachedKeyB64();
        if (keyB64) await storeKey(keyB64);
      }
    } else if (recoveryKey && (await hasStoredKey())) {
      // V1→V2 migration just minted a new DEK. The Touch ID keychain still
      // holds the old v1 key, which won't decrypt the new v2 file. Refresh
      // the stored key silently so the next Touch ID unlock keeps working.
      const keyB64 = getCachedKeyB64();
      if (keyB64) await storeKey(keyB64);
    }
    resetAutoLockTimer();
    return { ok: true, recoveryKey };
  }
);

ipcMain.handle("vault:unlockTouchID", async () => {
  if (!isTouchIDAvailable()) throw new Error("Touch ID is not available");
  if (!(await hasStoredKey())) throw new Error("No saved key for Touch ID");
  const ok = await promptTouchID("unlock your Keyring");
  if (!ok) throw new Error("Touch ID was cancelled");
  const keyB64 = await getStoredKey();
  if (!keyB64) throw new Error("No saved key for Touch ID");
  await unlockWithKey(keyB64);
  resetAutoLockTimer();
  return { ok: true };
});

ipcMain.handle(
  "vault:unlockRecovery",
  async (_e, recoveryKey: string, newPassword: string) => {
    await unlockWithRecoveryKey(recoveryKey, newPassword);
    // Wipe any Touch ID key — old DEK is unchanged but the user is going
    // through recovery, so they should re-enable from a known good state.
    if (await hasStoredKey()) await deleteStoredKey();
    resetAutoLockTimer();
    return { ok: true };
  }
);

ipcMain.handle("vault:hasRecoveryKey", () => hasRecoveryKey());

ipcMain.handle("vault:rotateRecoveryKey", async () => {
  resetAutoLockTimer();
  return await rotateRecoveryKey();
});

ipcMain.handle("vault:takePendingRecoveryKey", () => takePendingRecoveryKey());

ipcMain.handle("vault:lock", () => {
  lock();
  clearAutoLockTimer();
  return { ok: true };
});

ipcMain.handle("vault:factoryReset", async () => {
  clearAutoLockTimer();
  hideOverlay();
  // Revoke paired browser tokens. Best-effort — don't block the wipe if it fails.
  try {
    await revokeAllTokens();
  } catch {
    /* ignore */
  }
  // Remove Touch ID keychain entry. Best-effort.
  try {
    await deleteStoredKey();
  } catch {
    /* ignore */
  }
  await deleteVaultFile();
  broadcast("vault:auto-locked");
  return { ok: true };
});

ipcMain.handle("vault:list", () => {
  resetAutoLockTimer();
  return listEntries();
});

ipcMain.handle("vault:add", async (_e, entry: Omit<Entry, "id" | "createdAt" | "updatedAt">) => {
  resetAutoLockTimer();
  return await addEntry(entry);
});

ipcMain.handle("vault:update", async (_e, id: string, patch: Partial<Entry>) => {
  resetAutoLockTimer();
  return await updateEntry(id, patch);
});

ipcMain.handle("vault:remove", async (_e, id: string) => {
  resetAutoLockTimer();
  await deleteEntry(id);
  return { ok: true };
});

ipcMain.handle(
  "vault:changeMaster",
  async (_e, current: string, next: string) => {
    if (!next || next.length < 8) throw new Error("New password must be at least 8 characters");
    await changeMasterPassword(current, next);
    // Invalidate any stored Touch ID key — user must re-enable.
    if (await hasStoredKey()) await deleteStoredKey();
    resetAutoLockTimer();
    const recoveryKey = takePendingRecoveryKey();
    return { ok: true, recoveryKey };
  }
);

ipcMain.handle("vault:hasTouchIDSetup", () => hasStoredKey());

ipcMain.handle("vault:disableTouchID", async () => {
  if (await hasStoredKey()) await deleteStoredKey();
  return { ok: true };
});

ipcMain.handle("vault:enableTouchID", async () => {
  if (!isTouchIDAvailable()) throw new Error("Touch ID is not available");
  if (!isUnlocked()) throw new Error("Vault must be unlocked");
  const ok = await promptTouchID("save the encryption key for quick unlock");
  if (!ok) return { ok: false };
  const keyB64 = getCachedKeyB64();
  if (keyB64) await storeKey(keyB64);
  return { ok: true };
});

ipcMain.handle("system:isTouchIDAvailable", () => isTouchIDAvailable());

ipcMain.handle(
  "system:generatePassword",
  (_e, opts: { length: number; uppercase: boolean; lowercase: boolean; digits: boolean; symbols: boolean }) => {
    return generatePassword(opts);
  }
);

ipcMain.handle("vault:totpCode", (_e, id: string) => {
  resetAutoLockTimer();
  const entry = listEntries().find((x) => x.id === id);
  if (!entry || !entry.totpSecret) return null;
  try {
    const { code, expiresInMs, periodMs } = totpAt(entry.totpSecret);
    return { code, expiresInMs, periodMs };
  } catch {
    return null;
  }
});

ipcMain.handle("system:normalizeTotp", (_e, raw: string) => {
  return normalizeTotpInput(raw);
});

ipcMain.handle("import:parse", (_e, text: string) => {
  return detectAndParse(text);
});

ipcMain.handle(
  "import:apply",
  async (_e, entries: ImportedEntry[], skipDuplicates: boolean) => {
    resetAutoLockTimer();
    const inputs = entries.map((e) => ({
      title: e.title,
      username: e.username,
      password: e.password,
      url: e.url,
      notes: e.notes,
      folder: e.folder,
      totpSecret: e.totpSecret,
    }));
    return await bulkAddEntries(inputs, { skipDuplicates });
  }
);

ipcMain.handle("vault:exportCsv", async () => {
  if (!isUnlocked()) throw new Error("Vault must be unlocked");
  resetAutoLockTimer();
  const entries = listEntries();
  const csv = entriesToCsv(entries);
  const stamp = new Date().toISOString().slice(0, 10);
  const res = await dialog.showSaveDialog({
    title: "Export vault to CSV",
    defaultPath: `keyring-export-${stamp}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  await fs.writeFile(res.filePath, csv, { mode: 0o600 });
  return { ok: true, count: entries.length, path: res.filePath };
});

ipcMain.handle("vault:exportBitwardenJson", async () => {
  if (!isUnlocked()) throw new Error("Vault must be unlocked");
  resetAutoLockTimer();
  const entries = listEntries();
  const json = entriesToBitwardenJson(entries);
  const stamp = new Date().toISOString().slice(0, 10);
  const res = await dialog.showSaveDialog({
    title: "Export vault to Bitwarden JSON",
    defaultPath: `keyring-export-${stamp}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  await fs.writeFile(res.filePath, json, { mode: 0o600 });
  return { ok: true, count: entries.length, path: res.filePath };
});

ipcMain.handle("vault:exportBackup", async () => {
  resetAutoLockTimer();
  const stamp = new Date().toISOString().slice(0, 10);
  const res = await dialog.showSaveDialog({
    title: "Save encrypted backup",
    defaultPath: `keyring-backup-${stamp}.enc`,
    filters: [{ name: "Encrypted backup", extensions: ["enc"] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  const bytes = await readEncryptedFileBytes();
  await fs.writeFile(res.filePath, bytes, { mode: 0o600 });
  return { ok: true, path: res.filePath, bytes: bytes.length };
});

ipcMain.handle("system:printRecoveryKey", async (_e, recoveryKey: string) => {
  const printWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 1000,
    webPreferences: {
      offscreen: false,
    },
  });

  const html = renderRecoveryKeyHtml(recoveryKey);
  await printWindow.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(html)
  );

  return new Promise<{ ok: boolean }>((resolve) => {
    printWindow.webContents.print(
      { silent: false, printBackground: true },
      (success) => {
        printWindow.destroy();
        resolve({ ok: success });
      }
    );
  });
});

function renderRecoveryKeyHtml(recoveryKey: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const vaultLoc = getVaultPath();
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Keyring Recovery Key</title>
<style>
  @page { size: letter; margin: 0.75in; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    color: #111; background: #fff; margin: 0; padding: 0; line-height: 1.5;
  }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 22px; }
  .key {
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 22px;
    letter-spacing: 0.08em;
    background: #f5f5f7; border: 1px solid #d2d2d7; border-radius: 8px;
    padding: 18px 22px; margin: 18px 0;
    word-break: break-all;
  }
  p { font-size: 13px; }
  .warn { background: #fff5dc; border: 1px solid #f0d97a; border-radius: 8px; padding: 12px 14px; font-size: 12px; }
  .small { font-size: 11px; color: #666; }
  hr { border: none; border-top: 1px solid #e3e3e7; margin: 22px 0; }
</style></head>
<body>
  <h1>Keyring — Recovery Key</h1>
  <div class="meta">Generated ${stamp} · vault stored at <code>${vaultLoc}</code></div>

  <p>If you forget your master password, this is the only way back into your vault. Keep it somewhere safe — a fireproof box, a safe deposit box, or with a trusted person.</p>

  <div class="key">${recoveryKey}</div>

  <div class="warn">
    <strong>Anyone with this key can reset your vault password and read your data.</strong> Treat it like cash. Don't email it, don't take a photo with cloud sync, don't store it in another password manager you have access to from this machine.
  </div>

  <hr/>

  <p class="small">To use this key: open Keyring → on the unlock screen tap "Forgot password? Use recovery key" → paste this key → choose a new master password.</p>
  <p class="small">Keyring will never ask for this key over email or chat. There is no Keyring support that can help you recover your data — losing both the master password and this key means the data is unrecoverable.</p>
</body></html>`;
}

ipcMain.handle("overlay:hide", () => {
  hideOverlay();
  return { ok: true };
});
ipcMain.handle("overlay:show", () => {
  showOverlay();
  return { ok: true };
});

ipcMain.handle("bridge:listClients", () => listPairedClients());
ipcMain.handle("bridge:revokeAll", () => revokeAllTokens());
ipcMain.handle("bridge:cancelPairing", () => cancelPendingPairing());

ipcMain.handle("vault:listFolders", () => {
  resetAutoLockTimer();
  return listFolders();
});
ipcMain.handle("vault:addFolder", async (_e, name: string) => {
  resetAutoLockTimer();
  await addFolder(name);
  return { ok: true };
});
ipcMain.handle("vault:renameFolder", async (_e, oldName: string, newName: string) => {
  resetAutoLockTimer();
  await renameFolder(oldName, newName);
  return { ok: true };
});
ipcMain.handle("vault:deleteFolder", async (_e, name: string) => {
  resetAutoLockTimer();
  await deleteFolder(name);
  return { ok: true };
});
ipcMain.handle("vault:reorderFolders", async (_e, order: string[]) => {
  resetAutoLockTimer();
  await reorderFolders(order);
  return { ok: true };
});
ipcMain.handle("vault:getFolderSettings", (_e, name: string) => {
  resetAutoLockTimer();
  return getFolderSettings(name);
});
ipcMain.handle("vault:getAllFolderSettings", () => {
  resetAutoLockTimer();
  return getAllFolderSettings();
});
ipcMain.handle("vault:setFolderSettings", async (_e, name: string, patch: Record<string, unknown>) => {
  resetAutoLockTimer();
  await setFolderSettings(name, patch);
  return { ok: true };
});
ipcMain.handle("vault:getGlobalSettings", () => {
  resetAutoLockTimer();
  return getGlobalSettings();
});
ipcMain.handle("vault:setGlobalSettings", async (_e, patch: Record<string, unknown>) => {
  resetAutoLockTimer();
  await setGlobalSettings(patch);
  broadcastGlobalSettings();
  return { ok: true };
});

ipcMain.handle("updater:status", () => getUpdateStatus());
ipcMain.handle("updater:check", async () => await checkNow());
ipcMain.handle("updater:install", async () => {
  await installNow();
  return { ok: true };
});
ipcMain.handle("app:version", () => getCurrentVersion());
