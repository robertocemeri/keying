import { useEffect, useState } from "react";
import type { Entry, GeneratorOptions } from "../types";
import PasswordGenerator from "./PasswordGenerator";

type FormData = Omit<Entry, "id" | "createdAt" | "updatedAt">;

export default function EntryForm({
  entry,
  folders,
  defaultFolder,
  onSave,
  onCancel,
}: {
  entry: Entry | null;
  folders: string[];
  defaultFolder: string;
  onSave: (data: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [data, setData] = useState<FormData>({
    title: entry?.title ?? "",
    username: entry?.username ?? "",
    password: entry?.password ?? "",
    url: entry?.url ?? "",
    notes: entry?.notes ?? "",
    folder: entry?.folder ?? defaultFolder ?? "",
    autofillDisabled: entry?.autofillDisabled,
    totpSecret: entry?.totpSecret,
  });
  const [totpInput, setTotpInput] = useState(entry?.totpSecret ?? "");
  const [totpHint, setTotpHint] = useState<string | null>(null);
  const [showGen, setShowGen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData({
      title: entry?.title ?? "",
      username: entry?.username ?? "",
      password: entry?.password ?? "",
      url: entry?.url ?? "",
      notes: entry?.notes ?? "",
      folder: entry?.folder ?? defaultFolder ?? "",
      autofillDisabled: entry?.autofillDisabled,
      totpSecret: entry?.totpSecret,
    });
    setTotpInput(entry?.totpSecret ?? "");
    setTotpHint(null);
  }, [entry, defaultFolder]);

  async function handleTotpChange(raw: string) {
    setTotpInput(raw);
    if (!raw.trim()) {
      update("totpSecret", undefined);
      setTotpHint(null);
      return;
    }
    const normalized = await window.vault.normalizeTotp(raw);
    if (normalized) {
      update("totpSecret", normalized);
      setTotpHint(
        raw.trim().toLowerCase().startsWith("otpauth://")
          ? "Extracted from otpauth:// URI ✓"
          : "Valid secret ✓"
      );
    } else {
      update("totpSecret", undefined);
      setTotpHint("Doesn't look like a valid base32 secret");
    }
  }

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!data.title.trim()) {
      setErr("Give it a title (e.g. the site name).");
      return;
    }
    setBusy(true);
    try {
      await onSave(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-8 max-w-2xl space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          {entry ? "Edit entry" : "New entry"}
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3 py-1.5 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="no-drag bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 text-sm font-medium rounded-md px-4 py-1.5 transition"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <Field
        label="Title"
        value={data.title}
        onChange={(v) => update("title", v)}
        placeholder="GitHub, Bank, Netflix…"
        autoFocus
      />
      <FolderField
        value={data.folder}
        onChange={(v) => update("folder", v)}
        folders={folders}
      />
      <Field
        label="Website"
        value={data.url}
        onChange={(v) => update("url", v)}
        placeholder="https://example.com"
      />
      <Field
        label="Username / email"
        value={data.username}
        onChange={(v) => update("username", v)}
        placeholder="you@example.com"
      />

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-400">Password</span>
          <button
            type="button"
            onClick={() => setShowGen((s) => !s)}
            className="no-drag text-xs text-accent-400 hover:text-accent-300 transition"
          >
            {showGen ? "Hide generator" : "Generate"}
          </button>
        </div>
        <input
          type="text"
          value={data.password}
          onChange={(e) => update("password", e.target.value)}
          placeholder="Type or generate"
          className="no-drag w-full bg-ink-900 border border-ink-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 outline-none rounded-md px-3 py-2 text-ink-100 font-mono text-sm"
        />
        {showGen && (
          <div className="mt-3">
            <PasswordGenerator onUse={(p) => update("password", p)} />
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-400">
            Authenticator code
          </span>
          {totpHint && (
            <span
              className={[
                "text-[10px]",
                totpHint.includes("✓") ? "text-accent-400" : "text-amber-400",
              ].join(" ")}
            >
              {totpHint}
            </span>
          )}
        </div>
        <input
          type="text"
          value={totpInput}
          onChange={(e) => handleTotpChange(e.target.value)}
          placeholder="Paste an otpauth:// URI or base32 secret"
          spellCheck={false}
          autoComplete="off"
          className="no-drag w-full bg-ink-900 border border-ink-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 outline-none rounded-md px-3 py-2 text-ink-100 font-mono text-xs"
        />
      </div>

      <div>
        <span className="text-xs font-medium uppercase tracking-wider text-ink-400">Notes</span>
        <textarea
          value={data.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={4}
          placeholder="Recovery codes, security questions, anything else."
          className="no-drag mt-1.5 w-full bg-ink-900 border border-ink-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 outline-none rounded-md px-3 py-2 text-ink-100 text-sm resize-y"
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer no-drag select-none pt-1">
        <input
          type="checkbox"
          checked={!!data.autofillDisabled}
          onChange={(e) => update("autofillDisabled", e.target.checked || undefined)}
          className="mt-1 accent-accent-500"
        />
        <span className="text-sm text-ink-200">
          Exclude this entry from browser autofill
          <span className="block text-ink-400 text-xs mt-0.5">
            The extension won't suggest this one even when the site matches.
          </span>
        </span>
      </label>

      {err && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
          {err}
        </div>
      )}
    </form>
  );
}

function FolderField({
  value,
  onChange,
  folders,
}: {
  value: string;
  onChange: (v: string) => void;
  folders: string[];
}) {
  const options = ["", ...folders];
  return (
    <label className="block no-drag">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-400">Folder</span>
      <div className="mt-1.5 flex gap-2">
        <select
          value={options.includes(value) ? value : "__custom__"}
          onChange={(e) => {
            if (e.target.value === "__custom__") return;
            onChange(e.target.value);
          }}
          className="bg-ink-900 border border-ink-700 focus:border-accent-500 outline-none rounded-md px-3 py-2 text-ink-100 text-sm"
        >
          <option value="">Unfiled</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          <option value="__custom__">— New folder…</option>
        </select>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="or type a folder name"
          className="flex-1 bg-ink-900 border border-ink-700 focus:border-accent-500 outline-none rounded-md px-3 py-2 text-ink-100 text-sm"
        />
      </div>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block no-drag">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="mt-1.5 w-full bg-ink-900 border border-ink-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 outline-none rounded-md px-3 py-2 text-ink-100 text-sm"
      />
    </label>
  );
}

export type { GeneratorOptions };
