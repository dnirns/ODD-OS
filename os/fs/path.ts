import { findChild } from "./entries";
import { normaliseName } from "./names";
import {
  type DirectoryEntry,
  type Entry,
  fail,
  type Filesystem,
  type FsError,
  ok,
  type Result,
} from "./types";

export type Located =
  | { readonly kind: "found"; readonly names: readonly string[]; readonly entry: Entry }
  | { readonly kind: "missing"; readonly parent: readonly string[]; readonly name: string }
  | { readonly kind: "error"; readonly error: FsError };

type ParsedPath = {
  readonly absolute: boolean;
  readonly components: readonly string[];
  readonly trailing: boolean;
};

export type ResolvedPath = {
  readonly path: string;
  readonly entry: Entry;
};

const DRIVE = /^([A-Za-z]):/;
const LEADING_SEPARATORS = /^[\\/]*/;
const TRAILING_SEPARATOR = /[\\/]$/;
const SEPARATORS = /[\\/]+/;
const ONLY_DOTS = /^\.+$/;

const failed = (error: FsError): Located => ({ kind: "error", error });

export const formatPath = (names: readonly string[]) => `C:\\${names.join("\\")}`;

const parsePath = (path: string): Result<ParsedPath> => {
  if (path === "") return fail("FileNotFound");

  const drive = DRIVE.exec(path);
  if (drive && drive[1].toUpperCase() !== "C") return fail("InvalidDrive");

  const rest = drive ? path.slice(drive[0].length) : path;
  const leading = (LEADING_SEPARATORS.exec(rest) ?? [""])[0].length;
  if (leading > 1) return fail("PathNotFound");

  const body = rest.slice(leading);
  return ok({
    absolute: leading === 1,
    components: body.split(SEPARATORS).filter((component) => component !== ""),
    trailing: TRAILING_SEPARATOR.test(body),
  });
};

const namesOf = (trail: readonly DirectoryEntry[]) =>
  trail.slice(1).map(({ name }) => name);

const trailFor = (root: DirectoryEntry, names: readonly string[]) =>
  names.reduce<readonly DirectoryEntry[]>((trail, name) => {
    const child = findChild(trail[trail.length - 1], name);
    return child?.kind === "directory" ? [...trail, child] : trail;
  }, [root]);

const walk = (
  trail: readonly DirectoryEntry[],
  components: readonly string[],
  trailing: boolean,
): Located => {
  const [component, ...rest] = components;
  const current = trail[trail.length - 1];

  if (component === undefined) {
    return { kind: "found", names: namesOf(trail), entry: current };
  }

  const atEnd = rest.length === 0;
  const isLast = atEnd && !trailing;
  const notFound: FsError = isLast ? "FileNotFound" : "PathNotFound";

  if (component === ".") return walk(trail, rest, trailing);

  if (component === "..") {
    return trail.length === 1
      ? failed("PathNotFound")
      : walk(trail.slice(0, -1), rest, trailing);
  }

  if (ONLY_DOTS.test(component)) return failed(notFound);

  const name = normaliseName(component);
  if (!name.ok) return failed(name.error);

  const child = findChild(current, name.value);

  if (child === undefined) {
    return isLast
      ? { kind: "missing", parent: namesOf(trail), name: name.value }
      : failed("PathNotFound");
  }

  if (child.kind === "directory") return walk([...trail, child], rest, trailing);

  if (!atEnd) return failed("PathNotFound");

  return trailing
    ? failed("NotADirectory")
    : { kind: "found", names: [...namesOf(trail), child.name], entry: child };
};

const locateFrom = (
  root: DirectoryEntry,
  start: readonly string[],
  path: string,
): Located => {
  const parsed = parsePath(path);
  if (!parsed.ok) return failed(parsed.error);

  const { absolute, components, trailing } = parsed.value;
  return walk(trailFor(root, absolute ? [] : start), components, trailing);
};

export const locate = (fs: Filesystem, cwd: string, path: string): Located => {
  const working = locateFrom(fs.root, [], cwd);

  if (working.kind === "error") return working;
  if (working.kind === "missing") return failed("PathNotFound");
  if (working.entry.kind !== "directory") return failed("NotADirectory");

  return locateFrom(fs.root, working.names, path);
};

export const resolvePath = (
  fs: Filesystem,
  cwd: string,
  path: string,
): Result<ResolvedPath> => {
  const located = locate(fs, cwd, path);

  switch (located.kind) {
    case "found":
      return ok({ path: formatPath(located.names), entry: located.entry });
    case "missing":
      return fail("FileNotFound");
    case "error":
      return fail(located.error);
  }
};
