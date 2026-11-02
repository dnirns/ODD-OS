import { changeDirectory } from "../fs/disk";
import { freeBytes } from "../fs/freeSpace";
import { findEntries } from "../fs/operations";
import { hasWildcard } from "../fs/names";
import { resolvePath } from "../fs/path";
import type { FsError } from "../fs/types";
import { MACHINE } from "../machine";
import { INVALID_DRIVE, INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "../programs/output";
import type { CommandContext, CommandResult } from "./commands";
import { listingLines } from "./dir";
import { opaqueNoise } from "./noise";
import type { ParsedCommand } from "./parse";


const INVALID_DIRECTORY = "Invalid directory";
const DRIVE_ONLY = /^[A-Za-z]:$/;

const cdMessage = (error: FsError) =>
  error === "InvalidDrive" ? INVALID_DRIVE : INVALID_DIRECTORY;

export const runCd = (
  { switches, params }: ParsedCommand,
  { disk }: CommandContext,
): CommandResult => {
  if (switches.length > 0) return print(INVALID_SWITCH);
  if (params.length > 1) return print(TOO_MANY_PARAMETERS);

  const [path] = params;
  if (path === undefined) return print(disk.cwd);

  if (DRIVE_ONLY.test(path)) {
    return path.toUpperCase().startsWith("C") ? print(disk.cwd) : print(INVALID_DRIVE);
  }

  const changed = changeDirectory(disk, path);
  return changed.ok
    ? { type: "setDirectory", cwd: changed.value.cwd }
    : print(cdMessage(changed.error));
};

export const CD_SUMMARY = "Displays the name of or changes the current directory.";

export const CD_HELP: readonly string[] = [
  CD_SUMMARY,
  "",
  "CHDIR [drive:][path]",
  "CHDIR[..]",
  "CD [drive:][path]",
  "CD[..]",
  "",
  "  ..   Specifies that you want to change to the parent directory.",
  "",
  "Type CD drive: to display the current directory in the specified drive.",
  "Type CD without parameters to display the current drive and directory.",
];

const dirMessage = (error: FsError) => {
  switch (error) {
    case "InvalidDrive":
      return INVALID_DRIVE;
    case "PathNotFound":
    case "NotADirectory":
      return "Path not found";
    default:
      return "File not found";
  }
};

export const runDir = (
  { switches, params }: ParsedCommand,
  { disk }: CommandContext,
): CommandResult => {
  if (switches.some((option) => option !== "/W" && option !== "/P")) {
    return print(INVALID_SWITCH);
  }
  if (new Set(switches).size !== switches.length || params.length > 1) {
    return print(TOO_MANY_PARAMETERS);
  }

  const found = findEntries(disk.filesystem, disk.cwd, params[0] ?? "");
  if (!found.ok) return print(dirMessage(found.error));

  const lines = listingLines(found.value, {
    wide: switches.includes("/W"),
    free: freeBytes(disk.filesystem, MACHINE.fixedDiskMb),
  });

  return switches.includes("/P") ? { type: "page", lines } : print(...lines);
};

export const DIR_SUMMARY = "Displays a list of files and subdirectories in a directory.";

export const DIR_HELP: readonly string[] = [
  DIR_SUMMARY,
  "",
  "DIR [drive:][path][filename] [/P] [/W]",
  "",
  "  [drive:][path][filename]",
  "              Specifies drive, directory, and/or files to list.",
  "  /P          Pauses after each screenful of information.",
  "  /W          Uses wide list format.",
];

const CTRL_Z = "\x1A";
const LINE_BREAK = /\r\n|\n|\r/;

// The lines TYPE shows for a text file: it stops at the first Ctrl+Z, and text
// with no final line break is shown as if it had one.
export const textLines = (text: string): readonly string[] => {
  const shown = text.split(CTRL_Z)[0];
  const lines = shown.split(LINE_BREAK);

  return lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
};

const typeMessage = (error: FsError, name: string) => {
  switch (error) {
    case "InvalidDrive":
      return INVALID_DRIVE;
    case "PathNotFound":
    case "NotADirectory":
      return `Path not found - ${name}`;
    case "IsADirectory":
    case "AccessDenied":
      return `Access denied - ${name}`;
    default:
      return `File not found - ${name}`;
  }
};

export const runType = (
  { switches, params }: ParsedCommand,
  { disk }: CommandContext,
): CommandResult => {
  if (switches.length > 0) return print(INVALID_SWITCH);
  if (params.length > 1) return print(TOO_MANY_PARAMETERS);

  const [name] = params;
  if (name === undefined) return print("Required parameter missing");
  if (hasWildcard(name)) return print("Invalid path or file name");

  const resolved = resolvePath(disk.filesystem, disk.cwd, name);
  if (!resolved.ok) return print(typeMessage(resolved.error, name));

  const { path, entry } = resolved.value;
  if (entry.kind === "directory") return print(typeMessage("IsADirectory", name));

  return entry.content.kind === "text"
    ? print(...textLines(entry.content.text))
    : print(...opaqueNoise(path, entry.content.size));
};

export const TYPE_SUMMARY = "Displays the contents of a text file.";

export const TYPE_HELP: readonly string[] = [
  TYPE_SUMMARY,
  "",
  "TYPE [drive:][path]filename",
];
