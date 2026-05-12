import { app, BrowserWindow, ipcMain, Menu, globalShortcut } from "electron";
import path from "path";
import {
  vaultExists,
  createVault,
  unlockWithPassword,
  unlockWithKey,
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

const isDev = process.env.NODE_ENV === "development";
const AUTO_LOCK_MS = 5 * 60 * 1000;

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
  if (autoLockTimer) clearTimeout(autoLockTimer);
  autoLockTimer = setTimeout(() => {
    if (isUnlocked()) {
      lock();
      broadcast("vault:auto-locked");
      hideOverlay();
    }
  }, AUTO_LOCK_MS);
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
  // Set dock icon in dev mode (in production, electron-builder bakes it in).
  if (process.platform === "darwin" && app.dock) {
    try {
      const iconPath = path.join(__dirname, "..", "build", "icon-512.png");
      app.dock.setIcon(iconPath);
    } catch {
      /* ignore — icon is optional in dev */
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
            label: "Import…",
            accelerator: "CmdOrCtrl+I",
            click: () => {
              if (!isUnlocked()) return;
              mainWindow?.focus();
              mainWindow?.webContents.send("menu:import");
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
    await createVault(masterPassword);
    if (enableTouchID && isTouchIDAvailable()) {
      const ok = await promptTouchID("save the encryption key for quick unlock");
      if (ok) {
        const keyB64 = getCachedKeyB64();
        if (keyB64) await storeKey(keyB64);
      }
    }
    resetAutoLockTimer();
    return { ok: true };
  }
);

ipcMain.handle(
  "vault:unlockPassword",
  async (_e, masterPassword: string, enableTouchID: boolean) => {
    await unlockWithPassword(masterPassword);
    if (enableTouchID && isTouchIDAvailable()) {
      const ok = await promptTouchID("save the encryption key for quick unlock");
      if (ok) {
        const keyB64 = getCachedKeyB64();
        if (keyB64) await storeKey(keyB64);
      }
    }
    resetAutoLockTimer();
    return { ok: true };
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

ipcMain.handle("vault:lock", () => {
  lock();
  clearAutoLockTimer();
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
    return { ok: true };
  }
);

ipcMain.handle("vault:hasTouchIDSetup", () => hasStoredKey());

ipcMain.handle("vault:disableTouchID", async () => {
  if (await hasStoredKey()) await deleteStoredKey();
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

