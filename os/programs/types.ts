import type { Environment } from "../environment/environment";
import type { Disk } from "../fs/disk";
import type { Attributes, Result } from "../fs/types";
import type { Clock } from "../shell/clock";
import type { ShellKey } from "../shell/shellKeys";
import type { Screen } from "../terminal/screen";
import type { FilesResult, PageResult, PrintResult } from "./output";

// The keys a programme receives are the keys the command line decodes.
export type ProgrammeKey = ShellKey;

export type ProgrammeArgs = {
  // Everything after the programme's name, exactly as typed, as MS-DOS hands
  // a programme its command tail.
  readonly rest: string;
  readonly tail: string;
  readonly params: readonly string[];
  readonly switches: readonly string[];
};

export type CommandInfo = {
  readonly name: string;
  readonly summary: string;
  readonly help: readonly string[];
};

// What the shell knows when it runs a programme. All of it is a read-only value.
export type LaunchContext = {
  readonly disk: Disk;
  readonly clock: Clock;
  readonly now: number;
  readonly history: readonly string[];
  readonly commands: readonly CommandInfo[];
  // A copy: a programme cannot change its parent's environment.
  readonly environment: Environment;
  // Whether DOSKEY has been run since the computer started.
  readonly doskeyLoaded?: boolean;
};

// The only ways a programme changes the disk. Each takes a disk and returns a
// new one; the programme returns that disk when it finishes.
export type ProgrammeFiles = {
  readonly write: (disk: Disk, path: string, text: string, now: number) => Result<Disk>;
  // Replaces the attributes of a file or directory anywhere on the drive.
  readonly setAttributes: (disk: Disk, path: string, attributes: Attributes) => Result<Disk>;
};

// Everything a programme may know and use.
export type ProgrammeContext = LaunchContext & {
  readonly files: ProgrammeFiles;
};

export type NestResult = {
  readonly type: "nest";
  readonly lines: readonly string[];
};

// A batch file to run: the name as typed, its text and what followed the name.
export type BatchResult = {
  readonly type: "batch";
  readonly name: string;
  readonly text: string;
  readonly tail: string;
};

// DOSKEY, once it has installed itself, and what it printed.
export type InstallResult = {
  readonly type: "installDoskey";
  readonly lines: readonly string[];
};

export type ProgrammeOutput = PrintResult | PageResult | NestResult | InstallResult | FilesResult;

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
