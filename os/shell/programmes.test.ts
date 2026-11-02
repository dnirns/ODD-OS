import { describe, expect, test } from "vitest";

import { createDisk, type Disk } from "../fs/disk";
import { writeFile } from "../fs/operations";
import { BANNER } from "../programs/command";
import { print } from "../programs/output";
import { PROGRAMMES } from "../programs/registry";
import { createScreen, moveCursor, type Screen, writeText } from "../terminal/screen";
import { type CommandContext, runCommand } from "./commands";
import { PROMPT } from "./prompt";
import { createShell, reduceShell, type ShellState } from "./shell";
import type { ShellKey } from "./shellKeys";

const NOW = Date.UTC(2026, 10, 1, 12, 0);
const CLOCK = { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - NOW };

const contextAt = (cwd = "C:\\", history: readonly string[] = []): CommandContext => ({
  clock: CLOCK,
  now: NOW,
  disk: { ...createDisk(), cwd },
  history,
});

const result = (line: string, cwd = "C:\\", history: readonly string[] = []) =>
  runCommand(line, contextAt(cwd, history));

const printed = (line: string, cwd = "C:\\", history: readonly string[] = []) => {
  const output = result(line, cwd, history);
  if (output.type !== "print") throw new Error(`expected print, got ${output.type}`);
  return output.lines;
};

const key = (type: Exclude<ShellKey["type"], "char">): ShellKey => ({ type });
const type = (text: string): ShellKey[] =>
  Array.from(text, (char) => ({ type: "char", char }));
const enter = key("enter");
const up = key("up");

const press = (state: ShellState, ...keys: readonly ShellKey[]) =>
  keys.reduce((current, item) => reduceShell(current, { key: item, now: NOW }), state);

const run = (state: ShellState, ...lines: readonly string[]) =>
  lines.reduce((current, line) => press(current, ...type(line), enter), state);

const start = () =>
  createShell(moveCursor(writeText(createScreen(), 0, 0, PROMPT), 0, PROMPT.length), CLOCK);

const rowText = (screen: Screen, row: number) =>
  screen.rows[row].map((cell) => cell.char).join("").trimEnd();

const screenText = ({ screen }: ShellState) =>
  screen.rows.map((_, row) => rowText(screen, row)).filter((_, row) => row <= screen.cursor.row);

describe("Internal commands run first", () => {
  test("an internal command wins over a file of the same name", () => {
    const written = writeFile(createDisk().filesystem, "C:\\", "VER.EXE", "x", new Date(0));
    if (!written.ok) throw new Error(written.error);

    const disk: Disk = { filesystem: written.value, cwd: "C:\\" };
    const programmes = {
      "C:\\VER.EXE": {
        kind: "command" as const,
        summary: "",
        help: [],
        run: () => print("the file ran"),
      },
    };

    expect(runCommand("ver", { ...contextAt(), disk, programmes })).toEqual(print("", "ODD/OS Version 3.14", ""));
    expect(runCommand("ver.exe", { ...contextAt(), disk, programmes })).toEqual(print("", "ODD/OS Version 3.14", ""));
    expect(runCommand("\\ver.exe", { ...contextAt(), disk, programmes })).toEqual(print("the file ran"));
  });
});

describe("MEM as a programme", () => {
  test.each(["C:\\", "C:\\DOS", "C:\\ODDWARE"])("runs from %s", (cwd) => {
    const lines = printed("mem", cwd);

    expect(lines[0]).toBe("");
    expect(lines).toContain("ODD/OS is resident in the high memory area.");
    expect(lines).toEqual(printed("mem", "C:\\"));
  });

  test.each(["MeM", "mem.exe", "\\dos\\mem", "c:\\dos\\MEM.EXE"])("is reached as %s", (line) => {
    expect(printed(line)).toEqual(printed("mem"));
  });

  test("mem.com is a bad command", () => {
    expect(printed("mem.com")).toEqual(["Bad command or file name"]);
  });

  test("keeps its switch and parameter errors", () => {
    expect(printed("mem/c")).toEqual(["Invalid switch"]);
    expect(printed("mem foo")).toEqual(["Too many parameters"]);
  });
});

describe("HELP as a programme", () => {
  test("lists the same commands from another directory", () => {
    expect(printed("help", "C:\\ODDWARE")).toEqual(printed("help"));
  });

  test.each(["COMMAND", "DOSKEY", "EXIT", "MEM", "HELP"])("help %s equals %s /?", (name) => {
    expect(printed(`help ${name}`)).toEqual(printed(`${name} /?`));
  });

  test("an unknown topic and a bad switch fail clearly", () => {
    expect(printed("help foo")).toEqual(["Help not available for this command"]);
    expect(printed("help /x")).toEqual(["Invalid switch"]);
    expect(printed("help cls ver")).toEqual(["Too many parameters"]);
  });
});

describe("Help for programmes", () => {
  test("doskey /? does not list history", () => {
    const lines = printed("doskey /?", "C:\\", ["one", "two"]);

    expect(lines.join("\n")).toContain("/HISTORY");
    expect(lines.join("\n")).toContain("/INSERT");
    expect(lines).not.toContain("one");
  });

  test("command /? shows help and no banner", () => {
    expect(result("command /?")).toEqual(print(...PROGRAMMES["C:\\COMMAND.COM"].kind === "command" ? PROGRAMMES["C:\\COMMAND.COM"].help : []));
  });

  test("exit /? shows help and does not leave", () => {
    expect(result("exit /?").type).toBe("print");
  });
});

