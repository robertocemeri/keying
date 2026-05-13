import { useEffect, useState } from "react";
import RecoveryKeyDisplay from "./RecoveryKeyDisplay";

export default function SetupScreen({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touchID, setTouchID] = useState(true);
  const [touchIDAvailable, setTouchIDAvailable] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  useEffect(() => {
    window.vault.isTouchIDAvailable().then(setTouchIDAvailable);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) {
      setErr("Master password must be at least 8 characters.");
      return;
    }
    if (pw !== confirm) {
      setErr("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await window.vault.setup(pw, touchID && touchIDAvailable);
      setPw("");
      setConfirm("");
      setRecoveryKey(res.recoveryKey);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (recoveryKey) {
    return (
      <RecoveryKeyDisplay
        recoveryKey={recoveryKey}
        context="setup"
        onDone={() => {
          setRecoveryKey(null);
          onDone();
        }}
      />
    );
  }

  return (
    <div className="h-full grid place-items-center px-8">
      <form onSubmit={submit} className="w-full max-w-md space-y-6">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 text-accent-400 text-xs tracking-widest uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            New vault
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Create your master password.</h1>
          <p className="text-sm text-ink-400 leading-relaxed">
            This password encrypts everything in your vault. We can't recover it — but you'll get a one-time recovery key after this step in case you forget it.
          </p>
        </header>

        <div className="space-y-4">
          <Field
            label="Master password"
            type="password"
            value={pw}
            onChange={setPw}
            autoFocus
            placeholder="At least 8 characters"
          />
          <Field
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Type it again"
          />

          {touchIDAvailable && (
            <label className="flex items-start gap-3 cursor-pointer no-drag select-none">
              <input
                type="checkbox"
                checked={touchID}
                onChange={(e) => setTouchID(e.target.checked)}
                className="mt-1 accent-accent-500"
              />
              <span className="text-sm text-ink-200">
                Enable Touch ID for quick unlock
                <span className="block text-ink-400 text-xs mt-0.5">
                  Your encryption key is stored in macOS Keychain and unlocked with your fingerprint.
                </span>
              </span>
            </label>
          )}
        </div>

        {err && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="no-drag w-full bg-accent-500 hover:bg-accent-400 disabled:opacity-50 disabled:cursor-not-allowed text-ink-950 font-medium rounded-md py-2.5 transition"
        >
          {busy ? "Creating…" : "Create vault"}
        </button>

        <div className="pt-2 border-t border-ink-800 text-center">
          <button
            type="button"
            onClick={async () => {
              setErr(null);
              const r = await window.vault.restoreEncryptedBackup();
              if (r.cancelled) return;
              if (r.ok) {
                onDone();
              } else if (r.error) {
                setErr(`Restore failed: ${r.error}`);
              }
            }}
            className="no-drag text-sm text-ink-400 hover:text-ink-200 transition py-2"
          >
            Already have a backup? Restore from .enc file
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoFocus,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block no-drag">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="mt-1.5 w-full bg-ink-900 border border-ink-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 outline-none rounded-md px-3 py-2 text-ink-100 placeholder:text-ink-500"
      />
    </label>
  );
}
