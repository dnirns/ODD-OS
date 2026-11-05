import { describe, expect, test } from "vitest";

import { listVariables } from "../environment/environment";
import { COLUMNS, createScreen, moveCursor, ROWS, type Screen, writeText } from "../terminal/screen";
import { PROMPT } from "./prompt";
import { createShell, reduceShell, type ShellState } from "./shell";
import type { ShellKey } from "./shellKeys";

const key = (type: Exclude<ShellKey["type"], "char">): ShellKey => ({ type });
const type = (text: string): ShellKey[] => Array.from(text, (char) => ({ type: "char", char }));

const NOW = Date.UTC(2026, 10, 1, 12, 0);
// 15:45:12.34 on Monday 1 November 1993.
const CLOCK = { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - NOW };

const enter = key("enter");
const home = key("home");
const backspace = key("backspace");
const left = key("left");
const escape = key("escape");

const press = (state: ShellState, ...keys: readonly ShellKey[]) =>
  keys.reduce((current, item) => reduceShell(current, { key: item, now: NOW }), state);

const run = (state: ShellState, ...lines: readonly string[]) =>
  lines.reduce((current, line) => press(current, ...type(line), enter), state);

const shellAt = (row: number) =>
  createShell(moveCursor(writeText(createScreen(), row, 0, PROMPT), row, PROMPT.length), CLOCK);

const rowText = (screen: Screen, row: number) =>
  screen.rows[row].map((cell) => cell.char).join("").trimEnd();

const cursorAt = ({ screen }: ShellState) => [screen.cursor.row, screen.cursor.column];

const variables = (state: ShellState) => listVariables(state.environment);

describe("The prompt follows PROMPT", () => {
  test("starts as $P$G", () => {
    const shell = run(shellAt(0), "cd dos");

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C:\\DOS>");
  });

  test("a set prompt shows from the next prompt", () => {
    const shell = run(shellAt(0), "prompt Ready:");

    expect(rowText(shell.screen, 2)).toBe("Ready:");
    expect(cursorAt(shell)).toEqual([2, 6]);
  });

  test("PROMPT alone restores the default C>", () => {
    const shell = run(shellAt(0), "cd dos", "prompt");

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C>");
  });

  test("SET PROMPT=$p$g restores the drive and directory", () => {
    const shell = run(shellAt(0), "prompt", "set prompt=$p$g");

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C:\\>");
  });

  test("removing the variable gives the default prompt", () => {
    const shell = run(shellAt(0), "set prompt=");

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C>");
  });

  test("$T and $D follow the clock when the prompt is shown", () => {
    const shell = run(shellAt(0), "prompt $t $d$g");

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("15:45:12.34 Mon 11-01-1993>");
  });

  test("typed text follows the prompt, and Home stops after it", () => {
    const shell = press(run(shellAt(0), "prompt Ready:"), ...type("ver"), home);

    expect(rowText(shell.screen, 2)).toBe("Ready:ver");
    expect(cursorAt(shell)).toEqual([2, 6]);
  });

  test("echo off hides the prompt", () => {
    const shell = run(shellAt(0), "prompt Ready:", "echo off");

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("");
    expect(cursorAt(shell)[1]).toBe(0);
  });
});

