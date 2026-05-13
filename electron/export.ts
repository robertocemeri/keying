import { randomUUID } from "crypto";
import type { Entry } from "./vault";

function csvEscape(value: string): string {
  if (value === "" || value == null) return "";
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function entriesToCsv(entries: Entry[]): string {
  const headers = [
    "folder",
    "title",
    "url",
    "username",
    "password",
    "totp",
    "notes",
  ];
  const lines: string[] = [headers.join(",")];
  for (const e of entries) {
    lines.push(
      [
        csvEscape(e.folder ?? ""),
        csvEscape(e.title ?? ""),
        csvEscape(e.url ?? ""),
        csvEscape(e.username ?? ""),
        csvEscape(e.password ?? ""),
        csvEscape(e.totpSecret ?? ""),
        csvEscape(e.notes ?? ""),
      ].join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

type BitwardenFolder = { id: string; name: string };

type BitwardenItem = {
  id: string;
  organizationId: null;
  folderId: string | null;
  type: 1;
  reprompt: 0;
  name: string;
  notes: string | null;
  favorite: false;
  login: {
    uris: { match: null; uri: string }[];
    username: string | null;
    password: string | null;
    totp: string | null;
  };
  collectionIds: null;
};

export function entriesToBitwardenJson(entries: Entry[]): string {
  const folderMap = new Map<string, BitwardenFolder>();
  for (const e of entries) {
    const name = (e.folder ?? "").trim();
    if (!name) continue;
    if (!folderMap.has(name)) {
      folderMap.set(name, { id: randomUUID(), name });
    }
  }

  const items: BitwardenItem[] = entries.map((e) => {
    const folderId =
      e.folder && folderMap.has(e.folder) ? folderMap.get(e.folder)!.id : null;
    const uris = e.url
      ? [{ match: null, uri: e.url }]
      : [];
    return {
      id: randomUUID(),
      organizationId: null,
      folderId,
      type: 1,
      reprompt: 0,
      name: e.title || "(untitled)",
      notes: e.notes ? e.notes : null,
      favorite: false,
      login: {
        uris,
        username: e.username || null,
        password: e.password || null,
        totp: e.totpSecret || null,
      },
      collectionIds: null,
    };
  });

  const payload = {
    encrypted: false,
    folders: Array.from(folderMap.values()),
    items,
  };
  return JSON.stringify(payload, null, 2);
}
