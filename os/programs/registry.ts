import { COMMAND } from "./command";
import { DOSKEY } from "./doskey";
import { programmeFiles } from "./files";
import { HELP } from "./help";
import { MEM } from "./mem";
import type { PrintResult } from "./output";
import { BAD_COMMAND, INVALID_DRIVE, print } from "./output";
import { resolveExecutable } from "./resolve";
import type {
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

export const runExecutable = (
  token: string,
  args: ProgrammeArgs,
  launchContext: LaunchContext,
  registry: Registry,
): ProgrammeOutput | LaunchResult => {
  const { filesystem, cwd } = launchContext.disk;
  const found = resolveExecutable(filesystem, cwd, token);

  if (found.type === "invalidDrive") return print(INVALID_DRIVE);
  if (found.type === "notFound") return print(BAD_COMMAND);
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
