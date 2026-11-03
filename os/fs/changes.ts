import { findChild } from "./entries";
import type {
  Attributes,
  DirectoryEntry,
  Entry,
  FileContent,
  FileEntry,
  Filesystem,
} from "./types";

// A directory as it is kept: its own details, without its entries, which are
// kept separately when they differ from the shipped disk.
export type KeptDirectory = {
  readonly kind: "directory";
  readonly name: string;
  readonly modified: Date;
  readonly attributes: Attributes;
};

export type KeptEntry = FileEntry | KeptDirectory;

// An entry that differs from the shipped disk, with the names of its
// directory below C:\ (empty for the root).
export type EntryChange = {
  readonly directory: readonly string[];
  readonly entry: KeptEntry;
};

// Everything that makes the visitor's disk differ from the shipped one: the
// shipped entries no longer there, by their full names below C:\, and the
// new or changed entries, in listing order with each directory before its
// contents.
export type DiskChanges = {
  readonly removed: readonly (readonly string[])[];
  readonly entries: readonly EntryChange[];
};

const sameAttributes = (a: Attributes, b: Attributes) =>
  a.readOnly === b.readOnly &&
  a.hidden === b.hidden &&
  a.system === b.system &&
  a.archive === b.archive;

const sameContent = (a: FileContent, b: FileContent) =>
  a.kind === "text"
    ? b.kind === "text" && a.text === b.text
    : b.kind === "opaque" && a.size === b.size;

const sameDetails = (a: Entry, b: Entry) =>
  a.name === b.name &&
  a.modified.getTime() === b.modified.getTime() &&
  sameAttributes(a.attributes, b.attributes);

const sameFile = (a: FileEntry, b: FileEntry) => sameDetails(a, b) && sameContent(a.content, b.content);

const counterpartOf = (directory: DirectoryEntry | undefined, entry: Entry) => {
  const found = directory && findChild(directory, entry.name);
  return found?.kind === entry.kind ? found : undefined;
};

const keptDirectory = ({ name, modified, attributes }: DirectoryEntry): KeptDirectory => ({
  kind: "directory",
  name,
  modified,
  attributes,
});

const removedEntries = (
  shipped: DirectoryEntry,
  current: DirectoryEntry,
  names: readonly string[],
): readonly (readonly string[])[] =>
  shipped.entries.flatMap((entry) => {
    const kept = counterpartOf(current, entry);

    if (kept === undefined) return [[...names, entry.name]];
    return entry.kind === "directory" && kept.kind === "directory"
      ? removedEntries(entry, kept, [...names, entry.name])
      : [];
  });

const changedEntries = (
  current: DirectoryEntry,
  shipped: DirectoryEntry | undefined,
  names: readonly string[],
): readonly EntryChange[] =>
  current.entries.flatMap((entry): readonly EntryChange[] => {
    const original = counterpartOf(shipped, entry);

    if (entry.kind === "file") {
      return original?.kind === "file" && sameFile(original, entry) ? [] : [{ directory: names, entry }];
    }

    const inside = changedEntries(
      entry,
      original?.kind === "directory" ? original : undefined,
      [...names, entry.name],
    );
    return original && sameDetails(original, entry)
      ? inside
      : [{ directory: names, entry: keptDirectory(entry) }, ...inside];
  });

export const diskChanges = (shipped: Filesystem, current: Filesystem): DiskChanges => ({
  removed: removedEntries(shipped.root, current.root, []),
  entries: changedEntries(current.root, shipped.root, []),
});

const inDirectory = (
  directory: DirectoryEntry,
  names: readonly string[],
  update: (target: DirectoryEntry) => DirectoryEntry,
): DirectoryEntry => {
  const [name, ...rest] = names;
  if (name === undefined) return update(directory);

  return {
    ...directory,
    entries: directory.entries.map((entry) =>
      entry.kind === "directory" && entry.name === name ? inDirectory(entry, rest, update) : entry,
    ),
  };
};

const directoryAt = (root: DirectoryEntry, names: readonly string[]): DirectoryEntry | undefined =>
  names.reduce<DirectoryEntry | undefined>((directory, name) => {
    const child = directory && findChild(directory, name);
    return child?.kind === "directory" ? child : undefined;
  }, root);

const withoutEntry = (root: DirectoryEntry, path: readonly string[]): DirectoryEntry => {
  const name = path[path.length - 1];
  if (name === undefined) return root;

  return inDirectory(root, path.slice(0, -1), (directory) => ({
    ...directory,
    entries: directory.entries.filter((entry) => entry.name !== name),
  }));
};

// A kept entry replaces a shipped entry of the same name and kind in place, a
// kept directory keeping the shipped entries inside it, or follows the
// directory's entries. A name that is now an entry of the other kind keeps
// the shipped entry.
const placeEntry = (directory: DirectoryEntry, kept: KeptEntry): DirectoryEntry => {
  const existing = findChild(directory, kept.name);

  if (existing === undefined) {
    const added: Entry = kept.kind === "file" ? kept : { ...kept, entries: [] };
    return { ...directory, entries: [...directory.entries, added] };
  }
  const replacement: Entry | undefined =
    kept.kind === "file"
      ? existing.kind === "file" ? kept : undefined
      : existing.kind === "directory" ? { ...existing, ...kept } : undefined;
  if (replacement === undefined) return directory;

  return {
    ...directory,
    entries: directory.entries.map((entry) => (entry === existing ? replacement : entry)),
  };
};

// Lays the visitor's changes over a shipped disk: first the removals, then
// each kept entry in order. An entry whose directory is missing is dropped,
// and so is everything inside it, because its own directory is then missing.
export const applyChanges = (shipped: Filesystem, { removed, entries }: DiskChanges): Filesystem => {
  const emptied = removed.reduce(withoutEntry, shipped.root);

  return {
    root: entries.reduce(
      (root, { directory, entry }) =>
        directoryAt(root, directory) ? inDirectory(root, directory, (target) => placeEntry(target, entry)) : root,
      emptied,
    ),
  };
};
