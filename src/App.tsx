import { useEffect, useState } from "react";
import SetupScreen from "./components/SetupScreen";
import UnlockScreen from "./components/UnlockScreen";
import VaultScreen from "./components/VaultScreen";
import PairingOverlay from "./components/PairingOverlay";
import ImportModal from "./components/ImportModal";
import ExportModal from "./components/ExportModal";
import SettingsDrawer from "./components/SettingsDrawer";
import "./types";

type AppState =
  | { kind: "loading" }
  | { kind: "setup" }
  | { kind: "unlock"; touchIDAvailable: boolean; hasTouchIDKey: boolean }
  | { kind: "unlocked" };

export default function App() {
  const [state, setState] = useState<AppState>({ kind: "loading" });
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    const offLock = window.vault.onLockEvent(() => {
      setSettingsOpen(false);
      boot();
    });
    const offSettings = window.vault.onSettingsRequested(() => {
      setSettingsOpen(true);
    });
    return () => {
      offLock();
      offSettings();
    };
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-ink-950 text-ink-100">
      <div className="drag-region h-9 w-full shrink-0 border-b border-ink-800/60 flex items-center">
        <div className="ml-[78px] flex items-center gap-2 text-[11px] font-medium tracking-wide text-ink-300 select-none">
          <span
            aria-hidden="true"
            className="w-3.5 h-3.5 rounded-[3px] shrink-0 relative"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, #c9f062, #a3e635 60%, #65a30d 100%)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.3)",
            }}
          >
            <span
              className="absolute"
              style={{
                inset: "3px",
                background: "#0a0a0c",
                clipPath:
                  "polygon(0 40%, 60% 40%, 60% 0, 75% 0, 75% 60%, 0 60%)",
              }}
            />
          </span>
          <span>Keyring</span>
        </div>
      </div>
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
          <VaultScreen
            onLocked={() => boot()}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </div>
      <PairingOverlay />
      <ImportModal
        onImported={() => window.dispatchEvent(new CustomEvent("keyring:import-complete"))}
      />
      <ExportModal />
      <SettingsDrawer
        open={settingsOpen && state.kind === "unlocked"}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
