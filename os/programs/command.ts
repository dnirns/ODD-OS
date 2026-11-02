import { VERSION } from "../version";
import { INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "./output";
import type { CommandProgramme } from "./types";

const SUMMARY = "Starts a new instance of the ODD/OS command interpreter.";

export const BANNER: readonly string[] = [
  "",
  "",
  VERSION,
  "(C)Copyright Ordinary Data Devices, Inc. 1993",
];

export const COMMAND: CommandProgramme = {
  kind: "command",
  summary: SUMMARY,
  help: [
    SUMMARY,
    "",
    "COMMAND",
    "",
    "Type EXIT to quit the new command interpreter and return to the one that",
    "started it.",
  ],
  run: ({ switches, params }) => {
    if (switches.length > 0) return print(INVALID_SWITCH);
    if (params.length > 0) return print(TOO_MANY_PARAMETERS);
    return { type: "nest", lines: BANNER };
  },
};
