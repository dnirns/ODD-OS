import { describe, expect, test } from "vitest";

import { withTestProgramme } from "../programs/testProgramme";
import {
  COLUMNS,
  createScreen,
  moveCursor,
  ROWS,
  type Screen,
  writeText,
} from "../terminal/screen";
import { createShell, reduceShell, tickInterval, tickShell, type ShellState } from "./shell";
import type { ShellKey } from "./shellKeys";

const NOW = Date.UTC(2026, 10, 1, 12, 0);
const CLOCK = { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - NOW };

const key = (type: Exclude<ShellKey["type"], "char">): ShellKey => ({ type });
const type = (text: string): ShellKey[] =>
  Array.from(text, (char) => ({ type: "char", char }));
const enter = key("enter");
const escape = key("escape");
const up = key("up");

const press = (state: ShellState, ...keys: readonly ShellKey[]) =>
  keys.reduce((current, item) => reduceShell(current, { key: item, now: NOW }), state);

const run = (state: ShellState, ...lines: readonly string[]) =>
  lines.reduce((current, line) => press(current, ...type(line), enter), state);

const rowText = (screen: Screen, row: number) =>
  screen.rows[row].map((cell) => cell.char).join("").trimEnd();

const allRows = (screen: Screen) => screen.rows.map((_, row) => rowText(screen, row));

const shellIn = (cwd: string, tickMs?: number) => {
  const { disk, programmes } = withTestProgramme(tickMs);
  const prompt = `${cwd}>`;
  const screen = moveCursor(
    writeText(
      writeText(writeText(createScreen(), 0, 0, "earlier output"), 1, 0, "more output"),
      3,
      0,
      prompt,
    ),
    3,
    prompt.length,
  );

  return createShell(screen, CLOCK, { ...disk, cwd }, programmes);
};

const launched = (tickMs?: number) => run(shellIn("C:\\ODDWARE", tickMs), "test");

describe("Fullscreen programmes", () => {
  test("a name outside the search path does not launch", () => {
    const shell = run(shellIn("C:\\"), "test");

    expect(shell.running).toBeUndefined();
    expect(rowText(shell.screen, 4)).toBe("Bad command or file name");
  });

  test("launching clears the screen to the programme's display", () => {
    const shell = launched();

    expect(shell.running).toBeDefined();
    expect(allRows(shell.screen).slice(0, 3)).toEqual([
      "TEST PROGRAMME",
      "KEYS: 0 LAST: -",
      "TICKS: 0",
    ]);
    expect(allRows(shell.screen).slice(3).every((text) => text === "")).toBe(true);
  });

  test("the command line and prompt are not visible", () => {
    const text = allRows(launched().screen).join("\n");

    expect(text).not.toContain("C:\\ODDWARE>");
    expect(text).not.toContain("earlier output");
  });

  test("the programme can hide the cursor", () => {
    expect(launched().screen.cursor.visible).toBe(false);
  });

  test("the programme's frame never scrolls the screen", () => {
    const shell = press(launched(), ...Array.from({ length: 300 }, () => up));

    expect(shell.screen.rows).toHaveLength(ROWS);
    expect(rowText(shell.screen, 0)).toBe("TEST PROGRAMME");
    expect(shell.screen.rows[0]).toHaveLength(COLUMNS);
  });

  test("the launching line is already in the history", () => {
    expect(launched().history.entries).toEqual(["test"]);
  });
});

describe("Keyboard ownership", () => {
  test("typed text and Enter go to the programme and start no command", () => {
    const shell = press(launched(), ...type("mem"), enter);

    expect(rowText(shell.screen, 1)).toBe("KEYS: 4 LAST: enter");
    expect(allRows(shell.screen).join("\n")).not.toContain("Memory Type");
  });

  test("no command runs after the programme exits", () => {
    const shell = press(launched(), ...type("mem"), enter, escape);

    expect(shell.running).toBeUndefined();
    expect(allRows(shell.screen).join("\n")).not.toContain("Memory Type");
    expect(shell.history.entries).toEqual(["test"]);
  });

  test("Up reaches the programme and does not recall history", () => {
    const shell = press(launched(), up);

    expect(rowText(shell.screen, 1)).toBe("KEYS: 1 LAST: up");
    expect(shell.line).toBe("test");
    expect(shell.history.position).toBeNull();
  });

  test("the command line does not change while the programme runs", () => {
    const before = launched();
    const after = press(before, ...type("abc"), key("backspace"), key("left"), key("home"));

    expect(after.line).toBe(before.line);
    expect(after.cursor).toBe(before.cursor);
    expect(after.history).toEqual(before.history);
  });

  test("Escape reaches the programme", () => {
    expect(press(launched(), escape).running).toBeUndefined();
  });
});

