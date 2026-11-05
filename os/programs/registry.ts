import { readFile } from "../fs/operations";
import { ATTRIB } from "./attrib";
import { COMMAND } from "./command";
import { DOSKEY } from "./doskey";
import { programmeFiles } from "./files";
import { HELP } from "./help";
import { MEM } from "./mem";
import type { PrintResult } from "./output";
import { BAD_COMMAND, INVALID_DRIVE, print } from "./output";
import { resolveExecutable, searchDirectories } from "./resolve";
import type {
  BatchResult,
  LaunchContext,
  LaunchResult,
  ProgrammeArgs,
  ProgrammeContext,
  ProgrammeOutput,
  Registry,
} from "./types";
import { WORM } from "./worm";

export const NO_BEHAVIOUR = "Program too big to fit in memory";

export const PROGRAMMES: Registry = {
  "C:\\COMMAND.COM": COMMAND,
  "C:\\DOS\\ATTRIB.EXE": ATTRIB,
  "C:\\DOS\\DOSKEY.COM": DOSKEY,
  "C:\\DOS\\HELP.COM": HELP,
  "C:\\DOS\\MEM.EXE": MEM,
  "C:\\ODDWARE\\WORM.EXE": WORM,
};

// `C:\ODDWARE\WORM.EXE` -> `C:\ODDWARE`; `C:\COMMAND.COM` -> `C:\`.
const directoryOf = (path: string) => {
  const parent = path.slice(0, path.lastIndexOf("\\"));
  return parent === "C:" ? "C:\\" : parent;
};

const launch = (
  start: () => LaunchResult["running"],
): LaunchResult | PrintResult => {
  try {
    return { type: "launch", running: start() };
  } catch {
    return print();
  }
};

// A batch file runs from its text. A file with no text to read finds nothing.
const batchOf = (
  { disk }: LaunchContext,
  path: string,
  name: string,
  tail: string,
): BatchResult | PrintResult => {
  const content = readFile(disk.filesystem, disk.cwd, path);

  return content.ok && content.value.kind === "text"
    ? { type: "batch", name, text: content.value.text, tail }
    : print(BAD_COMMAND);
};

export const runExecutable = (
  token: string,
  args: ProgrammeArgs,
  launchContext: LaunchContext,
  registry: Registry,
): ProgrammeOutput | LaunchResult | BatchResult => {
  const { filesystem, cwd } = launchContext.disk;
  const found = resolveExecutable(
    filesystem,
    cwd,
    token,
    searchDirectories(launchContext.environment),
  );

  if (found.type === "invalidDrive") return print(INVALID_DRIVE);
  if (found.type === "notFound") return print(BAD_COMMAND);
  if (found.path.endsWith(".BAT")) return batchOf(launchContext, found.path, token, args.tail);
  if (!Object.hasOwn(registry, found.path)) return print(NO_BEHAVIOUR);

  const programme = registry[found.path];
  const context: ProgrammeContext = {
    ...launchContext,
    files: programmeFiles(directoryOf(found.path), launchContext.clock),
  };

  if (programme.kind === "fullscreen") {
    return launch(() => programme.start(args, context));
  }

  return args.switches.includes("/?")
    ? print(...programme.help)
    : programme.run(args, context);
};
