import { useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "../types";

const MAX_ROWS = 6;

export default function OverlayApp() {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh() {
    setLoading(true);
    const u = await window.vault.isUnlocked();
    setUnlocked(u);
    if (u) {
      const list = await window.vault.list();
      setEntries(list);
    } else {
      setEntries([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const offLock = window.vault.onLockEvent(() => refresh());
    const offShown = window.vault.onOverlayShown(() => {
      setQuery("");
      setSelectedIdx(0);
      setToast(null);
      inputRef.current?.focus();
      inputRef.current?.select();
      refresh();
    });
    return () => {
      offLock();
      offShown();
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [unlocked]);

  const filtered = useMemo(() => {
    if (!unlocked) return [];
    const q = query.trim().toLowerCase();
    if (!q) {
      // No query: show most recently updated first, capped.
      return [...entries]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_ROWS * 2);
    }
    const scored: { e: Entry; score: number }[] = [];
    for (const e of entries) {
      const hay = (
        e.title +
        " " +
        e.username +
        " " +
        e.url +
        " " +
        (e.folder || "")
      ).toLowerCase();
      const idx = hay.indexOf(q);
      if (idx >= 0) {
        scored.push({ e, score: idx + (e.title.toLowerCase().startsWith(q) ? -100 : 0) });
      }
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, MAX_ROWS * 4).map((s) => s.e);
  }, [entries, query, unlocked]);

  useEffect(() => {
    if (selectedIdx >= filtered.length) setSelectedIdx(0);
  }, [filtered, selectedIdx]);

  function flash(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1200);
  }

  async function copyAndClose(e: Entry, field: "username" | "password" | "totp") {
    if (!e) return;
    let value = "";
    let label = "";
    if (field === "password") {
      value = e.password;
      label = "Password";
    } else if (field === "username") {
      value = e.username;
      label = "Username";
    } else {
      if (!e.totpSecret) {
        flash("No 2FA code on this entry");
        return;
      }
      const c = await window.vault.totpCode(e.id);
      if (!c) {
        flash("Couldn't generate code");
        return;
      }
      value = c.code;
      label = "Code";
    }
    if (!value) {
      flash(`No ${label.toLowerCase()} on this entry`);
      return;
    }
    window.vault.copyToClipboard(value);
    flash(`${label} copied`);
    if (field === "password") {
      setTimeout(() => window.vault.clearClipboard(), 30_000);
    }
    setTimeout(() => window.vault.hideOverlay(), 220);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      window.vault.hideOverlay();
      return;
    }
    if (!filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = filtered[selectedIdx];
      if (!sel) return;
      const field =
        e.shiftKey ? "totp" :
        e.metaKey || e.ctrlKey ? "username" :
        "password";
      copyAndClose(sel, field);
    } else if (e.key === "Tab") {
      e.preventDefault();
      setSelectedIdx((i) => (i + 1) % filtered.length);
    }
  }

  const visible = filtered.slice(0, MAX_ROWS);

  return (
    <div className="h-screen w-screen bg-ink-900/95 backdrop-blur-xl flex flex-col text-ink-100 select-none">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg grid place-items-center bg-ink-950 border border-ink-800 shrink-0">
            <KeyholeIcon />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={unlocked ? "Search Keying…" : "Vault is locked"}
            disabled={!unlocked}
            className="flex-1 bg-transparent text-lg outline-none placeholder:text-ink-500 disabled:opacity-60"
            autoFocus
          />
          {toast ? (
            <span className="text-xs uppercase tracking-wider text-accent-400 shrink-0">{toast}</span>
          ) : (
            <Kbd>↵ pw</Kbd>
          )}
        </div>
      </div>

      <div className="h-px bg-ink-800/80" />

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!unlocked ? (
          <LockedState />
        ) : loading ? (
          <div className="px-3 py-6 text-sm text-ink-500">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="px-3 py-6 text-sm text-ink-500">
            {query ? `No matches for "${query}".` : "No entries yet."}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((e, i) => (
              <Row
                key={e.id}
                entry={e}
                selected={i === selectedIdx}
                onClick={() => copyAndClose(e, "password")}
                onUsername={() => copyAndClose(e, "username")}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 py-2.5 border-t border-ink-800/80 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-500">
        <span className="flex items-center gap-2">
          <Kbd>↑↓</Kbd> Nav
          <Kbd>↵</Kbd> Pw
          <Kbd>⌘↵</Kbd> User
          <Kbd>⇧↵</Kbd> 2FA
        </span>
        <span className="flex items-center gap-2">
          <Kbd>Esc</Kbd> Close
        </span>
      </div>
    </div>
  );
}

function Row({
  entry,
  selected,
  onClick,
  onUsername,
}: {
  entry: Entry;
  selected: boolean;
  onClick: () => void;
  onUsername: () => void;
}) {
  return (
    <li>
      <div
        onClick={onClick}
        className={[
          "flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition",
          selected ? "bg-ink-800" : "hover:bg-ink-800/60",
        ].join(" ")}
      >
        <Avatar text={entry.title} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink-100">
            {entry.title || "(untitled)"}
          </div>
          <div className="truncate text-xs text-ink-400">
            {entry.username || (entry.url ? safeHostname(entry.url) : "—")}
          </div>
        </div>
        {entry.totpSecret && (
          <span
            title="Has a 2FA code (Shift+Enter)"
            className="text-[10px] uppercase tracking-wider text-accent-400 shrink-0"
          >
            2FA
          </span>
        )}
        {entry.folder && (
          <span className="text-[10px] uppercase tracking-wider text-ink-500 shrink-0">
            {entry.folder}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUsername();
          }}
          className="text-[10px] uppercase tracking-wider text-ink-400 hover:text-ink-100 border border-ink-700 rounded px-2 py-1 transition"
        >
          User
        </button>
      </div>
    </li>
  );
}

function Avatar({ text }: { text: string }) {
  const initial = (text.trim()[0] || "?").toUpperCase();
  const hue = (text.charCodeAt(0) * 47) % 360;
  return (
    <div
      className="h-8 w-8 rounded-md grid place-items-center text-xs font-semibold text-ink-950 shrink-0"
      style={{ background: `hsl(${hue} 70% 70%)` }}
    >
      {initial}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-sans text-[10px] uppercase tracking-wider bg-ink-950 border border-ink-800 rounded px-1.5 py-0.5 text-ink-300">
      {children}
    </kbd>
  );
}

function KeyholeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="9" r="4" fill="#a3e635" />
      <rect x="9.5" y="11.5" width="5" height="9" rx="1.5" fill="#a3e635" />
    </svg>
  );
}

function LockedState() {
  return (
    <div className="h-full grid place-items-center px-6 text-center">
      <div className="space-y-3 max-w-sm">
        <div className="text-sm font-medium text-ink-200">Keying is locked</div>
        <p className="text-xs text-ink-400 leading-relaxed">
          Unlock Keying in the main window. The overlay only works when the vault is open.
        </p>
        <button
          onClick={() => window.vault.hideOverlay()}
          className="text-xs text-ink-300 hover:text-ink-100 underline underline-offset-2"
        >
          Close (Esc)
        </button>
      </div>
    </div>
  );
}

function safeHostname(u: string): string {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}
