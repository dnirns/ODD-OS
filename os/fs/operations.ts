import { ARCHIVE, fileSize } from "./entries";
import { locate } from "./path";
import {
  type Attributes,
  type DirectoryEntry,
  fail,
  type FileContent,
  type FileEntry,
  type Filesystem,
  ok,
  type Result,
} from "./types";

export type Listing = {
  readonly name: string;
  readonly kind: "file" | "directory";
  readonly modified: Date;
  readonly attributes: Attributes;
  readonly size: number;
};

export const readFile = (
  fs: Filesystem,
  cwd: string,
  path: string,
): Result<FileContent> => {
  const located = locate(fs, cwd, path);

  switch (located.kind) {
    case "error":
      return fail(located.error);
    case "missing":
      return fail("FileNotFound");
    case "found":
      return located.entry.kind === "directory"
        ? fail("IsADirectory")
        : ok(located.entry.content);
  }
};

export const listDirectory = (
  fs: Filesystem,
  cwd: string,
  path: string,
): Result<readonly Listing[]> => {
  const located = locate(fs, cwd, path);

  switch (located.kind) {
    case "error":
      return fail(located.error);
    case "missing":
      return fail("FileNotFound");
    case "found":
      return located.entry.kind === "file"
        ? fail("NotADirectory")
        : ok(
            located.entry.entries.map((entry) => ({
              name: entry.name,
              kind: entry.kind,
              modified: entry.modified,
              attributes: entry.attributes,
              size: entry.kind === "file" ? fileSize(entry) : 0,
            })),
          );
  }
};

const updateDirectory = (
  directory: DirectoryEntry,
  names: readonly string[],
  update: (target: DirectoryEntry) => DirectoryEntry,
): DirectoryEntry => {
  const [name, ...rest] = names;

  if (name === undefined) return update(directory);

  return {
    ...directory,
    entries: directory.entries.map((entry) =>
      entry.kind === "directory" && entry.name === name
        ? updateDirectory(entry, rest, update)
        : entry,
    ),
  };
};

const withEntries = (
  fs: Filesystem,
  names: readonly string[],
  update: (entries: DirectoryEntry["entries"]) => DirectoryEntry["entries"],
): Filesystem => ({
  root: updateDirectory(fs.root, names, (target) => ({
    ...target,
    entries: update(target.entries),
  })),
});

const written = (
  name: string,
  text: string,
  now: Date,
  attributes: Attributes,
): FileEntry => ({
  kind: "file",
  name,
  modified: new Date(now.getTime()),
  attributes: { ...attributes, archive: true },
  content: { kind: "text", text },
});

export const writeFile = (
  fs: Filesystem,
  cwd: string,
  path: string,
  text: string,
  now: Date,
): Result<Filesystem> => {
  const located = locate(fs, cwd, path);

  switch (located.kind) {
    case "error":
      return fail(located.error);

    case "missing":
      return ok(
        withEntries(fs, located.parent, (entries) => [
          ...entries,
          written(located.name, text, now, ARCHIVE),
        ]),
      );

    case "found": {
      const { entry, names } = located;

      if (entry.kind === "directory") return fail("IsADirectory");
      if (entry.attributes.readOnly) return fail("AccessDenied");

      return ok(
        withEntries(fs, names.slice(0, -1), (entries) =>
          entries.map((existing) =>
            existing === entry
              ? written(entry.name, text, now, entry.attributes)
              : existing,
          ),
        ),
      );
    }
  }
};
