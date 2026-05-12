import { useEffect, useState } from "react";

export default function PasswordGenerator({ onUse }: { onUse: (pw: string) => void }) {
  const [length, setLength] = useState(20);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [value, setValue] = useState("");

  async function regen() {
    const pw = await window.vault.generatePassword({
      length,
      uppercase: upper,
      lowercase: lower,
      digits,
      symbols,
    });
    setValue(pw);
  }

  useEffect(() => {
    regen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length, upper, lower, digits, symbols]);

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-md p-4 space-y-3">
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-sm text-ink-100 bg-ink-950 border border-ink-800 rounded px-3 py-2 truncate select-text">
          {value || "—"}
        </code>
        <button
          type="button"
          onClick={regen}
          className="no-drag border border-ink-700 hover:bg-ink-800 text-ink-100 text-xs rounded-md px-3 py-2 transition"
        >
          Regenerate
        </button>
        <button
          type="button"
          onClick={() => onUse(value)}
          className="no-drag bg-accent-500 hover:bg-accent-400 text-ink-950 text-xs font-medium rounded-md px-3 py-2 transition"
        >
          Use
        </button>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-xs text-ink-400 w-16 shrink-0">Length</span>
        <input
          type="range"
          min={8}
          max={64}
          value={length}
          onChange={(e) => setLength(parseInt(e.target.value))}
          className="no-drag flex-1 accent-accent-500"
        />
        <span className="font-mono text-xs text-ink-300 w-6 text-right">{length}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Toggle label="A-Z" checked={upper} onChange={setUpper} />
        <Toggle label="a-z" checked={lower} onChange={setLower} />
        <Toggle label="0-9" checked={digits} onChange={setDigits} />
        <Toggle label="!@#$" checked={symbols} onChange={setSymbols} />
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="no-drag flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent-500"
      />
      <span className="text-ink-200 font-mono text-xs">{label}</span>
    </label>
  );
}
