import { INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "./output";
import type { CommandProgramme } from "./types";

const SUMMARY = "Provides Help information for ODD/OS commands.";

export const HELP: CommandProgramme = {
  kind: "command",
  summary: SUMMARY,
  help: [
    SUMMARY,
    "",
    "HELP [command]",
    "",
    "  command - displays help information on that command.",
  ],
  run: ({ switches, params }, { commands }) => {
    if (switches.length > 0) return print(INVALID_SWITCH);
    if (params.length > 1) return print(TOO_MANY_PARAMETERS);

    const [topic] = params;
    if (topic === undefined) {
      return {
        type: "page",
        lines: [
          "For more information on a specific command, type HELP command-name",
          ...commands
            .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
            .map(({ name, summary }) => `${name.padEnd(9)}${summary}`),
        ],
      };
    }

    const found = commands.find(({ name }) => name === topic.toUpperCase());
    return found
      ? print(...found.help)
      : print("Help not available for this command");
  },
};
