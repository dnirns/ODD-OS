import { type Environment, getVariable } from "../environment/environment";
import { hasWildcard } from "../fs/names";
import { resolvePath } from "../fs/path";
import type { Filesystem } from "../fs/types";

// The directories of the `PATH` variable, in order. Empty entries are dropped.
export const searchDirectories = (environment: Environment): readonly string[] =>
  (getVariable(environment, "PATH") ?? "")
    .split(";")
    .map((directory) => directory.trim())
    .filter((directory) => directory !== "");

const LEADING_DELIMITERS = /^[ \t,;=]+/;
const TOKEN = /^[^ \t,;=/]*/;
const EXECUTABLE_EXTENSIONS = ["COM", "EXE", "BAT"] as const;

export type ExecutableLine = {
  readonly token: string;
  readonly rest: string;
};

export type Resolution =
  | { readonly type: "found"; readonly path: string }
  | { readonly type: "notFound" }
  | { readonly type: "invalidDrive" };

// MS-DOS 4.0 ends an internal command name at many characters, but a file name
// runs to the next delimiter or switch.
export const splitExecutableLine = (line: string): ExecutableLine => {
  const trimmed = line.replace(LEADING_DELIMITERS, "");
  const [token] = TOKEN.exec(trimmed) ?? [""];

  return { token, rest: trimmed.slice(token.length) };
};

const notFound: Resolution = { type: "notFound" };

const splitLocation = (token: string) => {
  const end = Math.max(
    token.lastIndexOf("\\"),
    token.lastIndexOf("/"),
    token.lastIndexOf(":"),
  );

  return { location: token.slice(0, end + 1), file: token.slice(end + 1) };
};

const candidateNames = (file: string): readonly string[] => {
  const dot = file.lastIndexOf(".");
  if (dot === -1) return EXECUTABLE_EXTENSIONS.map((ext) => `${file}.${ext}`);

  const extension = file.slice(dot + 1).toUpperCase();
  if (extension === "") {
    return EXECUTABLE_EXTENSIONS.map((ext) => `${file.slice(0, dot)}.${ext}`);
  }

  return EXECUTABLE_EXTENSIONS.some((ext) => ext === extension) ? [file] : [];
};

const joinPath = (directory: string, name: string) =>
  directory === ""
    ? name
    : /[\\/:]$/.test(directory)
      ? directory + name
      : `${directory}\\${name}`;

export const resolveExecutable = (
  filesystem: Filesystem,
  cwd: string,
  token: string,
  searchPath: readonly string[],
): Resolution => {
  if (hasWildcard(token)) return notFound;

  const { location, file } = splitLocation(token);
  if (file === "") return notFound;

  const explicit = location !== "";
  const directories = explicit ? [location] : ["", ...searchPath];
  const paths = directories.flatMap((directory) =>
    candidateNames(file).map((name) => joinPath(directory, name)),
  );

  for (const path of paths) {
    const resolved = resolvePath(filesystem, cwd, path);

    if (resolved.ok && resolved.value.entry.kind === "file") {
      return { type: "found", path: resolved.value.path };
    }
    // A directory on the path that cannot be searched is skipped.
    if (explicit && !resolved.ok && resolved.error === "InvalidDrive") {
      return { type: "invalidDrive" };
    }
  }

  return notFound;
};
