import type { Disk } from "../fs/disk";
import { ARCHIVE } from "../fs/entries";
import { hasWildcard, mapName, type Pattern, parsePattern } from "../fs/names";
import { readFile, writeEntry } from "../fs/operations";
import { formatPath, locate, resolvePath } from "../fs/path";
import type { FileContent, FsError } from "../fs/types";
import { INVALID_DRIVE, INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "../programs/output";
import { readClock } from "./clock";
import type { CommandContext, CommandResult } from "./commands";
import { type Device, deviceNamed } from "./devices";
import { REQUIRED_PARAMETER_MISSING } from "./dirCommands";
import { textLines } from "./fileCommands";
import { matchFiles } from "./matching";
import { opaqueNoise } from "./noise";
import type { ParsedCommand } from "./parse";

const END_OF_FILE = "\x1A";
const DELIMITERS = /[ \t,;=]+/;

// `A` copies as text and `B` as binary.
type Mode = "A" | "B";

type Item = { readonly name: string; readonly mode: Mode | undefined };

export type CopyArgs = {
  // Each group is a list of names joined by `+`.
  readonly sources: readonly Item[];
  readonly destination: Item | undefined;
  readonly replace: boolean;
};

type Parsing = {
  readonly groups: readonly (readonly Item[])[];
  readonly mode: Mode | undefined;
  readonly join: boolean;
  readonly replace: boolean;
  readonly invalid: boolean;
};

const withLastMode = (groups: Parsing["groups"], mode: Mode): Parsing["groups"] => {
  const last = groups.at(-1);
  const item = last?.at(-1);
  if (last === undefined || item === undefined) return groups;

  return [...groups.slice(0, -1), [...last.slice(0, -1), { ...item, mode }]];
};

const readPiece = (state: Parsing, piece: string): Parsing => {
  if (piece === "+") return { ...state, join: state.groups.length > 0 };
  if (!piece.startsWith("/")) {
    const item = { name: piece, mode: state.mode };
    const last = state.groups.at(-1);
    return {
      ...state,
      join: false,
      groups: state.join && last ? [...state.groups.slice(0, -1), [...last, item]] : [...state.groups, [item]],
    };
  }

  switch (piece.toUpperCase()) {
    case "/A":
    case "/B": {
      const mode = piece.toUpperCase() === "/A" ? "A" : "B";
      return { ...state, mode, groups: withLastMode(state.groups, mode) };
    }
    case "/V":
      return state;
    case "/Y":
      return { ...state, replace: true };
    case "/-Y":
      return { ...state, replace: false };
    default:
      return { ...state, invalid: true };
  }
};

// Reads COPY's arguments in order, because `/A` and `/B` apply to the name
// before them and every later one, and `+` joins sources.
export const parseCopy = (tail: string): CopyArgs | string => {
  const pieces = tail
    .split(DELIMITERS)
    .flatMap((token) => token.split(/(\+)/))
    .flatMap((token) => token.split(/(?=\/)/))
    .filter((piece) => piece !== "");
  const { groups, replace, invalid } = pieces.reduce(readPiece, {
    groups: [],
    mode: undefined,
    join: false,
    replace: false,
    invalid: false,
  });

  if (invalid) return INVALID_SWITCH;
  const [sources, destination, ...extra] = groups;
  if (sources === undefined) return REQUIRED_PARAMETER_MISSING;
  if (extra.length > 0 || (destination !== undefined && destination.length > 1)) return TOO_MANY_PARAMETERS;

  return { sources, destination: destination?.[0], replace };
};

// What COPY does, in order. Planning reads the disk; carrying out the steps
// writes it.
export type CopyStep =
  | { readonly kind: "say"; readonly line: string }
  | { readonly kind: "stop"; readonly line: string }
  | {
      readonly kind: "write";
      readonly shown: readonly string[];
      readonly path: string;
      readonly content: FileContent;
      readonly modified: Date;
      // False when adding to the first source, which is never asked about.
      readonly ask: boolean;
    }
  | { readonly kind: "device"; readonly shown: readonly string[]; readonly device: Device; readonly content: FileContent; readonly path: string };

export type CopyPlan = { readonly steps: readonly CopyStep[]; readonly replace: boolean };

type Source = {
  readonly shown: string;
  readonly path: string | undefined;
  readonly content: FileContent;
  readonly modified: Date;
  readonly mode: Mode | undefined;
};

type Gathered = {
  readonly item: Item;
  readonly wildcard: boolean;
  readonly files: readonly Source[];
};

const LAST_SEPARATOR = /[\\/:](?=[^\\/:]*$)/;

const directoryPart = (name: string) => {
  const separator = LAST_SEPARATOR.exec(name);
  return separator ? name.slice(0, separator.index + 1) : "";
};

const endsWithSeparator = (name: string) => /[\\/:]$/.test(name);

const isDirectory = ({ filesystem, cwd }: Disk, name: string) => {
  const resolved = resolvePath(filesystem, cwd, name);
  return resolved.ok && resolved.value.entry.kind === "directory";
};

const gather = (disk: Disk, item: Item, now: Date): Gathered | FsError => {
  if (deviceNamed(item.name) !== undefined) {
    const empty: Source = { shown: item.name.toUpperCase(), path: undefined, content: { kind: "text", text: "" }, modified: now, mode: item.mode };
    return { item, wildcard: false, files: [empty] };
  }

  const name = isDirectory(disk, item.name)
    ? `${item.name}${endsWithSeparator(item.name) ? "" : "\\"}*.*`
    : item.name;
  const matched = matchFiles(disk, name);
  if (!matched.ok) return matched.error === "InvalidDrive" ? "InvalidDrive" : { item, wildcard: true, files: [] };

  const shownDirectory = directoryPart(name);
  return {
    item,
    wildcard: hasWildcard(name),
    files: matched.value.flatMap(({ path, listing }) => {
      const content = readFile(disk.filesystem, disk.cwd, path);
      return content.ok
        ? [{ shown: `${shownDirectory}${listing.name}`, path, content: content.value, modified: listing.modified, mode: item.mode }]
        : [];
    }),
  };
};

const sizeOf = (content: FileContent) => (content.kind === "text" ? content.text.length : content.size);

// A text source ends at its first Ctrl+Z; a binary one, and any opaque file,
// is read whole.
const readAs = (content: FileContent, mode: Mode): FileContent =>
  content.kind === "text" && mode === "A" ? { kind: "text", text: content.text.split(END_OF_FILE)[0] } : content;

const joined = (parts: readonly FileContent[]): FileContent =>
  parts.some((part) => part.kind === "opaque")
    ? { kind: "opaque", size: parts.reduce((total, part) => total + sizeOf(part), 0) }
    : { kind: "text", text: parts.map((part) => (part.kind === "text" ? part.text : "")).join("") };

// A text destination ends with one Ctrl+Z.
const finishAs = (content: FileContent, mode: Mode): FileContent => {
  if (mode === "B") return content;
  return content.kind === "text" ? { kind: "text", text: `${content.text}${END_OF_FILE}` } : { kind: "opaque", size: content.size + 1 };
};

type Target =
  | { readonly kind: "device"; readonly device: Device; readonly mode: Mode | undefined }
  | { readonly kind: "directory"; readonly path: string; readonly mode: Mode | undefined }
  | { readonly kind: "pattern"; readonly path: string; readonly pattern: Pattern; readonly mode: Mode | undefined }
  | { readonly kind: "file"; readonly path: string; readonly mode: Mode | undefined };

const inDirectory = (directory: string, name: string) =>
  `${directory}${directory.endsWith("\\") ? "" : "\\"}${name}`;

const PATH_NOT_FOUND = "Path not found";

// Where copies go, or the message when that can't be.
const targetOf = (disk: Disk, destination: Item | undefined): Target | string => {
  if (destination === undefined) return { kind: "directory", path: disk.cwd, mode: undefined };

  const { name, mode } = destination;
  const device = deviceNamed(name);
  if (device !== undefined) return { kind: "device", device, mode };

  const located = locate(disk.filesystem, disk.cwd, name);
  if (located.kind === "error") {
    if (located.error === "InvalidDrive") return INVALID_DRIVE;
    if (!hasWildcard(name)) return located.error === "InvalidName" ? "File creation error" : PATH_NOT_FOUND;
  }
  if (located.kind === "found") {
    const path = formatPath(located.names);
    return located.entry.kind === "directory" ? { kind: "directory", path, mode } : { kind: "file", path, mode };
  }
  if (endsWithSeparator(name)) return PATH_NOT_FOUND;
  if (located.kind === "missing" && !hasWildcard(name)) {
    return { kind: "file", path: formatPath([...located.parent, located.name]), mode };
  }

  const directory = directoryPart(name);
  const parent = resolvePath(disk.filesystem, disk.cwd, directory === "" ? "." : directory);
  const pattern = parsePattern(name.slice(directory.length));
  if (!parent.ok || parent.value.entry.kind !== "directory") return PATH_NOT_FOUND;
  if (!pattern.ok) return "File creation error";

  return { kind: "pattern", path: parent.value.path, pattern: pattern.value, mode };
};

const destinationFor = (target: Target, name: string): string | Device => {
  switch (target.kind) {
    case "device":
      return target.device;
    case "directory":
      return inDirectory(target.path, name);
    case "pattern":
      return inDirectory(target.path, mapName(target.pattern, name));
    case "file":
      return target.path;
  }
};

const nameOf = (path: string) => path.slice(path.lastIndexOf("\\") + 1);

const toStep = (
  shown: readonly string[],
  destination: string | Device,
  { content, modified, path }: { readonly content: FileContent; readonly modified: Date; readonly path?: string },
  ask: boolean,
): CopyStep =>
  destination === "CON" || destination === "NUL"
    ? { kind: "device", shown, device: destination, content, path: path ?? "" }
    : { kind: "write", shown, path: destination, content, modified, ask };

const SELF = "File cannot be copied onto itself";
const LOST = "Content of destination lost before copy";

const notFound = ({ item }: Gathered): CopyStep => ({ kind: "say", line: `File not found - ${item.name.toUpperCase()}` });

const plainSteps = ([gathered]: readonly Gathered[], target: Target): readonly CopyStep[] => {
  if (gathered.files.length === 0) return [notFound(gathered)];

  const steps: readonly CopyStep[] = gathered.files.flatMap((source): readonly CopyStep[] => {
    if (sizeOf(source.content) === 0) return [];

    const destination = destinationFor(target, nameOf(source.path ?? source.shown));
    if (destination === source.path) {
      return [...(gathered.wildcard ? [{ kind: "say", line: source.shown } as const] : []), { kind: "stop", line: SELF }];
    }

    const content = finishAs(readAs(source.content, source.mode ?? "B"), target.mode ?? source.mode ?? "B");
    return [toStep(gathered.wildcard ? [source.shown] : [], destination, { content, modified: source.modified, path: source.path }, true)];
  });
  const stop = steps.findIndex((step) => step.kind === "stop");
  return stop === -1 ? steps : steps.slice(0, stop + 1);
};

const combinedSteps = (gathered: readonly Gathered[], target: Target | undefined, now: Date): readonly CopyStep[] => {
  const sources = gathered.flatMap(({ files }) => files);
  const [first] = sources;
  if (first === undefined) return gathered.length > 0 ? [notFound(gathered[0])] : [];

  const destination = target === undefined ? first.path ?? first.shown : destinationFor(target, nameOf(first.path ?? first.shown));
  const lost = sources.slice(1).some(({ path }) => path === destination);
  const used = sources.filter((source, index) => index === 0 || source.path !== destination);
  const content = finishAs(
    joined(used.map((source) => readAs(source.content, source.mode ?? "A"))),
    target?.mode ?? used.at(-1)?.mode ?? "A",
  );
  const shown = used.map((source) => source.shown);
  const empty = used.every((source) => sizeOf(source.content) === 0);

  return [
    ...(lost ? [{ kind: "say", line: LOST } as const] : []),
    ...(empty ? [] : [toStep(shown, destination, { content, modified: now, path: first.path }, destination !== first.path)]),
  ];
};

// Works out every copy COPY makes, without changing the disk.
export const planCopy = (args: CopyArgs, disk: Disk, now: Date): CopyPlan | string => {
  const found = args.sources.map((item) => gather(disk, item, now));
  const gathered = found.filter((each): each is Gathered => typeof each !== "string");
  if (gathered.length < found.length) return INVALID_DRIVE;

  const target = targetOf(disk, args.destination);
  if (typeof target === "string") return target;

  const [only] = gathered;
  const combine =
    gathered.length > 1 ||
    (only.wildcard && args.destination !== undefined && target.kind === "file");

  return {
    replace: args.replace,
    steps: combine
      ? combinedSteps(gathered, args.destination === undefined ? undefined : target, now)
      : plainSteps(gathered, target),
  };
};

type Progress = {
  readonly disk: Disk;
  readonly lines: readonly string[];
  readonly count: number;
  readonly replaceAll: boolean;
};

const countLine = (count: number) => `${String(count).padStart(9)} File(s) copied`;

const finish = ({ disk, lines, count }: Progress): CommandResult => ({
  type: "files",
  disk,
  lines: [...lines, countLine(count)],
});

const shownOn = (content: FileContent, path: string): readonly string[] =>
  content.kind === "text" ? textLines(content.text) : opaqueNoise(path, content.size);

const write = (progress: Progress, step: Extract<CopyStep, { kind: "write" }>): Progress => {
  const { disk } = progress;
  const written = writeEntry(disk.filesystem, disk.cwd, step.path, step.content, step.modified, ARCHIVE);

  if (written.ok) return { ...progress, disk: { ...disk, filesystem: written.value }, count: progress.count + 1 };
  return { ...progress, lines: [...progress.lines, written.error === "AccessDenied" ? "Access denied" : "File creation error"] };
};

const exists = ({ filesystem, cwd }: Disk, path: string) => locate(filesystem, cwd, path).kind === "found";

// Carries out the steps in turn, asking before replacing a file unless `/Y`
// or an earlier `All` answer says not to.
export const runSteps = (progress: Progress, steps: readonly CopyStep[]): CommandResult => {
  const [step, ...rest] = steps;
  if (step === undefined) return finish(progress);

  switch (step.kind) {
    case "say":
      return runSteps({ ...progress, lines: [...progress.lines, step.line] }, rest);
    case "stop":
      return finish({ ...progress, lines: [...progress.lines, step.line] });
    case "device":
      return runSteps(
        {
          ...progress,
          lines: [...progress.lines, ...step.shown, ...(step.device === "CON" ? shownOn(step.content, step.path) : [])],
          count: progress.count + 1,
        },
        rest,
      );
    case "write": {
      const shown = { ...progress, lines: [...progress.lines, ...step.shown] };
      if (!step.ask || progress.replaceAll || !exists(progress.disk, step.path)) {
        return runSteps(write(shown, step), rest);
      }

      const ask = (lines: readonly string[]): CommandResult => ({
        type: "question",
        lines,
        prompt: `Overwrite ${step.path} (Yes/No/All)?`,
        read: "line",
        answer: (text) => {
          const after = { ...shown, lines: [] };
          switch (text.trimStart().charAt(0).toUpperCase()) {
            case "Y":
              return runSteps(write(after, step), rest);
            case "N":
              return runSteps(after, rest);
            case "A":
              return runSteps(write({ ...after, replaceAll: true }, step), rest);
            default:
              return ask([]);
          }
        },
      });
      return ask(shown.lines);
    }
  }
};

const copyFrom = (args: CopyArgs, disk: Disk, now: Date): CommandResult => {
  const plan = planCopy(args, disk, now);
  const start = { disk, lines: [], count: 0, replaceAll: false };

  if (typeof plan === "string") {
    return plan === PATH_NOT_FOUND || plan === "File creation error"
      ? finish({ ...start, lines: [plan] })
      : print(plan);
  }
  return runSteps({ ...start, replaceAll: plan.replace }, plan.steps);
};

// `COPY CON name` reads the file from the keyboard, then copies it as if from
// a file dated now.
const copyFromKeyboard = (args: CopyArgs, disk: Disk, now: Date): CommandResult => ({
  type: "question",
  lines: [],
  prompt: "",
  read: "file",
  answer: (text, { disk: current }) => {
    if (text === "") return finish({ disk: current, lines: [], count: 0, replaceAll: false });

    const target = targetOf(current, args.destination ?? { name: "CON", mode: undefined });
    if (typeof target === "string") return finish({ disk: current, lines: [target], count: 0, replaceAll: false });

    const [source] = args.sources;
    const content = finishAs(readAs({ kind: "text", text }, source.mode ?? "B"), target.mode ?? source.mode ?? "B");
    const destination = destinationFor(target, "CON");
    return runSteps(
      { disk: current, lines: [], count: 0, replaceAll: args.replace },
      [toStep([], destination, { content, modified: now }, true)],
    );
  },
});

export const runCopy = ({ rest }: ParsedCommand, { disk, clock, now }: CommandContext): CommandResult => {
  const args = parseCopy(rest);
  if (typeof args === "string") return print(args);

  const when = readClock(clock, now);
  const [first] = args.sources;
  return args.sources.length === 1 && deviceNamed(first.name) === "CON"
    ? copyFromKeyboard(args, disk, when)
    : copyFrom(args, disk, when);
};

export const COPY_SUMMARY = "Copies one or more files to another location.";

export const COPY_HELP: readonly string[] = [
  COPY_SUMMARY,
  "",
  "COPY [/A | /B] source [/A | /B] [+ source [/A | /B] [+ ...]] [destination",
  "  [/A | /B]] [/V] [/Y | /-Y]",
  "",
  "  source       Specifies the file or files to be copied.",
  "  /A           Indicates an ASCII text file.",
  "  /B           Indicates a binary file.",
  "  destination  Specifies the directory and/or filename for the new file(s).",
  "  /V           Verifies that new files are written correctly.",
  "  /Y           Suppresses prompting to confirm you want to overwrite an",
  "               existing destination file.",
  "  /-Y          Causes prompting to confirm you want to overwrite an",
  "               existing destination file.",
  "",
  "To append files, specify a single file for destination, but multiple files",
  "for source (using wildcards or file1+file2+file3 format).",
];
