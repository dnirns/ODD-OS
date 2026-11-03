import { createDirectory, removeDirectory } from "../fs/operations";
import { formatPath, locate } from "../fs/path";
import { INVALID_DRIVE, INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "../programs/output";
import { readClock } from "./clock";
import type { CommandContext, CommandResult } from "./commands";
import type { ParsedCommand } from "./parse";

export const REQUIRED_PARAMETER_MISSING = "Required parameter missing";

// MS-DOS keeps a directory's path from the root, `\` included, to 63 characters.
const MAX_PATH_LENGTH = 63;

const pathFromRoot = (names: readonly string[]) => formatPath(names).length - "C:".length;

const onePath = (
  { switches, params }: ParsedCommand,
  run: (path: string) => CommandResult,
): CommandResult => {
  if (switches.length > 0) return print(INVALID_SWITCH);
  if (params.length > 1) return print(TOO_MANY_PARAMETERS);

  const [path] = params;
  return path === undefined ? print(REQUIRED_PARAMETER_MISSING) : run(path);
};

const UNABLE_TO_CREATE = "Unable to create directory";

export const runMd = (command: ParsedCommand, { disk, clock, now }: CommandContext): CommandResult =>
  onePath(command, (path) => {
    const located = locate(disk.filesystem, disk.cwd, path);

    if (located.kind === "error" && located.error === "InvalidDrive") return print(INVALID_DRIVE);
    if (located.kind === "found") {
      return print(located.entry.kind === "directory" ? "Directory already exists" : UNABLE_TO_CREATE);
    }
    if (located.kind === "error" || pathFromRoot([...located.parent, located.name]) > MAX_PATH_LENGTH) {
      return print(UNABLE_TO_CREATE);
    }

    const made = createDirectory(disk.filesystem, disk.cwd, path, readClock(clock, now));
    return made.ok
      ? { type: "files", disk: { ...disk, filesystem: made.value }, lines: [] }
      : print(UNABLE_TO_CREATE);
  });

const NOT_REMOVED = ["Invalid path, not directory,", "or directory not empty"];

export const runRd = (command: ParsedCommand, { disk }: CommandContext): CommandResult =>
  onePath(command, (path) => {
    const located = locate(disk.filesystem, disk.cwd, path);

    if (located.kind === "error" && located.error === "InvalidDrive") return print(INVALID_DRIVE);
    if (located.kind !== "found" || located.names.length === 0) return print(...NOT_REMOVED);

    const target = formatPath(located.names);
    if (located.entry.kind === "directory" && target === disk.cwd) {
      return print(`Attempt to remove current directory - ${target}`);
    }

    const removed = removeDirectory(disk.filesystem, disk.cwd, path);
    return removed.ok
      ? { type: "files", disk: { ...disk, filesystem: removed.value }, lines: [] }
      : print(...NOT_REMOVED);
  });

export const MD_SUMMARY = "Creates a directory.";

export const MD_HELP: readonly string[] = [
  MD_SUMMARY,
  "",
  "MKDIR [drive:]path",
  "MD [drive:]path",
];

export const RD_SUMMARY = "Removes (deletes) a directory.";

export const RD_HELP: readonly string[] = [
  RD_SUMMARY,
  "",
  "RMDIR [drive:]path",
  "RD [drive:]path",
];
