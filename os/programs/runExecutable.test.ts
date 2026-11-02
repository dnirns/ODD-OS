import { describe, expect, test, vi } from "vitest";

import type { Disk } from "../fs/disk";
import { directory, opaqueFile } from "../fs/entries";
import { createClock } from "../shell/clock";
import { NO_BEHAVIOUR, runExecutable } from "./registry";
import { print } from "./output";
import type {
  CommandProgramme,
  FullscreenProgramme,
  ProgrammeArgs,
  ProgrammeContext,
  Registry,
  Running,
} from "./types";
import { createScreen } from "../terminal/screen";

const WHEN = new Date(Date.UTC(1993, 2, 10, 6, 0));

const disk = (cwd = "C:\\"): Disk => ({
  filesystem: {
    root: directory("", WHEN, [
      directory("DOS", WHEN, [
        opaqueFile("MEM.EXE", WHEN, 100),
        opaqueFile("BAD.EXE", WHEN, 100),
        opaqueFile("CRASH.COM", WHEN, 100),
      ]),
      directory("ODDWARE", WHEN, [opaqueFile("GAME.EXE", WHEN, 100)]),
      opaqueFile("ORPHAN.EXE", WHEN, 100),
    ]),
  },
  cwd,
});

const args = (...switches: string[]): ProgrammeArgs => ({
  tail: switches.join(" "),
  params: [],
  switches,
});

const context = (cwd = "C:\\"): ProgrammeContext => ({
  disk: disk(cwd),
  clock: createClock(0),
  now: 0,
  history: [],
  commands: [],
});

const mem: CommandProgramme = {
  kind: "command",
  summary: "Memory.",
  help: ["Memory help."],
  run: vi.fn(() => print("report")),
};

const running: Running = {
  type: "running",
  screen: createScreen(),
  step: () => ({ type: "exit" }),
};

const game: FullscreenProgramme = { kind: "fullscreen", start: vi.fn(() => running) };

const crash: FullscreenProgramme = {
  kind: "fullscreen",
  start: () => {
    throw new Error("boom");
  },
};

const registry: Registry = {
  "C:\\DOS\\MEM.EXE": mem,
  "C:\\ODDWARE\\GAME.EXE": game,
  "C:\\DOS\\CRASH.COM": crash,
};

const run = (token: string, programmeArgs = args(), cwd = "C:\\") =>
  runExecutable(token, programmeArgs, context(cwd), registry);

describe("Behaviour belongs to the file", () => {
  test("two spellings reach the same programme", () => {
    expect(run("mem")).toEqual(print("report"));
    expect(run("\\dos\\MEM.EXE")).toEqual(print("report"));
    expect(run("MEM", args(), "C:\\ODDWARE")).toEqual(print("report"));
  });

  test("a file with no registered behaviour fails in character", () => {
    expect(run("bad")).toEqual(print(NO_BEHAVIOUR));
    expect(run("orphan")).toEqual(print(NO_BEHAVIOUR));
    expect(run("orphan", args(), "C:\\ODDWARE")).toEqual(print("Bad command or file name"));
    expect(run("\\orphan", args(), "C:\\ODDWARE")).toEqual(print(NO_BEHAVIOUR));
  });

  test("the failure message is the DOS one", () => {
    expect(NO_BEHAVIOUR).toBe("Program too big to fit in memory");
  });

  test("a name that resolves to nothing is a bad command", () => {
    expect(run("nothing")).toEqual(print("Bad command or file name"));
  });

  test("another drive is an invalid drive", () => {
    expect(run("a:mem")).toEqual(print("Invalid drive specification"));
  });
});

describe("Command programmes", () => {
  test("receive their arguments and context", () => {
    const given = args("/C");
    const given_context = context();

    runExecutable("mem", given, given_context, registry);

    expect(mem.run).toHaveBeenLastCalledWith(given, given_context);
  });

  test("print the help text for /? without running", () => {
    vi.mocked(mem.run).mockClear();

    expect(run("mem", args("/?"))).toEqual(print("Memory help."));
    expect(mem.run).not.toHaveBeenCalled();
  });
});

describe("Fullscreen programmes", () => {
  test("are started and launched", () => {
    expect(run("game", args("/X"), "C:\\ODDWARE")).toEqual({
      type: "launch",
      running,
    });
    expect(game.start).toHaveBeenLastCalledWith(args("/X"), context("C:\\ODDWARE"));
  });

  test("a programme that fails to start returns to the prompt", () => {
    expect(run("crash")).toEqual(print());
  });
});
