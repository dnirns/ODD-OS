import { applyChanges, type FileChange } from "../fs/changes";
import type { Disk } from "../fs/disk";
import { normaliseName } from "../fs/names";
import { createFilesystem } from "../fs/seed";
import type { Attributes, FileContent, FileEntry } from "../fs/types";

export const FORMAT = 1;

export type KeptRecord = {
  readonly format: typeof FORMAT;
  readonly files: readonly FileChange[];
};

export type RecordRead =
  | { readonly kind: "changes"; readonly changes: readonly FileChange[] }
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

export const toRecord = (changes: readonly FileChange[]): KeptRecord => ({ format: FORMAT, files: changes });

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

const toChange = (value: unknown): FileChange | undefined => {
  if (!isObject(value) || !Array.isArray(value.directory) || !value.directory.every(isName)) {
    return undefined;
  }
  const file = toFile(value.file);
  return file && { directory: [...value.directory], file };
};

// Stored values come from outside the programme: everything is checked, and
// one bad file makes the whole record invalid.
export const readRecord = (value: unknown): RecordRead => {
  if (!isObject(value)) return { kind: "invalid" };
  const { format } = value;
  if (typeof format !== "number" || !Number.isInteger(format)) return { kind: "invalid" };
  if (format > FORMAT) return { kind: "newer" };
  if (format !== FORMAT || !Array.isArray(value.files)) return { kind: "invalid" };

  const changes = value.files.map(toChange);
  return changes.every((change) => change !== undefined)
    ? { kind: "changes", changes }
    : { kind: "invalid" };
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
