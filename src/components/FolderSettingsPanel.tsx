import { useEffect, useState } from "react";
import type { FolderSettings } from "../types";

type Props = {
  folderName: string;
  onRename: () => void;
  onDelete: () => void;
  onChanged?: () => void;
};

export default function FolderSettingsPanel({ folderName, onRename, onDelete, onChanged }: Props) {
  const [settings, setSettings] = useState<FolderSettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    window.vault.getFolderSettings(folderName).then((s) => {
      if (alive) {
        setSettings(s);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [folderName]);

  async function toggle(key: keyof FolderSettings, value: boolean) {
    const next = { ...settings, [key]: value || undefined };
    setSettings(next);
    await window.vault.setFolderSettings(folderName, { [key]: value || undefined });
    onChanged?.();
  }

  return (
    <div className="px-2 pb-3 border-t border-ink-800/60 pt-2 space-y-2">
      <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        Folder settings
      </div>

      <div className="px-3 space-y-2">
        <Toggle
          label="Exclude from autofill"
          checked={!!settings.autofillDisabled}
          disabled={loading}
          onChange={(v) => toggle("autofillDisabled", v)}
        />
      </div>

      <div className="pt-1 space-y-1">
        <button
          onClick={onRename}
          className="no-drag w-full text-left px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-800 rounded-md transition"
        >
          Rename folder
        </button>
        <button
          onClick={onDelete}
          className="no-drag w-full text-left px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/30 rounded-md transition"
        >
          Delete folder
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="no-drag flex items-start gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-accent-500"
      />
      <span className="text-xs text-ink-200 leading-tight">{label}</span>
    </label>
  );
}