describe("DOSKEY", () => {
  test("/HISTORY lists the history, oldest first", () => {
    expect(printed("doskey /history", "C:\\", ["ver", "cls", "doskey /history"])).toEqual([
      "ver",
      "cls",
      "doskey /history",
    ]);
  });

  test("the switch needs no space and any letter case", () => {
    expect(printed("doskey/History", "C:\\", ["doskey/History"])).toEqual(["doskey/History"]);
  });

  test.each(["doskey", "doskey /insert", "DOSKEY /INSERT"])("%s prints nothing", (line) => {
    expect(printed(line, "C:\\", [line])).toEqual([]);
  });

  test.each(["/overstrike", "/macros", "/reinstall", "/x"])("%s is an invalid switch", (option) => {
    expect(printed(`doskey ${option}`)).toEqual(["Invalid switch"]);
  });

  test.each(["up=dir", "foo", "/history foo"])("%s has too many parameters", (text) => {
    expect(printed(`doskey ${text}`)).toEqual(["Too many parameters"]);
  });

  test("is given exactly what the command line can recall, itself included", () => {
    let seen: readonly string[] = [];
    const spy = {
      kind: "command" as const,
      summary: "",
      help: [],
      run: (_: unknown, { history }: { history: readonly string[] }) => {
        seen = history;
        return print();
      },
    };
    const shell = createShell(start().screen, CLOCK, createDisk(), {
      ...PROGRAMMES,
      "C:\\DOS\\DOSKEY.COM": spy,
    });
    const lines = "abcdefghij".split("").map((char) => char.repeat(60));

    const after = run(shell, ...lines, "doskey /history");

    expect(after.history.entries).toHaveLength(9);
    expect(seen).toEqual(after.history.entries);
    expect(seen.at(-1)).toBe("doskey /history");
    expect(seen).not.toContain(lines[0]);
  });

  test("date and time entries stay out of the list", () => {
    const shell = run(start(), "date", "12-25-93", "doskey /history");
    const rows = screenText(shell);

    expect(rows.filter((text) => text === "date")).toHaveLength(1);
    expect(rows).not.toContain("12-25-93");
    expect(shell.history.entries).toEqual(["date", "doskey /history"]);
  });
});

describe("COMMAND and EXIT", () => {
  test("command returns the banner and starts an interpreter", () => {
    expect(result("command")).toEqual({ type: "nest", lines: BANNER });
    expect(BANNER).toEqual(["", "", "ODD/OS Version 3.14", "(C)Copyright Ordinary Data Devices, Inc. 1993"]);
  });

  test("command is not on the search path from C:\\DOS but \\command is", () => {
    expect(printed("command", "C:\\DOS")).toEqual(["Bad command or file name"]);
    expect(result("\\command", "C:\\DOS")).toEqual({ type: "nest", lines: BANNER });
    expect(result("c:\\command.com", "C:\\ODDWARE")).toEqual({ type: "nest", lines: BANNER });
  });

  test("command rejects switches and parameters", () => {
    expect(printed("command /c ver")).toEqual(["Invalid switch"]);
    expect(printed("command foo")).toEqual(["Too many parameters"]);
  });

  test("exit leaves, and ignores parameters", () => {
    expect(result("exit")).toEqual({ type: "leave" });
    expect(result("exit foo")).toEqual({ type: "leave" });
  });

  test("exit rejects other switches", () => {
    expect(printed("exit /x")).toEqual(["Invalid switch"]);
  });
});

describe("a secondary command interpreter", () => {
  test("shows the banner, a blank row and a prompt, and exit returns quietly", () => {
    const nested = run(start(), "command");
    expect(screenText(nested)).toEqual([
      "C:\\>command",
      "",
      "",
      "ODD/OS Version 3.14",
      "(C)Copyright Ordinary Data Devices, Inc. 1993",
      "",
      "C:\\>",
    ]);
    expect(nested.depth).toBe(1);

    const left = run(nested, "exit");
    expect(screenText(left).slice(6)).toEqual(["C:\\>exit", "", "C:\\>"]);
    expect(left.depth).toBe(0);
  });

  test("shares the working directory", () => {
    const shell = run(start(), "command", "cd dos", "exit");

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C:\\DOS>");
  });

  test("shares the history", () => {
    const shell = press(run(start(), "command", "exit"), up);
    expect(shell.line).toBe("exit");
    expect(press(shell, up).line).toBe("command");
  });

  test("nests twice and leaves one level at a time", () => {
    const twice = run(start(), "command", "command");
    expect(twice.depth).toBe(2);

    const once = run(twice, "exit");
    expect(once.depth).toBe(1);
    expect(run(once, "exit").depth).toBe(0);
  });

  test("exit at the first prompt changes nothing", () => {
    const shell = run(start(), "exit");

    expect(shell.depth).toBe(0);
    expect(screenText(shell)).toEqual(["C:\\>exit", "", "C:\\>"]);
    expect(run(shell, "exit").depth).toBe(0);
  });

  test("a rejected command does not nest", () => {
    expect(run(start(), "command /c ver").depth).toBe(0);
    expect(run(start(), "command foo").depth).toBe(0);
  });
});
