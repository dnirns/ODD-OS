import { applyChanges, type DiskChanges, type EntryChange, type KeptDirectory, type KeptEntry } from "../fs/changes";
import type { Disk } from "../fs/disk";
import { normaliseName } from "../fs/names";
import { createFilesystem } from "../fs/seed";
import type { Attributes, FileContent, FileEntry } from "../fs/types";

// Format 1 kept only files. Format 2 also keeps new directories and the
// shipped entries the visitor removed.
export const FORMAT = 2;

export type KeptRecord = {
  readonly format: typeof FORMAT;
  readonly removed: readonly (readonly string[])[];
  readonly entries: readonly EntryChange[];
};

export type RecordRead =
  | { readonly kind: "changes"; readonly changes: DiskChanges }
  | { readonly kind: "invalid" }
  | { readonly kind: "newer" };

// What reading browser storage gave: nothing usable, too slow, or a value
// (`undefined` when nothing has been stored).
export type StoreRead =
  | { readonly kind: "unavailable" }
  | { readonly kind: "timeout" }
  | { readonly kind: "read"; readonly value: unknown };

export type StartingDisk = {
  readonly disk: Disk;
  readonly saving: boolean;
};

export const toRecord = ({ removed, entries }: DiskChanges): KeptRecord => ({ format: FORMAT, removed, entries });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isName = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const normalised = normaliseName(value);
  return normalised.ok && normalised.value === value;
};

const isDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const ATTRIBUTE_NAMES = ["readOnly", "hidden", "system", "archive"] as const;

const toAttributes = (value: unknown): Attributes | undefined => {
  if (!isObject(value) || !ATTRIBUTE_NAMES.every((name) => typeof value[name] === "boolean")) {
    return undefined;
  }
  return {
    readOnly: value.readOnly === true,
    hidden: value.hidden === true,
    system: value.system === true,
    archive: value.archive === true,
  };
};

const toContent = (value: unknown): FileContent | undefined => {
  if (!isObject(value)) return undefined;
  if (value.kind === "text" && typeof value.text === "string") return { kind: "text", text: value.text };
  const { size } = value;
  if (value.kind === "opaque" && typeof size === "number" && Number.isInteger(size) && size >= 0) {
    return { kind: "opaque", size };
  }
  return undefined;
};

const toFile = (value: unknown): FileEntry | undefined => {
  if (!isObject(value) || value.kind !== "file" || !isName(value.name) || !isDate(value.modified)) {
    return undefined;
  }
  const attributes = toAttributes(value.attributes);
  const content = toContent(value.content);
  if (!attributes || !content) return undefined;

  return {
    kind: "file",
    name: value.name,
    modified: new Date(value.modified.getTime()),
    attributes,
    content,
  };
};

const toDirectory = (value: unknown): KeptDirectory | undefined => {
  if (!isObject(value) || value.kind !== "directory" || !isName(value.name) || !isDate(value.modified)) {
    return undefined;
  }
  const attributes = toAttributes(value.attributes);
  return attributes && {
    kind: "directory",
    name: value.name,
    modified: new Date(value.modified.getTime()),
    attributes,
  };
};

const toEntry = (value: unknown): KeptEntry | undefined => toFile(value) ?? toDirectory(value);

const toNames = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every(isName) ? [...value] : undefined;

const toChange = (
  value: unknown,
  readEntry: (entry: unknown) => KeptEntry | undefined,
  key: "file" | "entry",
): EntryChange | undefined => {
  if (!isObject(value)) return undefined;
  const directory = toNames(value.directory);
  const entry = readEntry(value[key]);
  return directory && entry && { directory, entry };
};

const allOrNothing = <T>(values: readonly (T | undefined)[]): readonly T[] | undefined =>
  values.every((value) => value !== undefined) ? values.filter((value) => value !== undefined) : undefined;

const toRemoval = (value: unknown) => {
  const names = toNames(value);
  return names && names.length > 0 ? names : undefined;
};

const readChanges = (value: Record<string, unknown>, format: number): DiskChanges | undefined => {
  if (format === 1) {
    if (!Array.isArray(value.files)) return undefined;
    const entries = allOrNothing(value.files.map((file) => toChange(file, toFile, "file")));
    return entries && { removed: [], entries };
  }
  if (!Array.isArray(value.removed) || !Array.isArray(value.entries)) return undefined;
  const removed = allOrNothing(value.removed.map(toRemoval));
  const entries = allOrNothing(value.entries.map((entry) => toChange(entry, toEntry, "entry")));
  return removed && entries && { removed, entries };
};

// Stored values come from outside the programme: everything is checked, and
// one bad entry makes the whole record invalid. Records of the earlier
// format are still read.
export const readRecord = (value: unknown): RecordRead => {
  if (!isObject(value)) return { kind: "invalid" };
  const { format } = value;
  if (typeof format !== "number" || !Number.isInteger(format)) return { kind: "invalid" };
  if (format > FORMAT) return { kind: "newer" };
  if (format < 1) return { kind: "invalid" };

  const changes = readChanges(value, format);
  return changes ? { kind: "changes", changes } : { kind: "invalid" };
};

const startWith = (filesystem: Disk["filesystem"], saving: boolean): StartingDisk => ({
  disk: { filesystem, cwd: "C:\\" },
  saving,
});

export const startingDisk = (read: StoreRead): StartingDisk => {
  if (read.kind !== "read") return startWith(createFilesystem(), false);
  if (read.value === undefined) return startWith(createFilesystem(), true);

  const record = readRecord(read.value);
  switch (record.kind) {
    case "invalid":
      return startWith(createFilesystem(), true);
    case "newer":
      return startWith(createFilesystem(), false);
    case "changes":
      return startWith(applyChanges(createFilesystem(), record.changes), true);
  }
};
