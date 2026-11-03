import type { Disk } from "../fs/disk";
import { hasWildcard, parsePattern } from "../fs/names";
import { deleteFile } from "../fs/operations";
import { resolvePath } from "../fs/path";
import type { FsError } from "../fs/types";
import { INVALID_DRIVE, INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "../programs/output";
import type { CommandContext, CommandResult } from "./commands";
import { REQUIRED_PARAMETER_MISSING } from "./dirCommands";
import { matchFiles } from "./matching";
import type { ParsedCommand } from "./parse";

const LAST_NAME = /[^\\/:]*$/;
const EVERY_NAME = { base: "????????", extension: "???" };

// A directory, or a pattern every name matches, such as `*.*` or `*`.
const namesEveryFile = ({ filesystem, cwd }: Disk, path: string) => {
  const target = resolvePath(filesystem, cwd, path);
  if (target.ok) return target.value.entry.kind === "directory";

  const [last] = LAST_NAME.exec(path) ?? [""];
  const pattern = hasWildcard(last) ? parsePattern(last) : undefined;

  return (
    pattern?.ok === true &&
    pattern.value.base === EVERY_NAME.base &&
    pattern.value.extension === EVERY_NAME.extension
  );
};

type Deleted = { readonly disk: Disk; readonly lines: readonly string[] };

const deleteOne = ({ disk, lines }: Deleted, path: string): Deleted => {
  const deleted = deleteFile(disk.filesystem, disk.cwd, path);

  return deleted.ok
    ? { disk: { ...disk, filesystem: deleted.value }, lines }
    : { disk, lines: [...lines, "Access denied"] };
};

const finish = ({ disk, lines }: Deleted): CommandResult => ({ type: "files", disk, lines });

const deleteAll = (disk: Disk, files: readonly string[]): CommandResult =>
  files.length === 0
    ? print("File not found")
    : finish(files.reduce(deleteOne, { disk, lines: [] }));

const answerOf = (text: string) => text.trimStart().charAt(0).toUpperCase();

const askEach = (done: Deleted, files: readonly string[]): CommandResult => {
  const [path, ...rest] = files;
  if (path === undefined) return finish(done);

  const ask = (lines: readonly string[]): CommandResult => ({
    type: "question",
    lines,
    prompt: `${path},    Delete (Y/N)?`,
    read: "line",
    answer: (text) => {
      switch (answerOf(text)) {
        case "Y":
          return askEach(deleteOne({ ...done, lines: [] }, path), rest);
        case "N":
          return askEach({ ...done, lines: [] }, rest);
        default:
          return ask([]);
      }
    },
  });

  return ask(done.lines);
};

const confirmAll = (disk: Disk, files: readonly string[]): CommandResult => {
  const ask = (lines: readonly string[]): CommandResult => ({
    type: "question",
    lines,
    prompt: "Are you sure (Y/N)?",
    read: "line",
    answer: (text) => {
      switch (answerOf(text)) {
        case "Y":
          return deleteAll(disk, files);
        case "N":
          return { type: "files", disk, lines: [] };
        default:
          return ask([]);
      }
    },
  });

  return ask(["All files in directory will be deleted!"]);
};

const deleteMessage = (error: FsError) => {
  switch (error) {
    case "InvalidDrive":
      return INVALID_DRIVE;
    case "PathNotFound":
      return "Path not found";
    default:
      return "File not found";
  }
};

export const runDel = ({ switches, params }: ParsedCommand, { disk }: CommandContext): CommandResult => {
  if (switches.some((option) => option !== "/P")) return print(INVALID_SWITCH);
  if (params.length > 1) return print(TOO_MANY_PARAMETERS);

  const [path] = params;
  if (path === undefined) return print(REQUIRED_PARAMETER_MISSING);

  const matched = matchFiles(disk, path);
  if (!matched.ok) return print(deleteMessage(matched.error));

  const files = matched.value.map((file) => file.path);
  if (switches.includes("/P")) {
    return files.length === 0 ? print("File not found") : askEach({ disk, lines: [] }, files);
  }
  return namesEveryFile(disk, path) ? confirmAll(disk, files) : deleteAll(disk, files);
};

export const DEL_SUMMARY = "Deletes one or more files.";

export const DEL_HELP: readonly string[] = [
  DEL_SUMMARY,
  "",
  "DEL [drive:][path]filename [/P]",
  "ERASE [drive:][path]filename [/P]",
  "",
  "  [drive:][path]filename  Specifies the file(s) to delete.  Specify multiple",
  "                          files by using wildcards.",
  "  /P                      Prompts for confirmation before deleting each file.",
];
