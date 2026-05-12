import { useEffect, useState } from "react";
import SetupScreen from "./components/SetupScreen";
import UnlockScreen from "./components/UnlockScreen";
import VaultScreen from "./components/VaultScreen";
import PairingOverlay from "./components/PairingOverlay";
import ImportModal from "./components/ImportModal";
import "./types";

type AppState =
  | { kind: "loading" }
  | { kind: "setup" }
  | { kind: "unlock"; touchIDAvailable: boolean; hasTouchIDKey: boolean }
  | { kind: "unlocked" };

export default function App() {
  const [state, setState] = useState<AppState>({ kind: "loading" });

  async function boot() {
    const exists = await window.vault.vaultExists();
    if (!exists) {
      setState({ kind: "setup" });
      return;
    }
    const [touchIDAvailable, hasTouchIDKey, unlocked] = await Promise.all([
      window.vault.isTouchIDAvailable(),
      window.vault.hasTouchIDSetup(),
      window.vault.isUnlocked(),
    ]);
    if (unlocked) {
      setState({ kind: "unlocked" });
    } else {
      setState({ kind: "unlock", touchIDAvailable, hasTouchIDKey });
    }
  }

  useEffect(() => {
    boot();
    const off = window.vault.onLockEvent(() => boot());
    return off;
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-ink-950 text-ink-100">
      <div className="drag-region h-9 w-full shrink-0 border-b border-ink-800/60" />
      <div className="flex-1 min-h-0">
        {state.kind === "loading" && (
          <div className="h-full grid place-items-center text-ink-400 text-sm">Loading…</div>
        )}
        {state.kind === "setup" && <SetupScreen onDone={boot} />}
        {state.kind === "unlock" && (
          <UnlockScreen
            touchIDAvailable={state.touchIDAvailable}
            hasTouchIDKey={state.hasTouchIDKey}
            onUnlocked={() => setState({ kind: "unlocked" })}
          />
        )}
        {state.kind === "unlocked" && (
          <VaultScreen onLocked={() => boot()} />
        )}
      </div>
      <PairingOverlay />
      <ImportModal
        onImported={() => window.dispatchEvent(new CustomEvent("keyring:import-complete"))}
      />
    </div>
  );
}
