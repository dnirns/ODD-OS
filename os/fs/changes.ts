import { findChild } from "./entries";
import type { DirectoryEntry, FileContent, FileEntry, Filesystem } from "./types";

// A file that differs from the shipped disk, with the names of its directory
// below C:\ (empty for the root).
export type FileChange = {
  readonly directory: readonly string[];
  readonly file: FileEntry;
};

const sameContent = (a: FileContent, b: FileContent) =>
  a.kind === "text"
    ? b.kind === "text" && a.text === b.text
    : b.kind === "opaque" && a.size === b.size;

const sameFile = (a: FileEntry, b: FileEntry) =>
  a.name === b.name &&
  a.modified.getTime() === b.modified.getTime() &&
  a.attributes.readOnly === b.attributes.readOnly &&
  a.attributes.hidden === b.attributes.hidden &&
  a.attributes.system === b.attributes.system &&
  a.attributes.archive === b.attributes.archive &&
  sameContent(a.content, b.content);

const directoryAt = (
  root: DirectoryEntry,
  names: readonly string[],
): DirectoryEntry | undefined =>
  names.reduce<DirectoryEntry | undefined>((directory, name) => {
    const child = directory && findChild(directory, name);
    return child?.kind === "directory" ? child : undefined;
  }, root);

// Every file in `current` that `shipped` does not have exactly, in listing
// order. New files are appended when written, so they come out in the order
// they were first written.
export const fileChanges = (shipped: Filesystem, current: Filesystem): readonly FileChange[] => {
  const walk = (
    directory: DirectoryEntry,
    names: readonly string[],
    counterpart: DirectoryEntry | undefined,
  ): readonly FileChange[] =>
    directory.entries.flatMap((entry) => {
      const original = counterpart && findChild(counterpart, entry.name);

      if (entry.kind === "directory") {
        return walk(entry, [...names, entry.name], original?.kind === "directory" ? original : undefined);
      }
      return original?.kind === "file" && sameFile(original, entry)
        ? []
        : [{ directory: names, file: entry }];
    });

  return walk(current.root, [], shipped.root);
};

const placeFile = (directory: DirectoryEntry, file: FileEntry): DirectoryEntry => {
  const existing = findChild(directory, file.name);

  if (existing?.kind === "directory") return directory;
  return {
    ...directory,
    entries: existing
      ? directory.entries.map((entry) => (entry === existing ? file : entry))
      : [...directory.entries, file],
  };
};

const withFile = (
  directory: DirectoryEntry,
  names: readonly string[],
  file: FileEntry,
): DirectoryEntry => {
  const [name, ...rest] = names;
  if (name === undefined) return placeFile(directory, file);

  return {
    ...directory,
    entries: directory.entries.map((entry) =>
      entry.kind === "directory" && entry.name === name ? withFile(entry, rest, file) : entry,
    ),
  };
};

// Lays kept files over the shipped disk. A file replaces a shipped file of the
// same name in place, or follows the directory's entries. A file whose
// directory is missing, or whose name is a shipped directory, is dropped.
export const applyChanges = (shipped: Filesystem, changes: readonly FileChange[]): Filesystem => ({
  root: changes.reduce(
    (root, { directory, file }) =>
      directoryAt(root, directory) ? withFile(root, directory, file) : root,
    shipped.root,
  ),
});
