import { print } from "../programs/output";
import type { CommandContext, CommandResult } from "./commands";
import { type ParsedCommand, trimDelimiters } from "./parse";

export const ECHO_SUMMARY = "Displays messages, or turns command-echoing on or off.";

export const ECHO_HELP: readonly string[] = [
  ECHO_SUMMARY,
  "",
  "  ECHO [ON | OFF]",
  "  ECHO [message]",
  "",
  "Type ECHO without parameters to display the current echo setting.",
];

// The message starts one character after the name, so `ECHO.` prints an empty
// row and `ECHO  x` keeps the second space.
export const runEcho = ({ rest }: ParsedCommand, { echo = true }: CommandContext): CommandResult => {
  const setting = trimDelimiters(rest).toUpperCase();

  if (setting === "") return print(`ECHO is ${echo ? "on" : "off"}`);
  if (setting === "ON" || setting === "OFF") return { type: "setEcho", echo: setting === "ON" };
  return print(rest.slice(1));
};
