import type { Disk } from "../fs/disk";
import type { Clock } from "../shell/clock";
import type { ShellKey } from "../shell/shellKeys";
import type { Screen } from "../terminal/screen";
import type { PageResult, PrintResult } from "./output";

// The keys a programme receives are the keys the command line decodes.
export type ProgrammeKey = ShellKey;

export type ProgrammeArgs = {
  readonly tail: string;
  readonly params: readonly string[];
  readonly switches: readonly string[];
};

export type CommandInfo = {
  readonly name: string;
  readonly summary: string;
  readonly help: readonly string[];
};

// Everything a programme may know. All of it is a read-only value.
export type ProgrammeContext = {
  readonly disk: Disk;
  readonly clock: Clock;
  readonly now: number;
  readonly history: readonly string[];
  readonly commands: readonly CommandInfo[];
};

export type NestResult = {
  readonly type: "nest";
  readonly lines: readonly string[];
};

export type ProgrammeOutput = PrintResult | PageResult | NestResult;

export type ProgrammeEvent =
  | { readonly type: "key"; readonly key: ProgrammeKey; readonly now: number }
  | { readonly type: "tick"; readonly now: number };

export type Exited = {
  readonly type: "exit";
  readonly disk?: Disk;
};

// A fullscreen programme is a value: its state lives in the closure of `step`.
export type Running = {
  readonly type: "running";
  readonly screen: Screen;
  readonly tickMs?: number;
  readonly step: (event: ProgrammeEvent) => Running | Exited;
};

export type CommandProgramme = {
  readonly kind: "command";
  readonly summary: string;
  readonly help: readonly string[];
  readonly run: (
    args: ProgrammeArgs,
    context: ProgrammeContext,
  ) => ProgrammeOutput;
};

export type FullscreenProgramme = {
  readonly kind: "fullscreen";
  readonly start: (args: ProgrammeArgs, context: ProgrammeContext) => Running;
};

export type Programme = CommandProgramme | FullscreenProgramme;

// Keyed by the canonical upper-case full path, such as `C:\DOS\MEM.EXE`.
export type Registry = Readonly<Record<string, Programme>>;

export type LaunchResult = {
  readonly type: "launch";
  readonly running: Running;
};
