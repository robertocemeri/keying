import { contextBridge, ipcRenderer, clipboard } from "electron";

const api = {
  vaultExists: () => ipcRenderer.invoke("vault:exists"),
  isUnlocked: () => ipcRenderer.invoke("vault:isUnlocked"),
  setup: (masterPassword: string, enableTouchID: boolean) =>
    ipcRenderer.invoke("vault:setup", masterPassword, enableTouchID),
  unlockWithPassword: (masterPassword: string, enableTouchID: boolean) =>
    ipcRenderer.invoke("vault:unlockPassword", masterPassword, enableTouchID),
  unlockWithTouchID: () => ipcRenderer.invoke("vault:unlockTouchID"),
  lock: () => ipcRenderer.invoke("vault:lock"),
  list: () => ipcRenderer.invoke("vault:list"),
  add: (entry: unknown) => ipcRenderer.invoke("vault:add", entry),
  update: (id: string, patch: unknown) => ipcRenderer.invoke("vault:update", id, patch),
  remove: (id: string) => ipcRenderer.invoke("vault:remove", id),
  listFolders: () => ipcRenderer.invoke("vault:listFolders"),
  addFolder: (name: string) => ipcRenderer.invoke("vault:addFolder", name),
  renameFolder: (oldName: string, newName: string) =>
    ipcRenderer.invoke("vault:renameFolder", oldName, newName),
  deleteFolder: (name: string) => ipcRenderer.invoke("vault:deleteFolder", name),
  reorderFolders: (order: string[]) => ipcRenderer.invoke("vault:reorderFolders", order),
  getFolderSettings: (name: string) =>
    ipcRenderer.invoke("vault:getFolderSettings", name),
  getAllFolderSettings: () => ipcRenderer.invoke("vault:getAllFolderSettings"),
  setFolderSettings: (name: string, patch: Record<string, unknown>) =>
    ipcRenderer.invoke("vault:setFolderSettings", name, patch),
  getGlobalSettings: () => ipcRenderer.invoke("vault:getGlobalSettings"),
  setGlobalSettings: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke("vault:setGlobalSettings", patch),
  onGlobalSettingsChanged: (cb: (g: { autofillDisabled?: boolean }) => void) => {
    const listener = (_e: unknown, g: { autofillDisabled?: boolean }) => cb(g);
    ipcRenderer.on("vault:global-settings-changed", listener);
    return () => ipcRenderer.removeListener("vault:global-settings-changed", listener);
  },
  changeMasterPassword: (current: string, next: string) =>
    ipcRenderer.invoke("vault:changeMaster", current, next),
  hasTouchIDSetup: () => ipcRenderer.invoke("vault:hasTouchIDSetup"),
  disableTouchID: () => ipcRenderer.invoke("vault:disableTouchID"),
  isTouchIDAvailable: () => ipcRenderer.invoke("system:isTouchIDAvailable"),
  generatePassword: (opts: unknown) => ipcRenderer.invoke("system:generatePassword", opts),
  totpCode: (id: string) => ipcRenderer.invoke("vault:totpCode", id),
  normalizeTotp: (raw: string) => ipcRenderer.invoke("system:normalizeTotp", raw),
  parseImport: (text: string) => ipcRenderer.invoke("import:parse", text),
  applyImport: (entries: unknown[], skipDuplicates: boolean) =>
    ipcRenderer.invoke("import:apply", entries, skipDuplicates),
  onImportRequested: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("menu:import", listener);
    return () => ipcRenderer.removeListener("menu:import", listener);
  },
  copyToClipboard: (value: string) => {
    clipboard.writeText(value);
  },
  clearClipboard: () => {
    clipboard.clear();
  },
  onLockEvent: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("vault:auto-locked", listener);
    return () => ipcRenderer.removeListener("vault:auto-locked", listener);
  },
  onPairingPrompt: (cb: (info: { code: string; client: string }) => void) => {
    const listener = (_e: unknown, info: { code: string; client: string }) => cb(info);
    ipcRenderer.on("bridge:pairing-prompt", listener);
    return () => ipcRenderer.removeListener("bridge:pairing-prompt", listener);
  },
  onPairingCompleted: (cb: (info: { client: string }) => void) => {
    const listener = (_e: unknown, info: { client: string }) => cb(info);
    ipcRenderer.on("bridge:pairing-completed", listener);
    return () => ipcRenderer.removeListener("bridge:pairing-completed", listener);
  },
  onPairingCancelled: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("bridge:pairing-cancelled", listener);
    return () => ipcRenderer.removeListener("bridge:pairing-cancelled", listener);
  },
  listPairedClients: () => ipcRenderer.invoke("bridge:listClients"),
  revokeAllPairedClients: () => ipcRenderer.invoke("bridge:revokeAll"),
  cancelPairing: () => ipcRenderer.invoke("bridge:cancelPairing"),
  hideOverlay: () => ipcRenderer.invoke("overlay:hide"),
  showOverlay: () => ipcRenderer.invoke("overlay:show"),
  onOverlayShown: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("overlay:shown", listener);
    return () => ipcRenderer.removeListener("overlay:shown", listener);
  },
};

contextBridge.exposeInMainWorld("vault", api);

export type VaultAPI = typeof api;
