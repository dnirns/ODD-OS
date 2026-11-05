import type { Environment } from "../environment/environment";
import type { Disk } from "../fs/disk";
import {
  INVALID_DRIVE,
  INVALID_SWITCH,
  print,
} from "../programs/output";
import { PROGRAMMES, runExecutable } from "../programs/registry";
import { splitExecutableLine } from "../programs/resolve";
import type {
  BatchResult,
  CommandInfo,
  InstallResult,
  LaunchResult,
  Registry,
} from "../programs/types";
import { VERSION } from "../version";
import { type Clock, readClock, setDate, setTime } from "./clock";
import { formatDate, formatTime, parseDate, parseTime } from "./dateTime";
import { COPY_HELP, COPY_SUMMARY, runCopy } from "./copy";
import { DEL_HELP, DEL_SUMMARY, runDel } from "./delete";
import { REN_HELP, REN_SUMMARY, runRen } from "./rename";
import { MD_HELP, MD_SUMMARY, RD_HELP, RD_SUMMARY, runMd, runRd } from "./dirCommands";
import { ECHO_HELP, ECHO_SUMMARY, runEcho } from "./echo";
import {
  environmentOf,
  PATH_HELP,
  PATH_SUMMARY,
  PROMPT_HELP,
  PROMPT_SUMMARY,
  runPath,
  runPrompt,
  runSet,
  SET_HELP,
  SET_SUMMARY,
} from "./environmentCommands";
import {
  CD_HELP,
  CD_SUMMARY,
  DIR_HELP,
  DIR_SUMMARY,
  runCd,
  runDir,
  runType,
  TYPE_HELP,
  TYPE_SUMMARY,
} from "./fileCommands";
import {
  type ParsedCommand,
  parseArguments,
  parseCommand,
  parseDriveCommand,
  trimDelimiters,
} from "./parse";

export type PromptInput = "date" | "time";

// How a question reads its answer: one line, lines until one holding the
// end-of-file character for `COPY CON`, or any key, for a redirected pause.
export type QuestionRead = "line" | "file" | "key";

export const PROMPT_TEXT: Readonly<Record<PromptInput, string>> = {
  date: "Enter new date (mm-dd-yy): ",
  time: "Enter new time: ",
};

export const PAUSE_MESSAGE = "Press any key to continue . . .";

// Carries a command on with what the visitor typed. Its state lives in the
// closure, as a fullscreen programme's does.
export type Answer = (text: string, context: CommandContext) => CommandResult;

export type CommandResult =
  | { readonly type: "print"; readonly lines: readonly string[] }
  | { readonly type: "clear" }
  | {
      readonly type: "ask";
      readonly input: PromptInput;
      readonly lines: readonly string[];
    }
  | { readonly type: "setClock"; readonly clock: Clock }
  | { readonly type: "setDirectory"; readonly cwd: string }
  | { readonly type: "page"; readonly lines: readonly string[] }
  | { readonly type: "nest"; readonly lines: readonly string[] }
  | { readonly type: "leave" }
  | { readonly type: "files"; readonly disk: Disk; readonly lines: readonly string[] }
  | { readonly type: "setEcho"; readonly echo: boolean }
  | { readonly type: "setEnvironment"; readonly environment: Environment }
  // Another result, applied after the disk changes, as when its output is
  // redirected to a file.
  | { readonly type: "withDisk"; readonly disk: Disk; readonly result: CommandResult }
  | {
      readonly type: "question";
      readonly lines: readonly string[];
      readonly prompt: string;
      readonly read: QuestionRead;
      readonly answer: Answer;
    }
  | InstallResult
  | BatchResult
  | LaunchResult;

export type CommandContext = {
  readonly clock: Clock;
  readonly now: number;
  readonly disk: Disk;
  readonly history?: readonly string[];
  readonly programmes?: Registry;
  readonly echo?: boolean;
  // Defaults to what the boot leaves.
  readonly environment?: Environment;
  readonly doskeyLoaded?: boolean;
};

type Command = {
  readonly summary: string;
  readonly help: readonly string[];
  readonly run: (
    command: ParsedCommand,
    context: CommandContext,
  ) => CommandResult;
};

const withoutSwitches =
  (run: () => CommandResult) =>
  ({ switches }: ParsedCommand) =>
    switches.length > 0 ? print(INVALID_SWITCH) : run();

const askDate = (...lines: readonly string[]): CommandResult => ({
  type: "ask",
  input: "date",
  lines,
});

const askTime = (...lines: readonly string[]): CommandResult => ({
  type: "ask",
  input: "time",
  lines,
});

const applyDate = (text: string, { clock, now }: CommandContext) => {
  const date = parseDate(text);

  return date
    ? ({ type: "setClock", clock: setDate(clock, now, date) } as const)
    : askDate("", "Invalid date");
};

const applyTime = (text: string, { clock, now }: CommandContext) => {
  const time = parseTime(text);

  return time
    ? ({ type: "setClock", clock: setTime(clock, now, time) } as const)
    : askTime("", "Invalid time");
};

