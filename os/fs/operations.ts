import { ARCHIVE, fileSize, NO_ATTRIBUTES } from "./entries";
import { hasWildcard, matchesPattern, normaliseName, parsePattern } from "./names";
import { formatPath, locate, resolvePath } from "./path";
import {
  type Attributes,
  type DirectoryEntry,
  type Entry,
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

export type Found = {
  readonly path: string;
  readonly isRoot: boolean;
  readonly modified: Date;
  readonly entries: readonly Listing[];
};

const toListing = (entry: Entry): Listing => ({
  name: entry.name,
  kind: entry.kind,
  modified: entry.modified,
  attributes: entry.attributes,
  size: entry.kind === "file" ? fileSize(entry) : 0,
});

const LAST_SEPARATOR = /[\\/][^\\/]*$/;
const DRIVE_PREFIX = /^[A-Za-z]:/;

const splitSpec = (spec: string) => {
  const separator = LAST_SEPARATOR.exec(spec);
  if (separator) {
    const cut = separator.index + 1;
    return { directory: spec.slice(0, cut), last: spec.slice(cut) };
  }

  const drive = DRIVE_PREFIX.exec(spec);
  const length = drive ? drive[0].length : 0;
  return { directory: spec.slice(0, length), last: spec.slice(length) };
};

const dotEntry = (name: string, modified: Date): Listing => ({
  name,
  kind: "directory",
  modified,
  attributes: NO_ATTRIBUTES,
  size: 0,
});

// FAT stores `.` and `..` in every directory but the root. Neither is stored
// here, so both take the directory's own time.
const directoryFound = (path: string, entry: DirectoryEntry): Found => {
  const isRoot = path === "C:\\";

  return {
    path,
    isRoot,
    modified: entry.modified,
    entries: [
      ...(isRoot ? [] : [dotEntry(".", entry.modified), dotEntry("..", entry.modified)]),
      ...entry.entries.map(toListing),
    ],
  };
};

// Finds the entries a directory listing names: a directory's contents, one
// file, or the entries of a directory that match a wildcard pattern. Hidden
// entries are included, and so are `.` and `..` outside the root when they
// belong to the result.
export const findEntries = (
  fs: Filesystem,
  cwd: string,
  spec: string,
): Result<Found> => {
  const { directory, last } = splitSpec(spec);
  const parent = resolvePath(fs, cwd, directory === "" ? "." : directory);

  if (!parent.ok) {
    return fail(
      parent.error === "InvalidName" || parent.error === "NotADirectory"
        ? "PathNotFound"
        : parent.error,
    );
  }
  if (parent.value.entry.kind !== "directory") return fail("PathNotFound");

  const { path, entry: folder } = parent.value;

  if (last === "") return ok(directoryFound(path, folder));

  if (hasWildcard(last)) {
    const pattern = parsePattern(last);
    if (!pattern.ok) return fail(pattern.error);

    const found = directoryFound(path, folder);
    return ok({
      ...found,
      entries: found.entries.filter(({ name }) => matchesPattern(pattern.value, name)),
    });
  }

  const target = resolvePath(fs, cwd, spec);
  if (!target.ok) {
    return target.error === "FileNotFound"
      ? ok({ ...directoryFound(path, folder), entries: [] })
      : fail(target.error);
  }

  const { entry } = target.value;
  return entry.kind === "directory"
    ? ok(directoryFound(target.value.path, entry))
    : ok({ ...directoryFound(path, folder), entries: [toListing(entry)] });
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

// Writes a file with the given content, time and attributes: a copy, which
// keeps its source's time. A new file goes at the end of its directory and an
// existing one is replaced in place.
export const writeEntry = (
  fs: Filesystem,
  cwd: string,
  path: string,
  content: FileContent,
  modified: Date,
  attributes: Attributes,
): Result<Filesystem> => {
  const located = locate(fs, cwd, path);
  const file = (name: string): FileEntry => ({
    kind: "file",
    name,
    modified: new Date(modified.getTime()),
    attributes,
    content,
  });

  switch (located.kind) {
    case "error":
      return fail(located.error);

    case "missing":
      return ok(withEntries(fs, located.parent, (entries) => [...entries, file(located.name)]));

    case "found": {
      const { entry, names } = located;

      if (entry.kind === "directory") return fail("IsADirectory");
      if (entry.attributes.readOnly) return fail("AccessDenied");

      return ok(
        withEntries(fs, names.slice(0, -1), (entries) =>
          entries.map((existing) => (existing === entry ? file(entry.name) : existing)),
        ),
      );
    }
  }
};

export const createDirectory = (
  fs: Filesystem,
  cwd: string,
  path: string,
  now: Date,
): Result<Filesystem> => {
  const located = locate(fs, cwd, path);

  switch (located.kind) {
    case "error":
      return fail(located.error);
    case "found":
      return fail("AccessDenied");
    case "missing":
      return ok(
        withEntries(fs, located.parent, (entries) => [
          ...entries,
          {
            kind: "directory",
            name: located.name,
            modified: new Date(now.getTime()),
            attributes: NO_ATTRIBUTES,
            entries: [],
          },
        ]),
      );
  }
};

// Takes an entry out of its parent, leaving the others in order.
const without = (fs: Filesystem, names: readonly string[], entry: Entry): Filesystem =>
  withEntries(fs, names.slice(0, -1), (entries) => entries.filter((existing) => existing !== entry));

export const removeDirectory = (fs: Filesystem, cwd: string, path: string): Result<Filesystem> => {
  const located = locate(fs, cwd, path);

  switch (located.kind) {
    case "error":
      return fail(located.error);
    case "missing":
      return fail("PathNotFound");
    case "found": {
      const { entry, names } = located;

      if (entry.kind === "file") return fail("NotADirectory");
      if (names.length === 0 || entry.entries.length > 0) return fail("AccessDenied");

      return ok(without(fs, names, entry));
    }
  }
};

export const deleteFile = (fs: Filesystem, cwd: string, path: string): Result<Filesystem> => {
  const located = locate(fs, cwd, path);

  switch (located.kind) {
    case "error":
      return fail(located.error);
    case "missing":
      return fail("FileNotFound");
    case "found": {
      const { entry, names } = located;

      if (entry.kind === "directory") return fail("IsADirectory");
      if (entry.attributes.readOnly) return fail("AccessDenied");

      return ok(without(fs, names, entry));
    }
  }
};

// Gives a file a new name in its own directory, keeping its place, contents,
// time and attributes.
export const renameFile = (
  fs: Filesystem,
  cwd: string,
  path: string,
  newName: string,
): Result<Filesystem> => {
  const located = locate(fs, cwd, path);

  if (located.kind === "error") return fail(located.error);
  if (located.kind === "missing") return fail("FileNotFound");

  const { entry, names } = located;
  if (entry.kind === "directory") return fail("IsADirectory");

  const name = normaliseName(newName);
  if (!name.ok) return fail(name.error);

  const parent = names.slice(0, -1);
  const directoryPath = formatPath(parent);
  const clash = locate(fs, directoryPath, name.value);
  if (clash.kind === "found" && clash.entry !== entry) return fail("AccessDenied");

  return ok(
    withEntries(fs, parent, (entries) =>
      entries.map((existing) => (existing === entry ? { ...entry, name: name.value } : existing)),
    ),
  );
};

// Replaces the attributes of a file or directory, keeping its name, place,
// contents and time. Read-only entries may change: that is how the attribute
// is cleared. The root has no attributes to change.
export const setAttributes = (
  fs: Filesystem,
  cwd: string,
  path: string,
  attributes: Attributes,
): Result<Filesystem> => {
  const located = locate(fs, cwd, path);

  if (located.kind === "error") return fail(located.error);
  if (located.kind === "missing") return fail("FileNotFound");

  const { entry, names } = located;
  if (names.length === 0) return fail("AccessDenied");

  return ok(
    withEntries(fs, names.slice(0, -1), (entries) =>
      entries.map((existing) => (existing === entry ? { ...entry, attributes } : existing)),
    ),
  );
};

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
