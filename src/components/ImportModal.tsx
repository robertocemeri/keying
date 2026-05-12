import { useEffect, useRef, useState } from "react";
import type { ImportedEntry } from "../types";

type Parsed = { format: string; entries: ImportedEntry[] };

export default function ImportModal({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return window.vault.onImportRequested(() => {
      reset();
      setOpen(true);
    });
  }, []);

  function reset() {
    setParsed(null);
    setResult(null);
    setError(null);
    setBusy(false);
    setFilename(null);
    setSkipDuplicates(true);
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setFilename(file.name);
    try {
      const text = await file.text();
      const res = await window.vault.parseImport(text);
      if (!res || !res.entries.length) {
        setError(
          "Couldn't find any login entries in this file. Make sure it's a CSV export or a Bitwarden JSON export."
        );
        setParsed(null);
        return;
      }
      setParsed(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await window.vault.applyImport(parsed.entries, skipDuplicates);
      setResult(r);
      onImported?.();
    } finally {
      setBusy(false);
    }
  }

  // Drag-and-drop file
  useEffect(() => {
    if (!open) return;
    const el = dropRef.current;
    if (!el) return;
    function prevent(e: Event) {
      e.preventDefault();
      e.stopPropagation();
    }
    function onDrop(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer?.files?.[0];
      if (f) handleFile(f);
    }
    el.addEventListener("dragenter", prevent);
    el.addEventListener("dragover", prevent);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", prevent);
      el.removeEventListener("dragover", prevent);
      el.removeEventListener("drop", onDrop);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm grid place-items-center px-6">
      <div className="bg-ink-900 border border-ink-700 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-5">
        {result ? (
          <ResultView result={result} onClose={close} />
        ) : parsed ? (
          <PreviewView
            parsed={parsed}
            filename={filename}
            skipDuplicates={skipDuplicates}
            onSkipChange={setSkipDuplicates}
            busy={busy}
            onCancel={() => {
              setParsed(null);
              setFilename(null);
              setError(null);
            }}
            onConfirm={doImport}
          />
        ) : (
          <PickerView
            dropRef={dropRef}
            fileInputRef={fileInputRef}
            busy={busy}
            error={error}
            onFile={handleFile}
            onClose={close}
          />
        )}
      </div>
    </div>
  );
}

function PickerView({
  dropRef,
  fileInputRef,
  busy,
  error,
  onFile,
  onClose,
}: {
  dropRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <div className="text-[10px] text-accent-400 uppercase tracking-[0.18em] font-semibold">
          Import passwords
        </div>
        <h2 className="text-lg font-semibold text-ink-100 leading-tight">
          Bring in entries from another app
        </h2>
        <p className="text-sm text-ink-400 leading-relaxed">
          Supports <strong>Bitwarden</strong> (JSON or CSV), <strong>1Password</strong>{" "}
          (CSV), <strong>iCloud Keychain</strong> (CSV), <strong>Chrome / Edge / Firefox</strong>{" "}
          password exports, or generic CSV with title / url / username / password columns.
        </p>
      </div>

      <div
        ref={dropRef}
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer border-2 border-dashed border-ink-700 hover:border-accent-500/60 rounded-lg p-8 text-center transition"
      >
        <div className="text-sm text-ink-200 font-medium">
          {busy ? "Reading file…" : "Drop a file here, or click to pick"}
        </div>
        <div className="text-xs text-ink-500 mt-1">.csv or .json</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.txt,text/csv,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="hidden"
        />
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-4 py-2 transition"
        >
          Close
        </button>
      </div>
    </>
  );
}

function PreviewView({
  parsed,
  filename,
  skipDuplicates,
  onSkipChange,
  busy,
  onCancel,
  onConfirm,
}: {
  parsed: Parsed;
  filename: string | null;
  skipDuplicates: boolean;
  onSkipChange: (v: boolean) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const sample = parsed.entries.slice(0, 8);
  const rest = parsed.entries.length - sample.length;
  return (
    <>
      <div className="space-y-1">
        <div className="text-[10px] text-accent-400 uppercase tracking-[0.18em] font-semibold">
          {parsed.format}
        </div>
        <h2 className="text-lg font-semibold text-ink-100 leading-tight">
          Ready to import {parsed.entries.length} {parsed.entries.length === 1 ? "entry" : "entries"}
        </h2>
        {filename && <div className="text-xs text-ink-500">from {filename}</div>}
      </div>

      <div className="bg-ink-950 border border-ink-800 rounded-md max-h-56 overflow-y-auto divide-y divide-ink-800/60">
        {sample.map((e, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <div className="truncate text-ink-100 font-medium">{e.title || "(untitled)"}</div>
              <div className="truncate text-ink-400">{e.username || e.url || "—"}</div>
            </div>
            {e.totpSecret && (
              <span className="text-[9px] uppercase tracking-wider text-accent-400 shrink-0">
                2FA
              </span>
            )}
            {e.folder && (
              <span className="text-[9px] uppercase tracking-wider text-ink-500 shrink-0">
                {e.folder}
              </span>
            )}
          </div>
        ))}
        {rest > 0 && (
          <div className="px-3 py-2 text-xs text-ink-500 text-center">+{rest} more</div>
        )}
      </div>

      <label className="flex items-start gap-2 cursor-pointer no-drag select-none">
        <input
          type="checkbox"
          checked={skipDuplicates}
          onChange={(e) => onSkipChange(e.target.checked)}
          className="mt-1 accent-accent-500"
        />
        <span className="text-sm text-ink-200">
          Skip duplicates
          <span className="block text-ink-400 text-xs mt-0.5">
            Match by title + username + URL — keeps you safe re-importing the same file.
          </span>
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-4 py-2 transition"
        >
          Choose another file
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="no-drag bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 text-sm font-medium rounded-md px-4 py-2 transition"
        >
          {busy ? "Importing…" : `Import ${parsed.entries.length}`}
        </button>
      </div>
    </>
  );
}

function ResultView({
  result,
  onClose,
}: {
  result: { imported: number; skipped: number };
  onClose: () => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <div className="text-[10px] text-accent-400 uppercase tracking-[0.18em] font-semibold">
          Import complete
        </div>
        <h2 className="text-lg font-semibold text-ink-100 leading-tight">
          Imported {result.imported}{" "}
          {result.imported === 1 ? "entry" : "entries"}
        </h2>
        {result.skipped > 0 && (
          <p className="text-sm text-ink-400">
            {result.skipped} duplicate{result.skipped === 1 ? "" : "s"} skipped.
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="no-drag bg-accent-500 hover:bg-accent-400 text-ink-950 text-sm font-medium rounded-md px-4 py-2 transition"
        >
          Done
        </button>
      </div>
    </>
  );
}
