import { useEffect, useState } from "react";

export default function UnlockScreen({
  touchIDAvailable,
  hasTouchIDKey,
  onUnlocked,
}: {
  touchIDAvailable: boolean;
  hasTouchIDKey: boolean;
  onUnlocked: () => void;
}) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enableTouchID, setEnableTouchID] = useState(false);

  // Auto-trigger Touch ID once on mount if available
  useEffect(() => {
    if (touchIDAvailable && hasTouchIDKey) {
      tryTouchID();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryTouchID() {
    setErr(null);
    setBusy(true);
    try {
      await window.vault.unlockWithTouchID();
      onUnlocked();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("cancel")) setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await window.vault.unlockWithPassword(pw, enableTouchID && touchIDAvailable);
      setPw("");
      onUnlocked();
    } catch (e) {
      setErr(e instanceof Error && e.message.toLowerCase().includes("auth")
        ? "Wrong password."
        : "Wrong password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full grid place-items-center px-8">
      <form onSubmit={submit} className="w-full max-w-md space-y-6">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 text-accent-400 text-xs tracking-widest uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            Keyring locked
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back.</h1>
        </header>

        <div className="space-y-4">
          <label className="block no-drag">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-400">Master password</span>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
              className="mt-1.5 w-full bg-ink-900 border border-ink-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 outline-none rounded-md px-3 py-2 text-ink-100"
            />
          </label>

          {touchIDAvailable && !hasTouchIDKey && (
            <label className="flex items-start gap-3 cursor-pointer no-drag select-none">
              <input
                type="checkbox"
                checked={enableTouchID}
                onChange={(e) => setEnableTouchID(e.target.checked)}
                className="mt-1 accent-accent-500"
              />
              <span className="text-sm text-ink-200">
                Enable Touch ID for next time
              </span>
            </label>
          )}
        </div>

        {err && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
            {err}
          </div>
        )}

        <div className="space-y-2">
          <button
            type="submit"
            disabled={busy || !pw}
            className="no-drag w-full bg-accent-500 hover:bg-accent-400 disabled:opacity-50 disabled:cursor-not-allowed text-ink-950 font-medium rounded-md py-2.5 transition"
          >
            {busy ? "Unlocking…" : "Unlock"}
          </button>
          {touchIDAvailable && hasTouchIDKey && (
            <button
              type="button"
              onClick={tryTouchID}
              disabled={busy}
              className="no-drag w-full border border-ink-700 hover:bg-ink-800 text-ink-100 font-medium rounded-md py-2.5 transition"
            >
              Use Touch ID
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
