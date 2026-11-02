import { INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "./output";
import type { CommandProgramme } from "./types";

const SUMMARY = "Edits command lines and recalls ODD/OS commands.";

export const DOSKEY: CommandProgramme = {
  kind: "command",
  summary: SUMMARY,
  help: [
    SUMMARY,
    "",
    "DOSKEY [/HISTORY] [/INSERT]",
    "",
    "  /HISTORY  Displays all commands stored in memory.",
    "  /INSERT   Puts the keyboard in insert mode each time you press ENTER.",
    "            Insert mode is already the default.",
  ],
  run: ({ switches, params }, { history }) => {
    if (switches.some((option) => option !== "/HISTORY" && option !== "/INSERT")) {
      return print(INVALID_SWITCH);
    }
    if (params.length > 0) return print(TOO_MANY_PARAMETERS);

    return switches.includes("/HISTORY") ? print(...history) : print();
  },
};
