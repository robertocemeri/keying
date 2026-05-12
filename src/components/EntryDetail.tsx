import { useEffect, useState } from "react";
import type { Entry, TotpCode } from "../types";

export default function EntryDetail({
  entry,
  onEdit,
  onDelete,
  onUpdate,
}: {
  entry: Entry;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<Entry>) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [totp, setTotp] = useState<TotpCode | null>(null);

  useEffect(() => {
    if (!entry.totpSecret) {
      setTotp(null);
      return;
    }
    let active = true;
    async function tick() {
      const c = await window.vault.totpCode(entry.id);
      if (active) setTotp(c);
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [entry.id, entry.totpSecret]);

  function copy(value: string, label: string) {
    if (!value) return;
    window.vault.copyToClipboard(value);
    flash(`${label} copied`);
    if (label === "Password") {
      setTimeout(() => window.vault.clearClipboard(), 30_000);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <header className="flex items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {entry.folder && (
              <span className="text-[10px] uppercase tracking-widest text-accent-400">
                {entry.folder}
              </span>
            )}
            <button
              onClick={() =>
                onUpdate({ autofillDisabled: entry.autofillDisabled ? undefined : true })
              }
              title={
                entry.autofillDisabled
                  ? "Autofill is off for this entry — click to turn on"
                  : "Click to disable autofill for this entry"
              }
              className={[
                "no-drag text-[10px] uppercase tracking-wider px-2 py-0.5 rounded transition",
                entry.autofillDisabled
                  ? "bg-amber-950/40 text-amber-300 border border-amber-900/60 hover:bg-amber-950/60"
                  : "bg-ink-900 text-ink-400 border border-ink-800 hover:text-ink-200",
              ].join(" ")}
            >
              {entry.autofillDisabled ? "Autofill off" : "Autofill on"}
            </button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight truncate">{entry.title || "(untitled)"}</h1>
          {entry.url && (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                copy(entry.url, "URL");
              }}
              className="text-sm text-ink-400 hover:text-ink-200 transition truncate block mt-1"
              title="Click to copy"
            >
              {entry.url}
            </a>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3 py-1.5 transition"
          >
            Edit
          </button>
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="no-drag border border-red-900/70 hover:bg-red-950/40 text-red-300 text-sm rounded-md px-3 py-1.5 transition"
            >
              Delete
            </button>
          ) : (
            <>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3 py-1.5 transition"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                className="no-drag bg-red-600 hover:bg-red-500 text-white text-sm rounded-md px-3 py-1.5 transition"
              >
                Confirm
              </button>
            </>
          )}
        </div>
      </header>

      <dl className="space-y-5">
        <Row label="Username" value={entry.username}>
          {entry.username && (
            <CopyButton onClick={() => copy(entry.username, "Username")} />
          )}
        </Row>

        <Row
          label="Password"
          value={revealed ? entry.password : entry.password ? "•".repeat(Math.min(entry.password.length, 16)) : ""}
          mono
        >
          {entry.password && (
            <>
              <button
                onClick={() => setRevealed((r) => !r)}
                className="no-drag text-xs text-ink-400 hover:text-ink-100 transition"
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
              <CopyButton onClick={() => copy(entry.password, "Password")} />
            </>
          )}
        </Row>

        {entry.totpSecret && (
          <TotpRow totp={totp} onCopy={() => totp && copy(totp.code, "Code")} />
        )}

        {entry.notes && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-ink-400 mb-1.5">
              Notes
            </div>
            <pre className="whitespace-pre-wrap text-sm text-ink-200 bg-ink-900 border border-ink-800 rounded-md p-3 font-sans">
              {entry.notes}
            </pre>
          </div>
        )}

        <div className="pt-4 text-xs text-ink-500 border-t border-ink-800/60">
          Updated {new Date(entry.updatedAt).toLocaleString()}
        </div>
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-ink-400 mb-1.5">{label}</div>
      <div className="flex items-center gap-2">
        <div
          className={[
            "flex-1 bg-ink-900 border border-ink-800 rounded-md px-3 py-2 text-sm select-text",
            mono ? "font-mono" : "",
            value ? "text-ink-100" : "text-ink-500",
          ].join(" ")}
        >
          {value || "—"}
        </div>
        {children}
      </div>
    </div>
  );
}

function TotpRow({
  totp,
  onCopy,
}: {
  totp: TotpCode | null;
  onCopy: () => void;
}) {
  const remainingSec = totp ? Math.max(0, Math.ceil(totp.expiresInMs / 1000)) : 0;
  const pct = totp ? (totp.expiresInMs / totp.periodMs) * 100 : 0;
  const expiringSoon = remainingSec <= 5;
  const formatted = totp ? totp.code.slice(0, 3) + " " + totp.code.slice(3) : "— — —";

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-ink-400 mb-1.5">
        One-time code
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-ink-900 border border-ink-800 rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2">
            <div
              className={[
                "font-mono text-2xl tracking-[0.18em] font-medium select-text",
                expiringSoon ? "text-amber-400" : "text-ink-100",
              ].join(" ")}
            >
              {formatted}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500 tabular-nums">
              {remainingSec}s
            </div>
          </div>
          <div className="h-1 bg-ink-950">
            <div
              className={[
                "h-full transition-all duration-1000 ease-linear",
                expiringSoon ? "bg-amber-400" : "bg-accent-500",
              ].join(" ")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <button
          onClick={onCopy}
          disabled={!totp}
          className="no-drag text-xs border border-ink-700 hover:bg-ink-800 disabled:opacity-40 text-ink-100 rounded-md px-3 py-1.5 transition"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function CopyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="no-drag text-xs border border-ink-700 hover:bg-ink-800 text-ink-100 rounded-md px-3 py-1.5 transition"
    >
      Copy
    </button>
  );
}

// Tiny toast: append a transient element to body
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function flash(message: string) {
  let el = document.getElementById("__toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "__toast";
    el.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1f;color:#ececf0;padding:8px 14px;border-radius:8px;font-size:12px;border:1px solid #26262d;box-shadow:0 8px 24px rgba(0,0,0,0.4);opacity:0;transition:opacity .15s ease;z-index:9999;pointer-events:none;";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.opacity = "1";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (el) el.style.opacity = "0";
  }, 1400);
}
