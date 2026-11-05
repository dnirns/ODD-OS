import type { Environment } from "../environment/environment";
import { createDisk, type Disk } from "../fs/disk";
import type { Filesystem } from "../fs/types";
import { readClock } from "./clock";
import { type CommandResult, runCommand } from "./commands";
import { STARTING_ENVIRONMENT } from "./environmentCommands";

// Test support: runs command lines as the shell would, without a screen.

export const NOW = Date.UTC(2026, 10, 1, 12, 0);
export const CLOCK = { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - NOW };
export const DOS_NOW = readClock(CLOCK, NOW);

export type Session = {
  readonly disk: Disk;
  readonly environment: Environment;
  readonly result: CommandResult | undefined;
  // Everything printed, with each question's prompt and answer on one row.
  readonly shown: readonly string[];
};

const printedBy = (result: CommandResult): readonly string[] => {
  switch (result.type) {
    case "print":
    case "files":
    case "page":
    case "nest":
    case "ask":
      return result.lines;
    case "question":
      return [...result.lines, result.prompt];
    default:
      return [];
  }
};

const step = ({ disk, environment, result, shown }: Session, line: string): Session => {
  const context = { clock: CLOCK, now: NOW, disk, environment };
  const next = result?.type === "question" ? result.answer(line, context) : runCommand(line, context);
  const echoed = result?.type === "question" ? [...shown.slice(0, -1), `${shown.at(-1) ?? ""}${line}`] : shown;
  const after = [...echoed, ...printedBy(next)];

  switch (next.type) {
    case "files":
      return { disk: next.disk, environment, result: next, shown: after };
    case "setDirectory":
      return { disk: { ...disk, cwd: next.cwd }, environment, result: next, shown: after };
    case "setEnvironment":
      return { disk, environment: next.environment, result: next, shown: after };
    default:
      return { disk, environment, result: next, shown: after };
  }
};

// Runs lines in turn. While a question is pending, the next line answers it.
export const session = (disk: Disk, ...lines: readonly string[]): Session =>
  lines.reduce(step, { disk, environment: STARTING_ENVIRONMENT, result: undefined, shown: [] });

export const fromRoot = (...lines: readonly string[]) => session(createDisk(), ...lines);

export const onDisk = (filesystem: Filesystem, ...lines: readonly string[]) =>
  session({ filesystem, cwd: "C:\\" }, ...lines);

// The lines the last result printed.
export const lines = ({ result }: Session) => (result ? printedBy(result) : []);
