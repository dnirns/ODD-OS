import type { Disk } from "../fs/disk";
import { NO_ATTRIBUTES } from "../fs/entries";
import { hasWildcard, matchesPattern, parsePattern } from "../fs/names";
import { formatPath, locate, resolvePath } from "../fs/path";
import type { Attributes, DirectoryEntry, Entry, FsError } from "../fs/types";
import { INVALID_DRIVE, INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "./output";
import type { CommandProgramme, ProgrammeArgs, ProgrammeFiles, ProgrammeOutput } from "./types";

const SUMMARY = "Displays or changes file attributes.";

type Code = "R" | "A" | "S" | "H";

type Change = { readonly code: Code; readonly set: boolean };

type Request = {
  readonly changes: readonly Change[];
  readonly spec: string | undefined;
  readonly subdirectories: boolean;
  readonly comma: boolean;
};

type Target = { readonly path: string; readonly entry: Entry };

const CODES: readonly Code[] = ["R", "A", "S", "H"];
const LAST_PART = /^(.*[\\/:])?([^\\/:]*)$/;
const FIELD_WIDTH = 16;
const GAP = "    ";

const KEYS: Readonly<Record<Code, keyof Attributes>> = {
  R: "readOnly",
  A: "archive",
  S: "system",
  H: "hidden",
};

const parseChange = (text: string): Change | undefined => {
  const code = CODES.find((candidate) => candidate === text.slice(1).toUpperCase());
  return text.length === 2 && code !== undefined ? { code, set: text[0] === "+" } : undefined;
};

const parse = ({ rest, params, switches }: ProgrammeArgs): Request | string => {
  if (switches.some((option) => option !== "/S")) return INVALID_SWITCH;
  if (switches.length > 1) return INVALID_SWITCH;

  const changes: Change[] = [];
  const names: string[] = [];

  for (const param of params) {
    if (param.startsWith("+") || param.startsWith("-")) {
      const change = parseChange(param);
      if (change === undefined) return INVALID_SWITCH;
      changes.push(change);
    } else {
      names.push(param);
    }
  }

  if (names.length > 1) return TOO_MANY_PARAMETERS;

  return {
    changes,
    spec: names[0],
    subdirectories: switches.length === 1,
    // Only spaces and tabs may come before the comma.
    comma: rest.trimStart().startsWith(","),
  };
};

// The 4.0 layout with S and H added in bit order: `  A  SHR`, padded to 16.
// Not verified against MS-DOS 6.22.
const row = ({ archive, system, hidden, readOnly }: Attributes, path: string) =>
  [
    " ",
    " ",
    archive ? "A" : " ",
    " ",
    " ",
    system ? "S" : " ",
    hidden ? "H" : " ",
    readOnly ? "R" : " ",
  ]
    .join("")
    .padEnd(FIELD_WIDTH) +
  GAP +
  path;

const join = (directory: string, name: string) =>
  directory.endsWith("\\") ? `${directory}${name}` : `${directory}\\${name}`;

const nameError = (error: FsError, spec: string) => {
  switch (error) {
    case "InvalidDrive":
      return INVALID_DRIVE;
    case "FileNotFound":
      return `File not found - ${spec}`;
    default:
      return `Path not found - ${spec}`;
  }
};

// The matching files of a directory, after those of its subdirectories when
// `/S` is given, as the MS-DOS 4.0 source walks them.
const walk = (
  path: string,
  directory: DirectoryEntry,
  matches: (entry: Entry) => boolean,
  subdirectories: boolean,
): readonly Target[] => [
  ...(subdirectories
    ? directory.entries.flatMap((entry) =>
        entry.kind === "directory" ? walk(join(path, entry.name), entry, matches, true) : [],
      )
    : []),
  ...directory.entries
    .filter((entry) => entry.kind === "file" && matches(entry))
    .map((entry) => ({ path: join(path, entry.name), entry })),
];

// The entries a command names, or the message that stops it.
const targetsOf = (disk: Disk, spec: string, subdirectories: boolean): readonly Target[] | string => {
  const { filesystem, cwd } = disk;

  if (!hasWildcard(spec) && !subdirectories) {
    const located = locate(filesystem, cwd, spec);
    if (located.kind === "error") return nameError(located.error, spec);
    if (located.kind === "missing") return nameError("FileNotFound", spec);
    return located.names.length === 0 ? [] : [{ path: formatPath(located.names), entry: located.entry }];
  }

  const named = resolvePath(filesystem, cwd, spec);
  const [, folder = "", last] = LAST_PART.exec(spec) ?? [];
  const asDirectory = named.ok && named.value.entry.kind === "directory" && !hasWildcard(spec);
  const directory = asDirectory ? named : resolvePath(filesystem, cwd, folder === "" ? "." : folder);

  if (!directory.ok) return nameError(directory.error, spec);
  if (directory.value.entry.kind !== "directory") return nameError("PathNotFound", spec);

  const pattern = parsePattern(asDirectory || last === "" ? "*.*" : last);
  if (!pattern.ok) return nameError("FileNotFound", spec);

  return walk(
    directory.value.path,
    directory.value.entry,
    ({ name }) => matchesPattern(pattern.value, name),
    subdirectories,
  );
};

const applied = (attributes: Attributes, changes: readonly Change[]) =>
  changes.reduce((current, { code, set }) => ({ ...current, [KEYS[code]]: set }), attributes);

// A hidden or system entry changes only when the command clears both of
// those it has. Not verified: which message shows when both stay set.
const refusal = ({ system, hidden }: Attributes, changes: readonly Change[], path: string) => {
  const clears = (code: Code) => changes.some((change) => change.code === code && !change.set);

  if (system && !clears("S")) return `Not resetting system file ${path}`;
  if (hidden && !clears("H")) return `Not resetting hidden file ${path}`;
  return undefined;
};

const change = (
  disk: Disk,
  files: ProgrammeFiles,
  targets: readonly Target[],
  attributesFor: (target: Target) => Attributes | string,
): ProgrammeOutput => {
  let current = disk;
  const lines: string[] = [];

  for (const target of targets) {
    const next = attributesFor(target);

    if (typeof next === "string") {
      lines.push(next);
    } else {
      const result = files.setAttributes(current, target.path, next);
      if (result.ok) current = result.value;
    }
  }

  return { type: "files", disk: current, lines };
};

export const ATTRIB: CommandProgramme = {
  kind: "command",
  summary: SUMMARY,
  help: [
    SUMMARY,
    "",
    "ATTRIB [+R | -R] [+A | -A] [+S | -S] [+H | -H] [[drive:][path]filename] [/S]",
    "",
    "  +   Sets an attribute.",
    "  -   Clears an attribute.",
    "  R   Read-only file attribute.",
    "  A   Archive file attribute.",
    "  S   System file attribute.",
    "  H   Hidden file attribute.",
    "  [drive:][path]filename",
    "      Specifies a file or files for ATTRIB to process.",
    "  /S  Processes files in all directories in the specified path.",
  ],
  run: (args, { disk, files }) => {
    const request = parse(args);
    if (typeof request === "string") return print(request);

    const { changes, spec, subdirectories, comma } = request;

    // MS-DOS 5.0 to 6.22: a comma clears every attribute of every file.
    if (comma) {
      const all = targetsOf(disk, "*.*", subdirectories);
      return typeof all === "string" ? print(all) : change(disk, files, all, () => NO_ATTRIBUTES);
    }

    const named = spec ?? "*.*";
    const targets = targetsOf(disk, named, subdirectories);

    if (typeof targets === "string") return print(targets);
    if (targets.length === 0) return print(`File not found - ${named}`);

    if (changes.length === 0) {
      return print(...targets.map(({ path, entry }) => row(entry.attributes, path)));
    }

    return change(
      disk,
      files,
      targets,
      ({ path, entry }) => refusal(entry.attributes, changes, path) ?? applied(entry.attributes, changes),
    );
  },
};
