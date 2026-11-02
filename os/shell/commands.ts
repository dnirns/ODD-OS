import { MACHINE } from "../machine";
import { type Clock, readClock, setDate, setTime } from "./clock";
import { formatDate, formatTime, parseDate, parseTime } from "./dateTime";
import { type ParsedCommand, parseCommand, trimDelimiters } from "./parse";

export type PromptInput = "date" | "time";

export type CommandResult =
  | { readonly type: "print"; readonly lines: readonly string[] }
  | { readonly type: "clear" }
  | {
      readonly type: "ask";
      readonly input: PromptInput;
      readonly lines: readonly string[];
    }
  | { readonly type: "setClock"; readonly clock: Clock };

export type CommandContext = {
  readonly clock: Clock;
  readonly now: number;
};

type Command = {
  readonly summary: string;
  readonly help: readonly string[];
  readonly run: (
    command: ParsedCommand,
    context: CommandContext,
  ) => CommandResult;
};

const BAD_COMMAND = "Bad command or file name";
const INVALID_SWITCH = "Invalid switch";
const TOO_MANY_PARAMETERS = "Too many parameters";

const CONVENTIONAL_KB = 640;
const RESERVED_KB = 384;
const CONVENTIONAL_USED_KB = 57;
const EXTENDED_USED_KB = 64;
const LARGEST_PROGRAM_BYTES = 596_864;

const print = (...lines: readonly string[]): CommandResult => ({
  type: "print",
  lines,
});

const withoutSwitches =
  (run: () => CommandResult) =>
  ({ switches }: ParsedCommand) =>
    switches.length > 0 ? print(INVALID_SWITCH) : run();

const number = (value: number) => value.toLocaleString("en-US");

const memoryRow = (label: string, ...kilobytes: readonly number[]) =>
  label.padEnd(18) +
  kilobytes.map((kb) => `${number(kb)}K`.padStart(7)).join("   ");

const memoryReport = (): readonly string[] => {
  const extended = MACHINE.memoryKb - CONVENTIONAL_KB - RESERVED_KB;
  const rule = "----------------  -------   -------   -------";
  const conventionalFree = CONVENTIONAL_KB - CONVENTIONAL_USED_KB;
  const used = CONVENTIONAL_USED_KB + RESERVED_KB + EXTENDED_USED_KB;

  return [
    "",
    "Memory Type        Total  =   Used  +   Free",
    rule,
    memoryRow("Conventional", CONVENTIONAL_KB, CONVENTIONAL_USED_KB, conventionalFree),
    memoryRow("Upper", 0, 0, 0),
    memoryRow("Reserved", RESERVED_KB, RESERVED_KB, 0),
    memoryRow("Extended (XMS)", extended, EXTENDED_USED_KB, extended - EXTENDED_USED_KB),
    rule,
    memoryRow("Total memory", MACHINE.memoryKb, used, MACHINE.memoryKb - used),
    "",
    memoryRow("Total under 1 MB", CONVENTIONAL_KB, CONVENTIONAL_USED_KB, conventionalFree),
    "",
    `Largest executable program size ${`${conventionalFree}K`.padStart(8)} (${number(LARGEST_PROGRAM_BYTES)} bytes)`,
    `Largest free upper memory block ${"0K".padStart(8)} ${"(0 bytes)".padStart(15)}`,
    "ODD/OS is resident in the high memory area.",
  ];
};

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

const showHelp = (
  { switches, params }: ParsedCommand,
): CommandResult => {
  if (switches.length > 0) return print(INVALID_SWITCH);
  if (params.length > 1) return print(TOO_MANY_PARAMETERS);

  const [topic] = params;
  if (topic === undefined) {
    return print(
      "For more information on a specific command, type HELP command-name",
      ...Object.keys(COMMANDS)
        .toSorted()
        .map((name) => `${name.padEnd(9)}${COMMANDS[name].summary}`),
    );
  }

  const name = topic.toUpperCase();
  return Object.hasOwn(COMMANDS, name)
    ? print(...COMMANDS[name].help)
    : print("Help not available for this command");
};

const COMMANDS: Readonly<Record<string, Command>> = {
  CLS: {
    summary: "Clears the screen.",
    help: ["Clears the screen.", "", "CLS"],
    run: withoutSwitches(() => ({ type: "clear" })),
  },
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
  HELP: {
    summary: "Provides Help information for ODD/OS commands.",
    help: [
      "Provides Help information for ODD/OS commands.",
      "",
      "HELP [command]",
      "",
      "  command - displays help information on that command.",
    ],
    run: showHelp,
  },
  MEM: {
    summary: "Displays the amount of used and free memory in your system.",
    help: ["Displays the amount of used and free memory in your system.", "", "MEM"],
    run: ({ switches, params }) => {
      if (switches.length > 0) return print(INVALID_SWITCH);
      if (params.length > 0) return print(TOO_MANY_PARAMETERS);
      return print(...memoryReport());
    },
  },
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
  VER: {
    summary: "Displays the ODD/OS version.",
    help: ["Displays the ODD/OS version.", "", "VER"],
    run: withoutSwitches(() => print("", "ODD/OS Version 3.14", "")),
  },
};

export const runCommand = (
  line: string,
  context: CommandContext,
): CommandResult => {
  const parsed = parseCommand(line);

  if (!Object.hasOwn(COMMANDS, parsed.name)) return print(BAD_COMMAND);

  const command = COMMANDS[parsed.name];
  return parsed.switches.includes("/?")
    ? print(...command.help)
    : command.run(parsed, context);
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
