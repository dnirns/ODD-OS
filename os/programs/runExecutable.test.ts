import { describe, expect, test, vi } from "vitest";

import type { Disk } from "../fs/disk";
import { directory, opaqueFile } from "../fs/entries";
import { createClock } from "../shell/clock";
import { NO_BEHAVIOUR, runExecutable } from "./registry";
import { print } from "./output";
import type {
  CommandProgramme,
  FullscreenProgramme,
  LaunchContext,
  ProgrammeArgs,
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

const context = (cwd = "C:\\"): LaunchContext => ({
  disk: disk(cwd),
  clock: createClock(0),
  now: 0,
  history: [],
  commands: [],
  environment: [{ name: "PATH", value: "C:\\DOS" }],
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

const WITH_FILES = expect.objectContaining({ write: expect.any(Function) });

const filesGiven = (token: string, cwd = "C:\\") => {
  run(token, args(), cwd);
  const calls = token === "mem" ? vi.mocked(mem.run).mock.lastCall : vi.mocked(game.start).mock.lastCall;
  if (!calls) throw new Error("not run");
  return calls[1].files;
};

describe("Programme file writes are bound to the programme's directory", () => {
  test("a programme in C:\\DOS cannot write C:\\ODDWARE\\X.TXT", () => {
    expect(filesGiven("mem").write(disk(), "C:\\ODDWARE\\X.TXT", "x", 0)).toEqual({ ok: false, error: "AccessDenied" });
  });

  test("C:\\ODDWARE\\GAME.EXE can write C:\\ODDWARE\\X.TXT and C:\\X.TXT", () => {
    const files = filesGiven("game", "C:\\ODDWARE");

    expect(files.write(disk(), "C:\\ODDWARE\\X.TXT", "x", 0).ok).toBe(true);
    expect(files.write(disk(), "C:\\X.TXT", "x", 0).ok).toBe(true);
    expect(files.write(disk(), "C:\\DOS\\X.TXT", "x", 0)).toEqual({ ok: false, error: "AccessDenied" });
  });

  test("the binding follows the file, however it was named", () => {
    const files = filesGiven("\\oddware\\game");

    expect(files.write(disk(), "C:\\ODDWARE\\X.TXT", "x", 0).ok).toBe(true);
  });
});

describe("Command programmes", () => {
  test("receive their arguments and context", () => {
    const given = args("/C");
    const given_context = context();

    runExecutable("mem", given, given_context, registry);

    expect(mem.run).toHaveBeenLastCalledWith(given, { ...given_context, files: WITH_FILES });
  });

  test("print the help text for /? without running", () => {
    vi.mocked(mem.run).mockClear();

    expect(run("mem", args("/?"))).toEqual(print("Memory help."));
    expect(mem.run).not.toHaveBeenCalled();
  });
});

describe("Programmes see the environment", () => {
  test("a command programme receives the variables as a value it can read", () => {
    const environment = [
      { name: "PATH", value: "C:\\DOS" },
      { name: "GREETING", value: "Hello" },
    ];

    runExecutable("mem", args(), { ...context(), environment }, registry);

    const given = vi.mocked(mem.run).mock.lastCall?.[1];
    expect(given?.environment).toEqual(environment);
  });

  test("a programme that changes its copy leaves the interpreter's alone", () => {
    const environment = [{ name: "PATH", value: "C:\\DOS" }];
    const meddling: CommandProgramme = {
      ...mem,
      run: (_, given) => {
        (given.environment as { name: string; value: string }[]).length = 0;
        return print();
      },
    };

    runExecutable(
      "mem",
      args(),
      { ...context(), environment: [...environment] },
      { "C:\\DOS\\MEM.EXE": meddling },
    );

    expect(environment).toEqual([{ name: "PATH", value: "C:\\DOS" }]);
  });

  test("the search follows the PATH it is given", () => {
    const onlyOddware = [{ name: "PATH", value: "C:\\ODDWARE" }];

    expect(runExecutable("mem", args(), { ...context(), environment: onlyOddware }, registry)).toEqual(
      print("Bad command or file name"),
    );
    expect(runExecutable("game", args(), { ...context(), environment: onlyOddware }, registry).type).toBe("launch");
  });
});

describe("Fullscreen programmes", () => {
  test("are started and launched", () => {
    expect(run("game", args("/X"), "C:\\ODDWARE")).toEqual({
      type: "launch",
      running,
    });
    expect(game.start).toHaveBeenLastCalledWith(args("/X"), { ...context("C:\\ODDWARE"), files: WITH_FILES });
  });

  test("a programme that fails to start returns to the prompt", () => {
    expect(run("crash")).toEqual(print());
  });
});
