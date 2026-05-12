import { useEffect, useRef, useState } from "react";
import FolderSettingsPanel from "./FolderSettingsPanel";
import type { FolderSettings } from "../types";

type Props = {
  folders: string[];
  counts: Record<string, number>;
  folderSettings: Record<string, FolderSettings>;
  selected: string;
  onSelect: (key: string) => void;
  onCreate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onReorder: (next: string[]) => void;
  onSettingsChanged: () => void;
  unfiledKey: string;
  allKey: string;
};

export default function FolderSidebar({
  folders,
  counts,
  folderSettings,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  onSettingsChanged,
  unfiledKey,
  allKey,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isCustom = selected !== allKey && selected !== unfiledKey;

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? folders.filter((f) => f.toLowerCase().includes(q)) : folders;
  const searching = searchOpen && q.length > 0;

  return (
    <aside className="border-r border-ink-800/60 flex flex-col min-h-0">
      <div className="px-4 pt-4 pb-2 h-12 flex items-center gap-2">
        {searchOpen ? (
          <>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
              placeholder="Search folders"
              className="no-drag flex-1 min-w-0 bg-ink-900 border border-ink-700 focus:border-accent-500 outline-none rounded-md px-2.5 py-1.5 text-xs text-ink-100 placeholder:text-ink-500"
            />
            <button
              onClick={closeSearch}
              title="Close search (Esc)"
              className="no-drag h-7 w-7 grid place-items-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100 transition"
            >
              <Icon name="x" />
            </button>
          </>
        ) : (
          <>
            <h2 className="flex-1 text-xs font-semibold tracking-wider uppercase text-ink-400">
              Folders
            </h2>
            <button
              onClick={() => setSearchOpen(true)}
              title="Search folders"
              className="no-drag h-7 w-7 grid place-items-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100 transition"
            >
              <Icon name="search" />
            </button>
            <button
              onClick={onCreate}
              title="New folder"
              className="no-drag h-7 w-7 grid place-items-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100 transition"
            >
              <Icon name="plus" />
            </button>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {!searching && (
          <>
            <FolderItem
              label="All items"
              count={counts[allKey] ?? 0}
              active={selected === allKey}
              onClick={() => onSelect(allKey)}
              icon="□"
            />
            <FolderItem
              label="Unfiled"
              count={counts[unfiledKey] ?? 0}
              active={selected === unfiledKey}
              onClick={() => onSelect(unfiledKey)}
              icon="·"
              muted
            />
            {folders.length > 0 && (
              <div className="pt-3 pb-1 px-3 text-[10px] font-semibold tracking-wider uppercase text-ink-500">
                Yours
              </div>
            )}
          </>
        )}

        <DraggableList
          items={filtered}
          allItems={folders}
          counts={counts}
          folderSettings={folderSettings}
          selected={selected}
          onSelect={onSelect}
          onReorder={onReorder}
          dragDisabled={searching}
        />

        {searching && filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-ink-500">
            No folders match "{query}".
          </div>
        )}
      </nav>

      {isCustom && !searching && (
        <FolderSettingsPanel
          folderName={selected}
          onRename={onRename}
          onDelete={onDelete}
          onChanged={onSettingsChanged}
        />
      )}
    </aside>
  );
}

function DraggableList({
  items,
  allItems,
  counts,
  folderSettings,
  selected,
  onSelect,
  onReorder,
  dragDisabled,
}: {
  items: string[];
  allItems: string[];
  counts: Record<string, number>;
  folderSettings: Record<string, FolderSettings>;
  selected: string;
  onSelect: (key: string) => void;
  onReorder: (next: string[]) => void;
  dragDisabled: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDrop(targetIdx: number) {
    if (dragIndex === null || dragIndex === targetIdx) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...allItems];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIdx, 0, moved);
    onReorder(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <ul className="space-y-0.5">
      {items.map((name) => {
        // Map filtered index back to full list index for correct drop targets
        const idx = allItems.indexOf(name);
        const isOver = overIndex === idx;
        return (
          <li
            key={name}
            draggable={!dragDisabled}
            onDragStart={(e) => {
              setDragIndex(idx);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", name);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(idx);
              e.dataTransfer.dropEffect = "move";
            }}
            onDragLeave={() => {
              if (overIndex === idx) setOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(idx);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={isOver && dragIndex !== idx ? "border-t-2 border-accent-500" : ""}
          >
            <FolderItem
              label={name}
              count={counts[name] ?? 0}
              active={selected === name}
              onClick={() => onSelect(name)}
              icon="≡"
              dim={dragIndex === idx}
              settings={folderSettings[name]}
            />
          </li>
        );
      })}
    </ul>
  );
}

function FolderItem({
  label,
  count,
  active,
  onClick,
  icon,
  muted,
  dim,
  settings,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: string;
  muted?: boolean;
  dim?: boolean;
  settings?: FolderSettings;
}) {
  const autofillOff = !!settings?.autofillDisabled;
  return (
    <button
      onClick={onClick}
      className={[
        "no-drag w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition",
        active
          ? "bg-ink-800 text-ink-100"
          : "text-ink-300 hover:bg-ink-900 hover:text-ink-100",
        dim ? "opacity-40" : "",
      ].join(" ")}
    >
      <span className={["text-xs w-4 shrink-0", muted ? "text-ink-500" : "text-ink-500"].join(" ")}>
        {icon}
      </span>
      <span className="truncate flex-1 text-left">{label}</span>
      {autofillOff && (
        <span
          title="Autofill disabled"
          className="text-[9px] font-semibold uppercase tracking-wider text-amber-400 shrink-0"
        >
          off
        </span>
      )}
      <span className="text-[10px] font-mono text-ink-500 shrink-0">{count}</span>
    </button>
  );
}

function Icon({ name }: { name: "search" | "plus" | "x" }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  }
  if (name === "plus") {
    return (
      <svg {...common}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
