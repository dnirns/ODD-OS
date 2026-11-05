import {
  type Environment,
  getVariable,
  listVariables,
  removeVariable,
  setVariable,
} from "../environment/environment";
import { print, TOO_MANY_PARAMETERS } from "../programs/output";
import type { CommandContext, CommandResult } from "./commands";
import type { ParsedCommand } from "./parse";

export const SYNTAX_ERROR = "Syntax error";
export const NO_PATH = "No Path";

const PATH = "PATH";
const PROMPT = "PROMPT";

const LEADING_DELIMITERS = /^[ \t,;=]+/;
// `;` is not a delimiter in `PATH`: it separates directories.
const LEADING_PATH_DELIMITERS = /^[ \t,=]+/;
const PATH_DELIMITER = /[ \t,=]/;
const BLANK = /^[ \t]*$/;

const COMSPEC_VALUE = "C:\\COMMAND.COM";

// What a command does to an environment: a new one, an error to print, or
// nothing to change because it only shows something.
type Applied =
  | { readonly type: "set"; readonly environment: Environment }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "show" };

const set = (environment: Environment): Applied => ({ type: "set", environment });
const failed = (message: string): Applied => ({ type: "error", message });
const show: Applied = { type: "show" };

const applySet = (environment: Environment, rest: string): Applied => {
  const text = rest.replace(LEADING_DELIMITERS, "");
  if (text === "") return show;

  const parts = text.split("=");
  const [name, value] = parts;
  if (parts.length !== 2 || name === "") return failed(SYNTAX_ERROR);

  return set(
    value === ""
      ? removeVariable(environment, name)
      : setVariable(environment, name, value),
  );
};

const applyPath = (environment: Environment, rest: string): Applied => {
  const text = rest.replace(LEADING_PATH_DELIMITERS, "");
  if (text === "") return show;

  if (text.startsWith(";")) {
    return BLANK.test(text.slice(1))
      ? set(removeVariable(environment, PATH))
      : failed(TOO_MANY_PARAMETERS);
  }

  const end = text.search(PATH_DELIMITER);
  const path = end === -1 ? text : text.slice(0, end);
  const remainder = end === -1 ? "" : text.slice(end + 1);

  return BLANK.test(remainder)
    ? set(setVariable(environment, PATH, path.toUpperCase()))
    : failed(TOO_MANY_PARAMETERS);
};

const applyPrompt = (environment: Environment, rest: string): Applied => {
  const text = rest.replace(LEADING_DELIMITERS, "");

  return set(
    text === ""
      ? removeVariable(environment, PROMPT)
      : setVariable(environment, PROMPT, text),
  );
};

// What the computer starts with, before `AUTOEXEC.BAT` runs.
export const STARTING_ENVIRONMENT: Environment = setVariable([], "COMSPEC", COMSPEC_VALUE);

// What the stock `AUTOEXEC.BAT` leaves, which tests start from rather than
// running the file. A consistency test checks it against a real startup.
export const STOCK_ENVIRONMENT: Environment = setVariable(
  setVariable(STARTING_ENVIRONMENT, "PATH", "C:\\DOS"),
  "PROMPT",
  "$P$G",
);

export const environmentOf = ({
  environment = STOCK_ENVIRONMENT,
}: CommandContext) => environment;

const result = (applied: Applied, otherwise: CommandResult): CommandResult => {
  switch (applied.type) {
    case "set":
      return { type: "setEnvironment", environment: applied.environment };
    case "error":
      return print(applied.message);
    case "show":
      return otherwise;
  }
};

export const SET_SUMMARY = "Displays, sets, or removes ODD/OS environment variables.";
export const SET_HELP: readonly string[] = [
  SET_SUMMARY,
  "",
  "SET [variable=[string]]",
  "",
  "  variable  Specifies the environment-variable name.",
  "  string    Specifies a series of characters to assign to the variable.",
  "",
  "Type SET without parameters to display the current environment variables.",
];

export const runSet = ({ rest }: ParsedCommand, context: CommandContext): CommandResult => {
  const environment = environmentOf(context);

  return result(applySet(environment, rest), print(...listVariables(environment)));
};

export const PATH_SUMMARY = "Displays or sets a search path for executable files.";
export const PATH_HELP: readonly string[] = [
  PATH_SUMMARY,
  "",
  "PATH [[drive:]path[;...]]",
  "PATH ;",
  "",
  "Type PATH ; to clear all search-path settings and direct ODD/OS to search",
  "only in the current directory.",
  "Type PATH without parameters to display the current path.",
];

export const runPath = ({ rest }: ParsedCommand, context: CommandContext): CommandResult => {
  const environment = environmentOf(context);
  const path = getVariable(environment, PATH);

  return result(
    applyPath(environment, rest),
    print(path === undefined ? NO_PATH : `${PATH}=${path}`),
  );
};

export const PROMPT_SUMMARY = "Changes the ODD/OS command prompt.";
export const PROMPT_HELP: readonly string[] = [
  PROMPT_SUMMARY,
  "",
  "PROMPT [text]",
  "",
  "  text  Specifies a new command prompt.",
  "",
  "Prompt can be made up of normal characters and the following special codes:",
  "",
  "  $Q   = (equal sign)",
  "  $$   $ (dollar sign)",
  "  $T   Current time",
  "  $D   Current date",
  "  $P   Current drive and path",
  "  $V   ODD/OS version number",
  "  $N   Current drive",
  "  $G   > (greater-than sign)",
  "  $L   < (less-than sign)",
  "  $B   | (pipe)",
  "  $_   ENTER-LINEFEED",
  "  $E   ASCII escape code (code 27)",
  "  $H   Backspace (erases previous character)",
  "",
  "Type PROMPT without parameters to reset the prompt to the default setting.",
];

export const runPrompt = ({ rest }: ParsedCommand, context: CommandContext): CommandResult =>
  result(applyPrompt(environmentOf(context), rest), print());
