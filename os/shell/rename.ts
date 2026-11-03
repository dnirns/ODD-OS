import type { Disk } from "../fs/disk";
import { hasWildcard, mapName, parsePattern } from "../fs/names";
import { renameFile } from "../fs/operations";
import { resolvePath } from "../fs/path";
import { INVALID_DRIVE, INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "../programs/output";
import type { CommandContext, CommandResult } from "./commands";
import { REQUIRED_PARAMETER_MISSING } from "./dirCommands";
import { matchFiles } from "./matching";
import type { ParsedCommand } from "./parse";

const NOT_RENAMED = "Duplicate file name or file not found";
const HAS_DRIVE = /^[A-Za-z]:/;
const HAS_PATH = /[\\/]/;

// The name each matched file takes: a `?` or `*` in the new name takes the
// old name's characters.
const newNameFor = (newName: string) => {
  if (!hasWildcard(newName)) return () => newName;

  const pattern = parsePattern(newName);
  return pattern.ok ? (name: string) => mapName(pattern.value, name) : undefined;
};

export const runRen = ({ switches, params }: ParsedCommand, { disk }: CommandContext): CommandResult => {
  if (switches.length > 0) return print(INVALID_SWITCH);
  if (params.length > 2) return print(TOO_MANY_PARAMETERS);

  const [source, newName] = params;
  if (source === undefined || newName === undefined) return print(REQUIRED_PARAMETER_MISSING);
  if (HAS_DRIVE.test(newName)) return print("Invalid parameter");
  if (HAS_PATH.test(newName)) return print("Invalid filename or file not found");

  const target = resolvePath(disk.filesystem, disk.cwd, source);
  if (target.ok && target.value.entry.kind === "directory") return print("Invalid path or file name");

  const matched = matchFiles(disk, source);
  if (!matched.ok) return print(matched.error === "InvalidDrive" ? INVALID_DRIVE : NOT_RENAMED);

  const nameFor = newNameFor(newName);
  if (matched.value.length === 0 || nameFor === undefined) return print(NOT_RENAMED);

  const { renamed, failed } = matched.value.reduce(
    (done: { readonly renamed: Disk; readonly failed: boolean }, { path, listing }) => {
      const result = renameFile(done.renamed.filesystem, done.renamed.cwd, path, nameFor(listing.name));
      return result.ok
        ? { ...done, renamed: { ...done.renamed, filesystem: result.value } }
        : { ...done, failed: true };
    },
    { renamed: disk, failed: false },
  );

  return { type: "files", disk: renamed, lines: failed ? [NOT_RENAMED] : [] };
};

export const REN_SUMMARY = "Renames a file or files.";

export const REN_HELP: readonly string[] = [
  REN_SUMMARY,
  "",
  "RENAME [drive:][path]filename1 filename2",
  "REN [drive:][path]filename1 filename2",
  "",
  "Note that you cannot specify a new drive or path for your destination file.",
];
