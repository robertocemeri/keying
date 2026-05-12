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
};

export type GeneratorOptions = {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
};

declare global {
  interface Window {
    vault: {
      vaultExists(): Promise<boolean>;
      isUnlocked(): Promise<boolean>;
      setup(masterPassword: string, enableTouchID: boolean): Promise<{ ok: true }>;
      unlockWithPassword(masterPassword: string, enableTouchID: boolean): Promise<{ ok: true }>;
      unlockWithTouchID(): Promise<{ ok: true }>;
      lock(): Promise<{ ok: true }>;
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
      changeMasterPassword(current: string, next: string): Promise<{ ok: true }>;
      hasTouchIDSetup(): Promise<boolean>;
      disableTouchID(): Promise<{ ok: true }>;
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
      copyToClipboard(value: string): void;
      clearClipboard(): void;
      onLockEvent(cb: () => void): () => void;
      onPairingPrompt(cb: (info: { code: string; client: string }) => void): () => void;
      onPairingCompleted(cb: (info: { client: string }) => void): () => void;
      onPairingCancelled(cb: () => void): () => void;
      listPairedClients(): Promise<{ client: string; createdAt: number; lastUsed: number }[]>;
      revokeAllPairedClients(): Promise<void>;
      cancelPairing(): Promise<void>;
    };
  }
}