const COMMANDS: Readonly<Record<string, Command>> = {
  CD: { summary: CD_SUMMARY, help: CD_HELP, run: runCd },
  CHDIR: { summary: CD_SUMMARY, help: CD_HELP, run: runCd },
  CLS: {
    summary: "Clears the screen.",
    help: ["Clears the screen.", "", "CLS"],
    run: withoutSwitches(() => ({ type: "clear" })),
  },
  DEL: { summary: DEL_SUMMARY, help: DEL_HELP, run: runDel },
  DIR: { summary: DIR_SUMMARY, help: DIR_HELP, run: runDir },
  COPY: { summary: COPY_SUMMARY, help: COPY_HELP, run: runCopy },
  DATE: {
    summary: "Displays or sets the date.",
    help: [
      "Displays or sets the date.",
      "",
      "DATE [date]",
      "",
      "Type DATE without parameters to display the current date setting and",
      "a prompt for a new one.  Press ENTER to keep the same date.",
    ],
    run: ({ tail }, context) =>
      tail === ""
        ? askDate(
            `Current date is ${formatDate(readClock(context.clock, context.now))}`,
          )
        : applyDate(tail, context),
  },
  ECHO: { summary: ECHO_SUMMARY, help: ECHO_HELP, run: runEcho },
  ERASE: { summary: DEL_SUMMARY, help: DEL_HELP, run: runDel },
  EXIT: {
    summary: "Quits the command interpreter.",
    help: ["Quits the command interpreter.", "", "EXIT"],
    run: withoutSwitches((): CommandResult => ({ type: "leave" })),
  },
  MD: { summary: MD_SUMMARY, help: MD_HELP, run: runMd },
  PAUSE: {
    summary: "Suspends processing of a batch file and displays a message.",
    help: [
      "Suspends processing of a batch file and displays a message.",
      "",
      "PAUSE",
    ],
    run: (): CommandResult => ({
      type: "question",
      lines: [],
      prompt: PAUSE_MESSAGE,
      read: "key",
      answer: () => print(),
    }),
  },
  REM: {
    summary: "Records comments (remarks) in a batch file.",
    help: ["Records comments (remarks) in a batch file.", "", "REM [comment]"],
    run: () => print(),
  },
  PATH: { summary: PATH_SUMMARY, help: PATH_HELP, run: runPath },
  PROMPT: { summary: PROMPT_SUMMARY, help: PROMPT_HELP, run: runPrompt },
  SET: { summary: SET_SUMMARY, help: SET_HELP, run: runSet },
  MKDIR: { summary: MD_SUMMARY, help: MD_HELP, run: runMd },
  RD: { summary: RD_SUMMARY, help: RD_HELP, run: runRd },
  RMDIR: { summary: RD_SUMMARY, help: RD_HELP, run: runRd },
  REN: { summary: REN_SUMMARY, help: REN_HELP, run: runRen },
  RENAME: { summary: REN_SUMMARY, help: REN_HELP, run: runRen },
  TIME: {
    summary: "Displays or sets the system time.",
    help: [
      "Displays or sets the system time.",
      "",
      "TIME [time]",
      "",
      "Type TIME with no parameters to display the current time setting and a prompt",
      "for a new one.  Press ENTER to keep the same time.",
    ],
    run: ({ tail }, context) =>
      tail === ""
        ? askTime(
            `Current time is ${formatTime(readClock(context.clock, context.now))}`,
          )
        : applyTime(tail, context),
  },
  TYPE: { summary: TYPE_SUMMARY, help: TYPE_HELP, run: runType },
  VER: {
    summary: "Displays the ODD/OS version.",
    help: ["Displays the ODD/OS version.", "", "VER"],
    run: withoutSwitches(() => print("", VERSION, "")),
  },
};

const PROGRAMME_NAME = /([^\\/:]+?)(?:\.[^.\\/:]*)?$/;

const programmeInfo = (path: string, summary: string, help: readonly string[]): CommandInfo => ({
  name: (PROGRAMME_NAME.exec(path)?.[1] ?? path).toUpperCase(),
  summary,
  help,
});

const commandList = (registry: Registry): readonly CommandInfo[] => [
  ...Object.entries(COMMANDS).map(([name, { summary, help }]) => ({ name, summary, help })),
  ...Object.entries(registry).flatMap(([path, programme]) =>
    programme.kind === "command"
      ? [programmeInfo(path, programme.summary, programme.help)]
      : [],
  ),
];

export const runCommand = (
  line: string,
  context: CommandContext,
): CommandResult => {
  const drive = parseDriveCommand(line);
  if (drive !== undefined) {
    return drive === "C"
      ? { type: "setDirectory", cwd: context.disk.cwd }
      : print(INVALID_DRIVE);
  }

  const parsed = parseCommand(line);

  if (Object.hasOwn(COMMANDS, parsed.name)) {
    const command = COMMANDS[parsed.name];
    return parsed.switches.includes("/?")
      ? print(...command.help)
      : command.run(parsed, context);
  }

  const { token, rest } = splitExecutableLine(line);
  const { disk, clock, now, history = [], programmes = PROGRAMMES } = context;

  return runExecutable(
    token,
    parseArguments(rest),
    {
      disk,
      clock,
      now,
      history,
      commands: commandList(programmes),
      environment: environmentOf(context),
      doskeyLoaded: context.doskeyLoaded,
    },
    programmes,
  );
};

export const answerPrompt = (
  input: PromptInput,
  line: string,
  context: CommandContext,
): CommandResult => {
  const text = trimDelimiters(line);

  if (text === "") return print();
  return input === "date" ? applyDate(text, context) : applyTime(text, context);
};
