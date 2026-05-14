import { useEffect, useMemo, useState } from "react";
import type { Entry, FolderSettings } from "../types";
import EntryDetail from "./EntryDetail";
import EntryForm from "./EntryForm";
import FolderSidebar from "./FolderSidebar";

const ALL = "__all__";
const UNFILED = "__unfiled__";

export default function VaultScreen({
  onLocked,
  onOpenSettings,
}: {
  onLocked: () => void;
  onOpenSettings: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [folderSettingsMap, setFolderSettingsMap] = useState<Record<string, FolderSettings>>({});
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "new">("view");
  const [loading, setLoading] = useState(true);
  const [autofillPaused, setAutofillPaused] = useState(false);

  async function reload(keepSelected?: string | null) {
    setLoading(true);
    const [list, folderList, global, fsMap] = await Promise.all([
      window.vault.list(),
      window.vault.listFolders(),
      window.vault.getGlobalSettings(),
      window.vault.getAllFolderSettings(),
    ]);
    setEntries(list);
    setFolders(folderList);
    setFolderSettingsMap(fsMap);
    setAutofillPaused(!!global.autofillDisabled);
    if (keepSelected !== undefined) setSelectedId(keepSelected);
    else if (list.length && !selectedId) setSelectedId(list[0].id);
    setLoading(false);
  }

  async function refreshFolderSettings() {
    const fsMap = await window.vault.getAllFolderSettings();
    setFolderSettingsMap(fsMap);
  }

  async function toggleAutofillPaused() {
    const next = !autofillPaused;
    setAutofillPaused(next);
    await window.vault.setGlobalSettings({ autofillDisabled: next || undefined });
  }

  useEffect(() => {
    reload();
    const off = window.vault.onGlobalSettingsChanged((g) => {
      setAutofillPaused(!!g.autofillDisabled);
    });
    // Bridge-side mutations (extension Save Login banner, future bridge edits)
    // don't go through this renderer, so the only signal we get is this event.
    const offEntries = window.vault.onEntriesChanged(() => {
      reload(selectedId ?? null);
    });
    const onImport = () => reload();
    window.addEventListener("keying:import-complete", onImport);
    return () => {
      off();
      offEntries();
      window.removeEventListener("keying:import-complete", onImport);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = entries;
    if (selectedFolder === UNFILED) list = list.filter((e) => !e.folder);
    else if (selectedFolder !== ALL) list = list.filter((e) => e.folder === selectedFolder);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.username.toLowerCase().includes(q) ||
          e.url.toLowerCase().includes(q)
      );
    }
    return list;
  }, [entries, search, selectedFolder]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { [ALL]: entries.length, [UNFILED]: 0 };
    for (const e of entries) {
      if (!e.folder) map[UNFILED]++;
      else map[e.folder] = (map[e.folder] ?? 0) + 1;
    }
    return map;
  }, [entries]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  async function handleLock() {
    await window.vault.lock();
    onLocked();
  }

  async function createFolder() {
    const name = window.prompt("New folder name:");
    if (!name?.trim()) return;
    await window.vault.addFolder(name.trim());
    await reload();
    setSelectedFolder(name.trim());
  }

  async function renameSelectedFolder() {
    if (selectedFolder === ALL || selectedFolder === UNFILED) return;
    const next = window.prompt("Rename folder:", selectedFolder);
    if (!next?.trim() || next.trim() === selectedFolder) return;
    await window.vault.renameFolder(selectedFolder, next.trim());
    setSelectedFolder(next.trim());
    await reload(selectedId);
  }

  async function deleteSelectedFolder() {
    if (selectedFolder === ALL || selectedFolder === UNFILED) return;
    if (!window.confirm(`Delete folder "${selectedFolder}"? Entries inside will become Unfiled.`)) return;
    await window.vault.deleteFolder(selectedFolder);
    setSelectedFolder(ALL);
    await reload(selectedId);
  }

  return (
    <div className="h-full grid grid-cols-[200px_320px_1fr] bg-ink-950">
      <FolderSidebar
        folders={folders}
        counts={counts}
        folderSettings={folderSettingsMap}
        selected={selectedFolder}
        onSelect={setSelectedFolder}
        onCreate={createFolder}
        onRename={renameSelectedFolder}
        onDelete={deleteSelectedFolder}
        onReorder={async (next) => {
          setFolders(next);
          await window.vault.reorderFolders(next);
        }}
        onSettingsChanged={refreshFolderSettings}
        unfiledKey={UNFILED}
        allKey={ALL}
      />

      <aside className="border-r border-ink-800/60 flex flex-col min-h-0">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wider uppercase text-ink-300 truncate">
              {selectedFolder === ALL
                ? "All items"
                : selectedFolder === UNFILED
                ? "Unfiled"
                : selectedFolder}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleAutofillPaused}
                title={autofillPaused ? "Autofill paused — click to resume" : "Pause browser autofill"}
                className={[
                  "no-drag text-[10px] uppercase tracking-wider px-2 py-0.5 rounded transition",
                  autofillPaused
                    ? "bg-amber-950/40 text-amber-300 border border-amber-900/60"
                    : "bg-ink-900 text-ink-400 border border-ink-800 hover:text-ink-200",
                ].join(" ")}
              >
                {autofillPaused ? "Autofill off" : "Autofill on"}
              </button>
              <button
                onClick={() => reload(selectedId ?? null)}
                title="Refresh entries"
                aria-label="Refresh"
                disabled={loading}
                className="no-drag text-ink-400 hover:text-ink-100 transition disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={loading ? "animate-spin" : ""}>
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
              <button
                onClick={onOpenSettings}
                title="Settings (⌘,)"
                aria-label="Settings"
                className="no-drag text-ink-400 hover:text-ink-100 transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <button
                onClick={handleLock}
                title="Lock vault (⌘L)"
                className="no-drag text-xs text-ink-400 hover:text-ink-100 transition"
              >
                Lock
              </button>
            </div>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="no-drag w-full bg-ink-900 border border-ink-800 focus:border-ink-600 outline-none rounded-md px-3 py-2 text-sm placeholder:text-ink-500"
          />
          <button
            onClick={() => {
              setSelectedId(null);
              setMode("new");
            }}
            className="no-drag w-full bg-accent-500 hover:bg-accent-400 text-ink-950 font-medium rounded-md py-2 text-sm transition"
          >
            + New entry
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="px-3 py-2 text-sm text-ink-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-ink-500">
              {entries.length === 0 ? "No entries yet." : "No matches."}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => {
                      setSelectedId(e.id);
                      setMode("view");
                    }}
                    className={[
                      "no-drag w-full text-left px-3 py-2.5 rounded-md transition group",
                      selectedId === e.id && mode !== "new"
                        ? "bg-ink-800"
                        : "hover:bg-ink-900",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar text={e.title} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink-100">
                          {e.title || "(untitled)"}
                        </div>
                        <div className="truncate text-xs text-ink-400">
                          {e.username || (e.url ? safeHostname(e.url) : "—")}
                        </div>
                      </div>
                      {e.autofillDisabled && (
                        <span
                          title="Excluded from autofill"
                          className="text-[10px] uppercase tracking-wider text-amber-400 shrink-0"
                        >
                          off
                        </span>
                      )}
                      {e.folder && selectedFolder === ALL && (
                        <span className="text-[10px] uppercase tracking-wider text-ink-500 shrink-0">
                          {e.folder}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto">
        {mode === "new" ? (
          <EntryForm
            entry={null}
            folders={folders}
            defaultFolder={
              selectedFolder !== ALL && selectedFolder !== UNFILED ? selectedFolder : ""
            }
            onCancel={() => setMode("view")}
            onSave={async (data) => {
              const created = await window.vault.add(data);
              await reload(created.id);
              setMode("view");
            }}
          />
        ) : mode === "edit" && selected ? (
          <EntryForm
            entry={selected}
            folders={folders}
            defaultFolder={selected.folder}
            onCancel={() => setMode("view")}
            onSave={async (data) => {
              await window.vault.update(selected.id, data);
              await reload(selected.id);
              setMode("view");
            }}
          />
        ) : selected ? (
          <EntryDetail
            entry={selected}
            onEdit={() => setMode("edit")}
            onDelete={async () => {
              await window.vault.remove(selected.id);
              await reload(null);
              setMode("view");
            }}
            onUpdate={async (patch) => {
              await window.vault.update(selected.id, patch);
              await reload(selected.id);
            }}
          />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function safeHostname(u: string): string {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : "https://" + u).hostname;
  } catch {
    return u;
  }
}

function Avatar({ text }: { text: string }) {
  const initial = (text.trim()[0] || "?").toUpperCase();
  const hue = (text.charCodeAt(0) * 47) % 360;
  return (
    <div
      className="h-8 w-8 rounded-md grid place-items-center text-xs font-semibold text-ink-950 shrink-0"
      style={{ background: `hsl(${hue} 70% 70%)` }}
    >
      {initial}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full grid place-items-center px-8 text-center">
      <div className="max-w-sm space-y-3">
        <h3 className="text-lg font-medium text-ink-200">Nothing selected</h3>
        <p className="text-sm text-ink-400">
          Pick an entry from the list, or create a new one to get started.
        </p>
      </div>
    </div>
  );
}