describe("Leaving a fullscreen programme", () => {
  test("the screen returns as it was, with a blank row and a new prompt", () => {
    const before = press(shellIn("C:\\ODDWARE"), ...type("test"));
    const after = press(before, enter, escape);

    expect(allRows(after.screen).slice(0, 5)).toEqual([
      "earlier output",
      "more output",
      "",
      "C:\\ODDWARE>test",
      "",
    ]);
    expect(allRows(after.screen).slice(5, 7)).toEqual(["C:\\ODDWARE>", ""]);
    expect(allRows(after.screen).slice(0, 4)).toEqual(allRows(before.screen).slice(0, 4));
    expect(after.screen.cursor).toMatchObject({ row: 5, column: "C:\\ODDWARE>".length });
    expect(after.screen.cursor.visible).toBe(true);
  });

  test("history is intact and Up recalls the launching line", () => {
    const shell = press(launched(), escape, up);

    expect(shell.line).toBe("test");
  });

  test("a programme that changes the directory leaves it changed", () => {
    const shell = press(launched(), ...type("d"));

    expect(shell.disk.cwd).toBe("C:\\DOS");
    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C:\\DOS>");
  });

  test("a programme that changes nothing leaves the directory", () => {
    const shell = press(launched(), escape);

    expect(shell.disk.cwd).toBe("C:\\ODDWARE");
    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C:\\ODDWARE>");
  });

  test("the command line works again", () => {
    const shell = press(launched(), escape, ...type("ver"));

    expect(shell.line).toBe("ver");
    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C:\\ODDWARE>ver");
  });

  test("the programme can be launched again", () => {
    const shell = run(press(launched(), escape), "test");

    expect(shell.running).toBeDefined();
    expect(rowText(shell.screen, 1)).toBe("KEYS: 0 LAST: -");
  });

  test("the nesting depth is untouched", () => {
    expect(press(launched(), escape).depth).toBe(0);
  });
});

describe("A failing programme", () => {
  test("restores the shell without changes", () => {
    const shell = press(launched(), ...type("x"));

    expect(shell.running).toBeUndefined();
    expect(shell.disk.cwd).toBe("C:\\ODDWARE");
    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C:\\ODDWARE>");
    expect(allRows(shell.screen)[3]).toBe("C:\\ODDWARE>test");
  });

  test("stops its ticks", () => {
    const shell = press(launched(100), ...type("x"));

    expect(tickInterval(shell)).toBeUndefined();
    expect(tickShell(shell, NOW)).toBe(shell);
  });
});

describe("Ticks", () => {
  test("a programme that asks for ticks sets the interval", () => {
    expect(tickInterval(launched(100))).toBe(100);
  });

  test("ticks reach the programme while it runs", () => {
    const shell = [NOW, NOW + 100, NOW + 200].reduce(tickShell, launched(100));

    expect(rowText(shell.screen, 2)).toBe("TICKS: 3");
  });

  test("a programme that asks for none has no interval", () => {
    expect(tickInterval(launched())).toBeUndefined();
  });

  test("no interval at the prompt", () => {
    expect(tickInterval(shellIn("C:\\ODDWARE", 100))).toBeUndefined();
  });

  test("a tick at the prompt changes nothing", () => {
    const shell = shellIn("C:\\ODDWARE", 100);

    expect(tickShell(shell, NOW)).toBe(shell);
  });

  test("no tick is accepted after the programme exits", () => {
    const left = press(launched(100), escape);

    expect(tickInterval(left)).toBeUndefined();
    expect(tickShell(left, NOW + 100)).toBe(left);
  });
});

describe("Written files reach the disk on exit", () => {
  const screenText = (state: ShellState) => allRows(state.screen).join("\n");

  test("Visible after exit", () => {
    const shell = run(press(launched(), ...type("w"), escape), "dir \\new.txt");

    expect(screenText(shell)).toMatch(/NEW {6}TXT +3 11-01-93 {3}3:45p/);
  });

  test("not visible while the programme runs", () => {
    const shell = press(launched(), ...type("w"));

    expect(shell.disk).toEqual(launched().disk);
  });

  test("the working directory is kept", () => {
    expect(press(launched(), ...type("w"), escape).disk.cwd).toBe("C:\\ODDWARE");
  });

  test("Clock set by the visitor", () => {
    const shell = run(press(run(shellIn("C:\\ODDWARE"), "date 12-25-93", "test"), ...type("w"), escape), "dir \\new.txt");

    expect(screenText(shell)).toMatch(/NEW {6}TXT +3 12-25-93/);
  });

  test("Failure discards writes", () => {
    const shell = run(press(launched(), ...type("w"), ...type("x")), "dir \\new.txt");

    expect(shell.running).toBeUndefined();
    expect(screenText(shell)).toContain("File not found");
  });
});
