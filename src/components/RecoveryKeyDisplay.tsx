import { useState } from "react";

type Props = {
  recoveryKey: string;
  context: "setup" | "post-migration" | "rotation";
  onDone: () => void;
};

export default function RecoveryKeyDisplay({ recoveryKey, context, onDone }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    window.vault.copyToClipboard(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function print() {
    await window.vault.printRecoveryKey(recoveryKey);
  }

  const groups = recoveryKey.split("-");

  const heading =
    context === "setup"
      ? "Save your recovery key."
      : context === "post-migration"
      ? "Your new recovery key."
      : "New recovery key generated.";

  const body =
    context === "setup"
      ? "If you ever forget your master password, this is the only way back into your vault. Print it, save it offline. We can't recover it for you."
      : context === "post-migration"
      ? "Keying just upgraded your vault to support recovery keys. Save this somewhere safe — it's the only way back in if you forget your master password."
      : "Your old recovery key no longer works. Save this new one somewhere safe.";

  return (
    <div className="fixed inset-0 z-[60] bg-ink-950/85 backdrop-blur grid place-items-center px-6">
      <div className="bg-ink-900 border border-ink-700 rounded-xl shadow-2xl w-full max-w-xl p-7 space-y-5">
        <div className="space-y-1">
          <div className="text-[10px] text-accent-400 uppercase tracking-[0.18em] font-semibold">
            Recovery key
          </div>
          <h2 className="text-xl font-semibold text-ink-100 leading-tight">{heading}</h2>
          <p className="text-sm text-ink-400 leading-relaxed pt-1">{body}</p>
        </div>

        <div className="bg-ink-950 border border-ink-800 rounded-lg p-5">
          <div className="font-mono text-base text-ink-100 tracking-[0.12em] leading-loose grid grid-cols-2 gap-y-1 gap-x-6 sm:grid-cols-4">
            {groups.map((g, i) => (
              <span key={i} className="text-center">{g}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={copy}
            className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3.5 py-2 transition"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={print}
            className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-3.5 py-2 transition"
          >
            Print…
          </button>
        </div>

        <div className="bg-amber-950/30 border border-amber-900/60 rounded-md px-3.5 py-3 text-xs text-amber-200 leading-relaxed">
          Anyone with this key can reset your password and read your vault. Don't email it,
          don't store it in another password manager on this computer, don't put it on cloud
          sync. Paper, a safe deposit box, or a steel backup is the right shape.
        </div>

        <label className="flex items-start gap-2 cursor-pointer no-drag select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 accent-accent-500"
          />
          <span className="text-sm text-ink-200">
            I've saved this somewhere safe and offline.
          </span>
        </label>

        <div className="flex justify-end">
          <button
            disabled={!confirmed}
            onClick={onDone}
            className="no-drag bg-accent-500 hover:bg-accent-400 disabled:opacity-40 disabled:cursor-not-allowed text-ink-950 text-sm font-medium rounded-md px-4 py-2 transition"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
