export type Entry = {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  folder: string;
  autofillDisabled?: boolean;
  totpSecret?: string;
  createdAt: number;
  updatedAt: number;
};

export type TotpCode = {
  code: string;
  expiresInMs: number;
  periodMs: number;
};

export type ImportedEntry = {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  folder: string;
  totpSecret?: string;
};

export type FolderSettings = {
  autofillDisabled?: boolean;
};

export type GlobalSettings = {
  autofillDisabled?: boolean;
  autoLockMinutes?: number;
};

export type GeneratorOptions = {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
};

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

export type PairedClient = {
  client: string;
  createdAt: number;
  lastUsed: number;
};

declare global {
  interface Window {
    vault: {
      vaultExists(): Promise<boolean>;
      isUnlocked(): Promise<boolean>;
      setup(
        masterPassword: string,
        enableTouchID: boolean
      ): Promise<{ ok: true; recoveryKey: string }>;
      unlockWithPassword(
        masterPassword: string,
        enableTouchID: boolean
      ): Promise<{ ok: true; recoveryKey: string | null }>;
      unlockWithTouchID(): Promise<{ ok: true }>;
      unlockWithRecoveryKey(
        recoveryKey: string,
        newPassword: string
      ): Promise<{ ok: true }>;
      hasRecoveryKey(): Promise<boolean>;
      rotateRecoveryKey(): Promise<{ recoveryKey: string }>;
      takePendingRecoveryKey(): Promise<string | null>;
      lock(): Promise<{ ok: true }>;
      factoryReset(): Promise<{ ok: true }>;
      list(): Promise<Entry[]>;
      add(entry: Omit<Entry, "id" | "createdAt" | "updatedAt">): Promise<Entry>;
      update(id: string, patch: Partial<Entry>): Promise<Entry>;
      remove(id: string): Promise<{ ok: true }>;
      listFolders(): Promise<string[]>;
      addFolder(name: string): Promise<{ ok: true }>;
      renameFolder(oldName: string, newName: string): Promise<{ ok: true }>;
      deleteFolder(name: string): Promise<{ ok: true }>;
      reorderFolders(order: string[]): Promise<{ ok: true }>;
      getFolderSettings(name: string): Promise<FolderSettings>;
      getAllFolderSettings(): Promise<Record<string, FolderSettings>>;
      setFolderSettings(name: string, patch: Partial<FolderSettings>): Promise<{ ok: true }>;
      getGlobalSettings(): Promise<GlobalSettings>;
      setGlobalSettings(patch: Partial<GlobalSettings>): Promise<{ ok: true }>;
      onGlobalSettingsChanged(cb: (g: GlobalSettings) => void): () => void;
      hideOverlay(): Promise<{ ok: true }>;
      showOverlay(): Promise<{ ok: true }>;
      onOverlayShown(cb: () => void): () => void;
      changeMasterPassword(
        current: string,
        next: string
      ): Promise<{ ok: true; recoveryKey: string | null }>;
      hasTouchIDSetup(): Promise<boolean>;
      disableTouchID(): Promise<{ ok: true }>;
      enableTouchID(): Promise<{ ok: boolean }>;
      isTouchIDAvailable(): Promise<boolean>;
      generatePassword(opts: GeneratorOptions): Promise<string>;
      totpCode(id: string): Promise<TotpCode | null>;
      normalizeTotp(raw: string): Promise<string | null>;
      parseImport(text: string): Promise<{ format: string; entries: ImportedEntry[] }>;
      applyImport(
        entries: ImportedEntry[],
        skipDuplicates: boolean
      ): Promise<{ imported: number; skipped: number }>;
      onImportRequested(cb: () => void): () => void;
      onExportRequested(cb: () => void): () => void;
      onSettingsRequested(cb: () => void): () => void;
      exportCsv(): Promise<{ ok: boolean; count?: number; path?: string }>;
      exportBitwardenJson(): Promise<{ ok: boolean; count?: number; path?: string }>;
      exportEncryptedBackup(): Promise<{ ok: boolean; path?: string; bytes?: number }>;
      restoreEncryptedBackup(): Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
      printRecoveryKey(recoveryKey: string): Promise<{ ok: boolean }>;
      copyToClipboard(value: string): void;
      clearClipboard(): void;
      onLockEvent(cb: () => void): () => void;
      onEntriesChanged(cb: () => void): () => void;
      onPairingPrompt(cb: (info: { code: string; client: string }) => void): () => void;
      onPairingCompleted(cb: (info: { client: string }) => void): () => void;
      onPairingCancelled(cb: () => void): () => void;
      listPairedClients(): Promise<PairedClient[]>;
      revokeAllPairedClients(): Promise<void>;
      cancelPairing(): Promise<void>;
      startPairingFromApp(): Promise<{ code: string; expiresAt: number }>;
      updaterStatus(): Promise<UpdateStatus>;
      updaterCheck(): Promise<UpdateStatus>;
      updaterInstall(): Promise<{ ok: true }>;
      appVersion(): Promise<string>;
      onUpdaterStatus(cb: (status: UpdateStatus) => void): () => void;
    };
  }
}
