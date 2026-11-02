import { COMMAND } from "./command";
import { DOSKEY } from "./doskey";
import { HELP } from "./help";
import { MEM } from "./mem";
import type { PrintResult } from "./output";
import { BAD_COMMAND, INVALID_DRIVE, print } from "./output";
import { resolveExecutable } from "./resolve";
import type {
  LaunchResult,
  ProgrammeArgs,
  ProgrammeContext,
  ProgrammeOutput,
  Registry,
} from "./types";

export const NO_BEHAVIOUR = "Program too big to fit in memory";

export const PROGRAMMES: Registry = {
  "C:\\COMMAND.COM": COMMAND,
  "C:\\DOS\\DOSKEY.COM": DOSKEY,
  "C:\\DOS\\HELP.COM": HELP,
  "C:\\DOS\\MEM.EXE": MEM,
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
  context: ProgrammeContext,
  registry: Registry,
): ProgrammeOutput | LaunchResult => {
  const { filesystem, cwd } = context.disk;
  const found = resolveExecutable(filesystem, cwd, token);

  if (found.type === "invalidDrive") return print(INVALID_DRIVE);
  if (found.type === "notFound") return print(BAD_COMMAND);
  if (!Object.hasOwn(registry, found.path)) return print(NO_BEHAVIOUR);

  const programme = registry[found.path];

  if (programme.kind === "fullscreen") {
    return launch(() => programme.start(args, context));
  }

  return args.switches.includes("/?")
    ? print(...programme.help)
    : programme.run(args, context);
};
