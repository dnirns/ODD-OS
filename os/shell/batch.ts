import { type Environment, getVariable } from "../environment/environment";
import type { CommandResult } from "./commands";

export const MAX_LINE_LENGTH = 127;

const END_OF_FILE = "\x1A";
const DELIMITERS = /[ \t,;=]+/;
const LEADING_BLANKS = /^[ \t,;=]+/;
const DIGIT = /^[0-9]$/;

// How a pacing batch waits: before its first line, before each later line,
// before showing a command's output, and before the final prompt.
export type Pace = {
  readonly firstMs: number;
  readonly lineMs: number;
  readonly outputMs: number;
  readonly endMs: number;
};

// A batch file being run. The lines are those of the file when it started.
export type BatchFrame = {
  readonly lines: readonly string[];
  readonly next: number;
  // `%0`, the name typed, then `%1` to `%9`.
  readonly params: readonly string[];
  // The ECHO setting to put back when the batch ends.
  readonly echoWas: boolean;
  // Whether lines are echoed at all; the startup without a file is silent.
  readonly echoes: boolean;
  // A row left blank before the first line, as after `Starting ODD/OS...`.
  readonly leadingBlank: boolean;
  readonly pace: Pace | undefined;
  // A command already run whose output is still to be shown.
  readonly pending: CommandResult | undefined;
};

// The lines of a batch file's text. A line break is CR LF or LF, and the
// end-of-file character ends the file. Blank lines are skipped.
export const batchLines = (text: string): readonly string[] =>
  text
    .split(END_OF_FILE, 1)[0]
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim() !== "");

// `%0` is the name typed; `%1` to `%9` are the first nine words after it.
export const batchParams = (name: string, tail: string): readonly string[] => [
  name,
  ...tail.split(DELIMITERS).filter((word) => word !== "").slice(0, 9),
];

export type BatchLine =
  | { readonly type: "label" }
  | { readonly type: "line"; readonly quiet: boolean; readonly text: string };

// A line whose first non-delimiter is `:` is a label, and one starting `@` is
// run without being echoed.
export const classifyLine = (raw: string): BatchLine => {
  const text = raw.replace(LEADING_BLANKS, "");

  if (text.startsWith(":")) return { type: "label" };
  if (text.startsWith("@")) return { type: "line", quiet: true, text: text.slice(1) };
  return { type: "line", quiet: false, text: raw };
};

// Replaces `%0` to `%9`, `%NAME%` and `%%` as COMMAND.COM does when it reads a
// line of a batch file. A `%` with no closing `%` stays as typed.
export const expandLine = (
  line: string,
  params: readonly string[],
  environment: Environment,
): string => {
  let result = "";
  let index = 0;

  while (index < line.length && result.length < MAX_LINE_LENGTH) {
    const char = line[index];
    const following = line[index + 1];

    if (char !== "%" || following === undefined) {
      result += char;
      index += 1;
    } else if (following === "%") {
      result += "%";
      index += 2;
    } else if (DIGIT.test(following)) {
      result += params[Number(following)] ?? "";
      index += 2;
    } else {
      const close = line.indexOf("%", index + 1);

      if (close === -1) {
        result += line.slice(index);
        index = line.length;
      } else {
        result += getVariable(environment, line.slice(index + 1, close)) ?? "";
        index = close + 1;
      }
    }
  }

  return result.slice(0, MAX_LINE_LENGTH);
};

// A result that shows nothing, so a pacing batch need not wait to show it.
export const isQuiet = (result: CommandResult): boolean => {
  switch (result.type) {
    case "print":
    case "files":
      return result.lines.length === 0;
    case "setEcho":
    case "setClock":
    case "setEnvironment":
    case "setDirectory":
    case "leave":
      return true;
    case "withDisk":
      return isQuiet(result.result);
    default:
      return false;
  }
};
