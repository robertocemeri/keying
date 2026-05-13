import { useEffect, useState } from "react";

type PairingState =
  | { kind: "idle" }
  | { kind: "prompt"; code: string; client: string }
  | { kind: "completed"; client: string };

export default function PairingOverlay() {
  const [state, setState] = useState<PairingState>({ kind: "idle" });

  useEffect(() => {
    const offPrompt = window.vault.onPairingPrompt((info) => {
      setState({ kind: "prompt", code: info.code, client: info.client });
    });
    const offDone = window.vault.onPairingCompleted((info) => {
      setState({ kind: "completed", client: info.client });
      setTimeout(() => setState({ kind: "idle" }), 2500);
    });
    const offCancel = window.vault.onPairingCancelled(() => {
      setState({ kind: "idle" });
    });
    return () => {
      offPrompt();
      offDone();
      offCancel();
    };
  }, []);

  if (state.kind === "idle") return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm grid place-items-center px-6">
      <div className="bg-ink-900 border border-ink-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-5">
        {state.kind === "prompt" ? (
          <>
            <div className="space-y-2">
              <div className="text-[10px] text-accent-400 uppercase tracking-[0.18em] font-semibold">
                Pairing request
              </div>
              <h2 className="text-lg font-semibold text-ink-100 leading-tight">
                Connect <span className="text-accent-400">{state.client}</span> to Keying
              </h2>
              <p className="text-sm text-ink-400 leading-relaxed">
                Enter this code in the browser extension to finish pairing.
              </p>
            </div>

            <div className="flex gap-1.5 select-all">
              {state.code.split("").map((digit, i) => (
                <div
                  key={i}
                  className="flex-1 aspect-[3/4] flex items-center justify-center bg-ink-950 border border-ink-800 rounded-lg font-mono text-2xl font-medium text-ink-100"
                >
                  {digit}
                </div>
              ))}
            </div>

            <p className="text-xs text-ink-500 leading-relaxed">
              Code expires in 90 seconds. If you didn't trigger this, click Cancel — only pair browsers you trust.
            </p>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  window.vault.cancelPairing();
                  setState({ kind: "idle" });
                }}
                className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-sm rounded-md px-4 py-2 transition"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <div className="text-xs text-accent-400 uppercase tracking-widest">Paired</div>
              <h2 className="text-xl font-semibold text-ink-100">
                {state.client} is connected.
              </h2>
              <p className="text-sm text-ink-400">
                You can now autofill from this browser when the vault is unlocked.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
