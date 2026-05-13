import { useEffect, useState } from "react";

type Format = "csv" | "bitwarden" | "backup";

export default function ExportModal() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    return window.vault.onExportRequested(() => {
      setOpen(true);
      setStatus(null);
    });
  }, []);

  if (!open) return null;

  function close() {
    setOpen(false);
    setStatus(null);
  }

  async function run(format: Format) {
    setBusy(true);
    setStatus(null);
    try {
      let r:
        | { ok: boolean; count?: number; path?: string; bytes?: number }
        | null = null;
      if (format === "csv") r = await window.vault.exportCsv();
      else if (format === "bitwarden") r = await window.vault.exportBitwardenJson();
      else r = await window.vault.exportEncryptedBackup();
      if (r?.ok) {
        if (format === "backup") {
          setStatus(`Saved backup to ${r.path}`);
        } else {
          setStatus(`Exported ${r.count} entries to ${r.path}`);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm grid place-items-center px-6">
      <div className="bg-ink-900 border border-ink-700 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-5">
        <div className="space-y-1">
          <div className="text-[10px] text-accent-400 uppercase tracking-[0.18em] font-semibold">
            Export vault
          </div>
          <h2 className="text-lg font-semibold text-ink-100 leading-tight">
            Choose an export format
          </h2>
          <p className="text-sm text-ink-400 leading-relaxed">
            Encrypted backups are safe to keep around. Plain-text exports leak every password — delete them after migrating.
          </p>
        </div>

        <div className="space-y-2">
          <FormatButton
            title="Encrypted backup"
            description="A copy of your vault.enc — same master password unlocks it. Safe to keep."
            recommended
            onClick={() => run("backup")}
            disabled={busy}
          />
          <FormatButton
            title="Bitwarden JSON"
            description="Plaintext. Importable into Bitwarden, Keyring, or any tool that reads Bitwarden exports."
            onClick={() => run("bitwarden")}
            disabled={busy}
          />
          <FormatButton
            title="CSV"
            description="Plaintext. Generic CSV with folder, title, url, username, password, totp, notes."
            onClick={() => run("csv")}
            disabled={busy}
          />
        </div>

        {status && (
          <div className="text-xs text-ink-300 bg-ink-950 border border-ink-800 rounded-md px-3 py-2 break-all">
            {status}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={close}
            className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-4 py-2 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function FormatButton({
  title,
  description,
  onClick,
  disabled,
  recommended,
}: {
  title: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
  recommended?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "no-drag block w-full text-left rounded-lg border p-4 transition",
        recommended
          ? "border-accent-500/40 bg-accent-500/5 hover:bg-accent-500/10"
          : "border-ink-800 hover:bg-ink-800/40",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink-100">{title}</span>
        {recommended && (
          <span className="text-[9px] uppercase tracking-wider text-accent-400">
            Recommended
          </span>
        )}
      </div>
      <div className="text-xs text-ink-400 mt-1 leading-relaxed">{description}</div>
    </button>
  );
}
