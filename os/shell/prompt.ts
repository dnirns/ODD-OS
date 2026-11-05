import { type Environment, getVariable } from "../environment/environment";
import { VERSION } from "../version";
import { formatDate, formatPromptTime } from "./dateTime";

// The prompt before any `PROMPT` command runs, as MS-DOS 6.x prints it while
// it reads `AUTOEXEC.BAT`.
export const PROMPT = "C:\\>";

const ESCAPE = "\u001b";
const LINE_BREAK = "\n";

// What each code of `PROMPT` stands for. `$H` erases and is handled apart.
const code = (letter: string, cwd: string, date: Date): string => {
  switch (letter.toUpperCase()) {
    case "Q":
      return "=";
    case "$":
      return "$";
    case "T":
      return formatPromptTime(date);
    case "D":
      return formatDate(date);
    case "P":
      return cwd;
    case "V":
      return VERSION;
    case "N":
      return cwd.slice(0, 1);
    case "G":
      return ">";
    case "L":
      return "<";
    case "B":
      return "|";
    case "_":
      return LINE_BREAK;
    case "E":
      return ESCAPE;
    default:
      return "";
  }
};

const expand = (text: string, cwd: string, date: Date): string => {
  let result = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char !== "$") {
      result += char;
    } else if (index + 1 < text.length) {
      index += 1;
      const letter = text[index];

      if (letter.toUpperCase() === "H") {
        if (result !== "" && !result.endsWith(LINE_BREAK)) result = result.slice(0, -1);
      } else {
        result += code(letter, cwd, date);
      }
    }
  }

  return result;
};

// The text of the command prompt, with a line break where `$_` stands. It is
// worked out each time the prompt is shown.
export const formatPrompt = (
  environment: Environment,
  cwd: string,
  date: Date,
): string => {
  const text = getVariable(environment, "PROMPT");

  return text === undefined ? `${cwd.slice(0, 1)}>` : expand(text, cwd, date);
};