describe("Prompts of several rows", () => {
  const shell = () => run(shellAt(0), "prompt Hi$_$g");

  test("take a row for each line break, and typing follows the last", () => {
    const typed = press(shell(), ...type("ver"));

    expect(rowText(typed.screen, 2)).toBe("Hi");
    expect(rowText(typed.screen, 3)).toBe(">ver");
    expect(cursorAt(typed)).toEqual([3, 4]);
  });

  test("Home and Backspace do not enter the prompt", () => {
    const typed = press(shell(), ...type("ab"), home, backspace, left);

    expect(rowText(typed.screen, 2)).toBe("Hi");
    expect(rowText(typed.screen, 3)).toBe(">ab");
    expect(cursorAt(typed)).toEqual([3, 1]);
  });

  test("Esc clears the line and keeps every prompt row", () => {
    const typed = press(shell(), ...type("ver"), escape);

    expect(rowText(typed.screen, 2)).toBe("Hi");
    expect(rowText(typed.screen, 3)).toBe(">");
    expect(cursorAt(typed)).toEqual([3, 1]);
  });

  test("a run command's output follows the typed line", () => {
    const ran = run(shell(), "echo hello");

    expect(rowText(ran.screen, 3)).toBe(">echo hello");
    expect(rowText(ran.screen, 4)).toBe("hello");
  });

  test("scroll the screen so every row stays visible at the bottom", () => {
    const bottom = run(shellAt(ROWS - 1), "prompt First$_Second");

    expect(rowText(bottom.screen, ROWS - 2)).toBe("First");
    expect(rowText(bottom.screen, ROWS - 1)).toBe("Second");
    expect(cursorAt(bottom)).toEqual([ROWS - 1, 6]);
  });

  test("a leading line break gives a blank row", () => {
    const blank = run(shellAt(0), "prompt $_$p$g");

    expect(rowText(blank.screen, 2)).toBe("");
    expect(rowText(blank.screen, 3)).toBe("C:\\>");
  });
});

describe("Prompts wider than the screen", () => {
  test("wrap, and typing follows the last character", () => {
    const wide = run(shellAt(0), `prompt ${"x".repeat(100)}`);
    const typed = press(wide, ...type("a"));

    expect(rowText(typed.screen, 3)).toBe("x".repeat(COLUMNS));
    expect(rowText(typed.screen, 4)).toBe(`${"x".repeat(20)}a`);
    expect(cursorAt(typed)).toEqual([4, 21]);
  });

  test("exactly one row wide puts the cursor on the next row", () => {
    const full = run(shellAt(0), `prompt ${"x".repeat(COLUMNS)}`);

    expect(rowText(full.screen, 3)).toBe("x".repeat(COLUMNS));
    expect(cursorAt(full)).toEqual([4, 0]);
  });
});

describe("Each interpreter has its own environment", () => {
  test("a secondary interpreter starts with a copy", () => {
    const inner = run(shellAt(0), "set a=1", "command");

    expect(variables(inner)).toContain("A=1");
    expect(inner.outer).toHaveLength(1);
  });

  test("changes made inside are gone after EXIT", () => {
    const after = run(shellAt(0), "command", "set b=2", "exit");

    expect(variables(after).join()).not.toContain("B=2");
    expect(after.outer).toEqual([]);
  });

  test("a variable set before COMMAND survives EXIT", () => {
    const after = run(shellAt(0), "set a=1", "command", "set a=2", "exit");

    expect(variables(after)).toContain("A=1");
  });

  test("two levels restore one at a time", () => {
    const first = run(shellAt(0), "command", "set a=1", "command", "set a=2");
    const middle = run(first, "exit");
    const outer = run(middle, "exit");

    expect(variables(first)).toContain("A=2");
    expect(variables(middle)).toContain("A=1");
    expect(variables(outer).join()).not.toContain("A=");
  });

  test("the prompt reverts after EXIT", () => {
    const after = run(shellAt(0), "prompt Outer:", "command", "prompt Inner:", "exit");

    expect(rowText(after.screen, after.screen.cursor.row)).toBe("Outer:");
  });

  test("the prompt inside is the copied one", () => {
    const inner = run(shellAt(0), "prompt Outer:", "command");

    expect(rowText(inner.screen, inner.screen.cursor.row)).toBe("Outer:");
  });

  test("EXIT at the first level changes nothing", () => {
    const before = run(shellAt(0), "set a=1");
    const after = run(before, "exit");

    expect(variables(after)).toEqual(variables(before));
  });

  test("a programme leaves the environment as it was", () => {
    const before = run(shellAt(0), "set a=1");
    const after = run(before, "mem");

    expect(variables(after)).toEqual(variables(before));
  });
});

describe("The starting environment", () => {
  test("the shell begins with COMSPEC, PATH and PROMPT", () => {
    expect(variables(shellAt(0))).toEqual([
      "COMSPEC=C:\\COMMAND.COM",
      "PATH=C:\\DOS",
      "PROMPT=$P$G",
    ]);
  });
});
