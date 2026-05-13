import { useEffect, useState } from "react";
import type { PairedClient, UpdateStatus } from "../types";
import RecoveryKeyDisplay from "./RecoveryKeyDisplay";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Section = "security" | "browsers" | "backup" | "about";

export default function SettingsDrawer({ open, onClose }: Props) {
  const [section, setSection] = useState<Section>("security");
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (rotatedKey) {
    return (
      <RecoveryKeyDisplay
        recoveryKey={rotatedKey}
        context="rotation"
        onDone={() => setRotatedKey(null)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        className="bg-ink-900 border-l border-ink-700 w-full max-w-2xl h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur border-b border-ink-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-100">Settings</h2>
          <button
            onClick={onClose}
            className="no-drag text-sm text-ink-400 hover:text-ink-100 transition"
          >
            Close
          </button>
        </header>

        <nav className="border-b border-ink-800 px-4 flex gap-1">
          {(["security", "browsers", "backup", "about"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={[
                "no-drag px-3 py-3 text-sm transition border-b-2",
                section === s
                  ? "border-accent-500 text-ink-100"
                  : "border-transparent text-ink-400 hover:text-ink-200",
              ].join(" ")}
            >
              {s === "security"
                ? "Security"
                : s === "browsers"
                ? "Paired browsers"
                : s === "backup"
                ? "Backup & export"
                : "About"}
            </button>
          ))}
        </nav>

        <div className="p-6 space-y-8">
          {section === "security" && (
            <SecuritySection onRotated={setRotatedKey} />
          )}
          {section === "browsers" && <BrowsersSection />}
          {section === "backup" && <BackupSection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
        {description && (
          <p className="text-xs text-ink-400 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="bg-ink-950 border border-ink-800 rounded-lg p-4 space-y-3">
        {children}
      </div>
    </section>
  );
}

function SecuritySection({
  onRotated,
}: {
  onRotated: (key: string) => void;
}) {
  const [touchIDAvailable, setTouchIDAvailable] = useState(false);
  const [touchIDEnabled, setTouchIDEnabled] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(15);

  async function refresh() {
    const [avail, has, rec, settings] = await Promise.all([
      window.vault.isTouchIDAvailable(),
      window.vault.hasTouchIDSetup(),
      window.vault.hasRecoveryKey(),
      window.vault.getGlobalSettings(),
    ]);
    setTouchIDAvailable(avail);
    setTouchIDEnabled(has);
    setHasRecovery(rec);
    setAutoLockMinutesState(
      settings.autoLockMinutes === undefined ? 15 : settings.autoLockMinutes
    );
  }

  async function changeAutoLock(minutes: number) {
    setAutoLockMinutesState(minutes);
    await window.vault.setGlobalSettings({ autoLockMinutes: minutes });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function toggleTouchID() {
    if (touchIDEnabled) {
      await window.vault.disableTouchID();
    } else {
      await window.vault.enableTouchID();
    }
    await refresh();
  }

  async function rotateRecovery() {
    if (
      !window.confirm(
        "Generate a new recovery key? Your old recovery key will stop working immediately."
      )
    )
      return;
    const res = await window.vault.rotateRecoveryKey();
    onRotated(res.recoveryKey);
  }

  return (
    <>
      <Card
        title="Master password"
        description="Used to derive the encryption key that protects your vault. We never see it."
      >
        <button
          onClick={() => setPwModal(true)}
          className="no-drag bg-accent-500 hover:bg-accent-400 text-ink-950 text-sm font-medium rounded-md px-4 py-2 transition"
        >
          Change master password…
        </button>
      </Card>

      {touchIDAvailable && (
        <Card
          title="Touch ID"
          description="Stores the encryption key in macOS Keychain, unlockable with your fingerprint. Disable to force password entry every time."
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-200">
              {touchIDEnabled ? "Enabled" : "Disabled"}
            </span>
            <button
              onClick={toggleTouchID}
              className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3.5 py-1.5 transition"
            >
              {touchIDEnabled ? "Disable" : "Enable"}
            </button>
          </div>
        </Card>
      )}

      <Card
        title="Auto-lock"
        description="Lock the vault automatically after a period of inactivity. You'll need your password or Touch ID to unlock again."
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-200">
            {autoLockMinutes === 0
              ? "Never"
              : autoLockMinutes === 1
              ? "After 1 minute"
              : `After ${autoLockMinutes} minutes`}
          </span>
          <select
            value={autoLockMinutes}
            onChange={(e) => changeAutoLock(Number(e.target.value))}
            className="no-drag bg-ink-900 border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3 py-1.5 transition focus:outline-none focus:border-accent-500"
          >
            <option value={0}>Never</option>
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={240}>4 hours</option>
          </select>
        </div>
      </Card>

      <Card
        title="Recovery key"
        description="A printed key that resets your master password if you forget it. Anyone with this key can access your data — keep it offline."
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-200">
            {hasRecovery ? "Active" : "Not set up"}
          </span>
          <button
            onClick={rotateRecovery}
            className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3.5 py-1.5 transition"
          >
            Generate new key…
          </button>
        </div>
      </Card>

      {pwModal && (
        <ChangePasswordModal
          onClose={() => setPwModal(false)}
          onChanged={async () => {
            setPwModal(false);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function ChangePasswordModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next.length < 8) {
      setErr("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setErr("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await window.vault.changeMasterPassword(current, next);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] bg-ink-950/80 backdrop-blur grid place-items-center px-6">
      <form
        onSubmit={submit}
        className="bg-ink-900 border border-ink-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-5"
      >
        <div className="space-y-1">
          <div className="text-[10px] text-accent-400 uppercase tracking-[0.18em] font-semibold">
            Security
          </div>
          <h2 className="text-lg font-semibold text-ink-100 leading-tight">
            Change master password
          </h2>
          <p className="text-xs text-ink-400">
            Touch ID will be disabled — you can re-enable it after.
          </p>
        </div>

        <div className="space-y-3">
          {[
            ["Current password", current, setCurrent],
            ["New password", next, setNext],
            ["Confirm new password", confirm, setConfirm],
          ].map(([label, value, set], i) => (
            <label key={i} className="block no-drag">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-400">
                {label as string}
              </span>
              <input
                type="password"
                value={value as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
                autoFocus={i === 0}
                className="mt-1.5 w-full bg-ink-950 border border-ink-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 outline-none rounded-md px-3 py-2 text-ink-100"
              />
            </label>
          ))}
        </div>

        {err && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-md px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-4 py-2 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !current || !next}
            className="no-drag bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 text-sm font-medium rounded-md px-4 py-2 transition"
          >
            {busy ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function BrowsersSection() {
  const [clients, setClients] = useState<PairedClient[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const list = await window.vault.listPairedClients();
    setClients(list);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function revokeAll() {
    if (
      !window.confirm(
        "Revoke all paired browsers? You'll need to re-pair each one to use autofill again."
      )
    )
      return;
    await window.vault.revokeAllPairedClients();
    await refresh();
  }

  return (
    <Card
      title="Paired browsers"
      description="Browsers that have a token for the local bridge on 127.0.0.1:17321. The bridge only listens on loopback — these can't be accessed from another machine."
    >
      {loading ? (
        <div className="text-sm text-ink-500">Loading…</div>
      ) : clients.length === 0 ? (
        <div className="text-sm text-ink-400 py-4 text-center">
          No browsers paired yet. Install the Keyring extension and use its "Pair with app" button.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-ink-800/60">
            {clients.map((c, i) => (
              <li key={i} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-ink-100 truncate">{c.client}</div>
                  <div className="text-xs text-ink-500">
                    Paired {formatRelative(c.createdAt)} · last used {formatRelative(c.lastUsed)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end pt-2">
            <button
              onClick={revokeAll}
              className="no-drag border border-red-900/70 hover:bg-red-950/30 text-red-300 text-sm rounded-md px-3.5 py-1.5 transition"
            >
              Revoke all
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function BackupSection() {
  const [status, setStatus] = useState<string | null>(null);

  async function exportCsv() {
    setStatus(null);
    const r = await window.vault.exportCsv();
    if (r.ok) setStatus(`Exported ${r.count} entries to ${r.path}`);
  }

  async function exportJson() {
    setStatus(null);
    const r = await window.vault.exportBitwardenJson();
    if (r.ok) setStatus(`Exported ${r.count} entries to ${r.path}`);
  }

  async function exportBackup() {
    setStatus(null);
    const r = await window.vault.exportEncryptedBackup();
    if (r.ok) setStatus(`Saved ${formatBytes(r.bytes ?? 0)} backup to ${r.path}`);
  }

  return (
    <>
      <Card
        title="Encrypted backup"
        description="A copy of vault.enc. The same master password (or recovery key) unlocks it on any Mac. Drop it back into Keyring's Application Support directory to restore."
      >
        <button
          onClick={exportBackup}
          className="no-drag bg-accent-500 hover:bg-accent-400 text-ink-950 text-sm font-medium rounded-md px-4 py-2 transition"
        >
          Export encrypted backup…
        </button>
      </Card>

      <Card
        title="Plain-text export"
        description="For migrating to another password manager. The file is unencrypted — delete it after import."
      >
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportCsv}
            className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3.5 py-1.5 transition"
          >
            Export as CSV…
          </button>
          <button
            onClick={exportJson}
            className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3.5 py-1.5 transition"
          >
            Export as Bitwarden JSON…
          </button>
        </div>
      </Card>

      {status && (
        <div className="text-xs text-ink-300 bg-ink-950 border border-ink-800 rounded-md px-3 py-2 break-all">
          {status}
        </div>
      )}
    </>
  );
}

function AboutSection() {
  const [version, setVersion] = useState<string>("");
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    window.vault.appVersion().then(setVersion);
    window.vault.updaterStatus().then(setStatus);
    const off = window.vault.onUpdaterStatus(setStatus);
    return off;
  }, []);

  async function check() {
    setChecking(true);
    try {
      await window.vault.updaterCheck();
    } finally {
      setChecking(false);
    }
  }

  async function install() {
    await window.vault.updaterInstall();
  }

  const statusLabel = (() => {
    switch (status.state) {
      case "idle":
        return "Idle";
      case "checking":
        return "Checking…";
      case "available":
        return `Update ${status.version} available — downloading…`;
      case "not-available":
        return "You're on the latest version.";
      case "downloading":
        return `Downloading ${status.percent}%`;
      case "ready":
        return `Update ${status.version} ready — restart to install.`;
      case "error":
        return `Update check failed: ${status.message}`;
    }
  })();

  return (
    <>
      <Card title="Updates" description="Keyring checks for new versions automatically. You can also check manually.">
        <div className="text-sm text-ink-300">{statusLabel}</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={check}
            disabled={checking}
            className="no-drag border border-ink-700 hover:bg-ink-800 disabled:opacity-50 text-ink-100 text-sm rounded-md px-3.5 py-1.5 transition"
          >
            {checking ? "Checking…" : "Check for updates"}
          </button>
          {status.state === "ready" && (
            <button
              onClick={install}
              className="no-drag bg-accent-500 hover:bg-accent-400 text-ink-950 text-sm font-medium rounded-md px-3.5 py-1.5 transition"
            >
              Restart & install
            </button>
          )}
        </div>
      </Card>

      <Card title="Version">
        <div className="text-sm text-ink-200">Keyring v{version}</div>
        <div className="text-xs text-ink-500">
          Local, encrypted, open source. No cloud, no telemetry.
        </div>
      </Card>
    </>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
