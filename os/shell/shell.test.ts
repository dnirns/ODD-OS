import { describe, expect, test } from "vitest";

import { COLUMNS, createScreen, moveCursor, ROWS, type Screen, writeText } from "../terminal/screen";
import { applySteps, createBootScreen, createBootSteps } from "../boot/bootSteps";
import { PROMPT } from "./prompt";
import { createShell, reduceShell, type ShellState } from "./shell";
import type { ShellKey } from "./shellKeys";

const key = (type: Exclude<ShellKey["type"], "char">): ShellKey => ({ type });

const type = (text: string): ShellKey[] =>
  Array.from(text, (char) => ({ type: "char", char }));

const press = (state: ShellState, ...keys: readonly ShellKey[]) =>
  keys.reduce(reduceShell, state);

const shellAt = (row: number) =>
  createShell(moveCursor(writeText(createScreen(), row, 0, PROMPT), row, PROMPT.length));

const rowText = (screen: Screen, row: number) =>
  screen.rows[row].map((cell) => cell.char).join("").trimEnd();

const cursorAt = ({ screen }: ShellState) => [screen.cursor.row, screen.cursor.column];

const enter = key("enter");
const left = key("left");
const up = key("up");
const down = key("down");
const home = key("home");
const end = key("end");
const backspace = key("backspace");
const del = key("delete");
const escape = key("escape");
const insert = key("insert");

const repeat = (item: ShellKey, count: number) => Array.from({ length: count }, () => item);

const LONG = "x".repeat(COLUMNS);

describe("createShell", () => {
  test("starts at the boot's final cursor", () => {
    const screen = applySteps(createBootScreen(), createBootSteps());
    const shell = press(createShell(screen), ...type("d"));

    expect(rowText(shell.screen, 6)).toBe("C:\\>d");
    expect(cursorAt(shell)).toEqual([6, 5]);
  });
});

describe("typing", () => {
  test("shows characters as typed and advances the cursor", () => {
    const shell = press(shellAt(0), ...type("dIr"));

    expect(rowText(shell.screen, 0)).toBe("C:\\>dIr");
    expect(cursorAt(shell)).toEqual([0, 7]);
  });

  test("stops at 127 characters", () => {
    const shell = press(shellAt(0), ...type("x".repeat(130)));

    expect(shell.line).toHaveLength(127);
    expect(cursorAt(shell)).toEqual([1, 51]);
  });

  test("ignores insertion within a full line", () => {
    const full = press(shellAt(0), ...type("x".repeat(127)), left);

    expect(press(full, ...type("y")).line).toBe(full.line);
  });

  test("overstrikes within a full line", () => {
    const full = press(shellAt(0), ...type("x".repeat(127)), left, insert, ...type("y"));

    expect(full.line).toBe(`${"x".repeat(126)}y`);
  });

  test("ignores overstrike typing at the end of a full line", () => {
    const full = press(shellAt(0), ...type("x".repeat(127)), insert);

    expect(press(full, ...type("y")).line).toBe(full.line);
  });
});

describe("Backspace", () => {
  test("removes the last character", () => {
    const shell = press(shellAt(0), ...type("dir"), backspace);

    expect(rowText(shell.screen, 0)).toBe("C:\\>di");
    expect(cursorAt(shell)).toEqual([0, 6]);
  });

  test("removes a character within the line and closes the gap", () => {
    const shell = press(shellAt(0), ...type("dxir"), left, left, backspace);

    expect(shell.line).toBe("dir");
    expect(rowText(shell.screen, 0)).toBe("C:\\>dir");
    expect(shell.cursor).toBe(1);
  });

  test("leaves the prompt alone", () => {
    const start = shellAt(0);

    expect(press(start, backspace)).toEqual(start);
  });
});

describe("cursor movement", () => {
  test("Left moves the cursor without changing the line", () => {
    const shell = press(shellAt(0), ...type("dir"), left);

    expect(shell.line).toBe("dir");
    expect(cursorAt(shell)).toEqual([0, 6]);
  });

  test("stops at the start of the line", () => {
    expect(cursorAt(press(shellAt(0), ...type("d"), left, left))).toEqual([0, 4]);
  });

  test("stops at the end of the line", () => {
    expect(cursorAt(press(shellAt(0), ...type("d"), key("right")))).toEqual([0, 5]);
  });

  test("crosses a wrap in both directions", () => {
    const wrapped = press(shellAt(0), ...type("x".repeat(76)));

    expect(cursorAt(wrapped)).toEqual([1, 0]);
    expect(cursorAt(press(wrapped, left))).toEqual([0, 79]);
    expect(cursorAt(press(wrapped, left, key("right")))).toEqual([1, 0]);
  });

  test("Home and End work on a wrapped line", () => {
    const wrapped = press(shellAt(0), ...type(LONG));

    expect(cursorAt(press(wrapped, home))).toEqual([0, 4]);
    expect(cursorAt(press(wrapped, home, end))).toEqual([1, 4]);
  });
});

describe("insert and overstrike", () => {
  test("inserts by default", () => {
    expect(press(shellAt(0), ...type("dr"), left, ...type("i")).line).toBe("dir");
  });

  test("overstrikes after Insert", () => {
    const shell = press(shellAt(0), ...type("dor"), left, left, insert, ...type("i"));

    expect(shell.line).toBe("dir");
    expect(shell.cursor).toBe(2);
  });

  test("Insert toggles back", () => {
    const shell = press(shellAt(0), ...type("dr"), left, insert, insert, ...type("i"));

    expect(shell.line).toBe("dir");
  });

  test("overstrike appends at the end of a line", () => {
    expect(press(shellAt(0), insert, ...type("dir")).line).toBe("dir");
  });
});

describe("Delete", () => {
  test("removes the character under the cursor", () => {
    const shell = press(shellAt(0), ...type("dxir"), left, left, left, del);

    expect(shell.line).toBe("dir");
    expect(cursorAt(shell)).toEqual([0, 5]);
  });

  test("does nothing at the end of the line", () => {
    const shell = press(shellAt(0), ...type("dir"));

    expect(press(shell, del)).toEqual(shell);
  });
});

describe("Esc", () => {
  test("clears the line and returns to the prompt", () => {
    const shell = press(shellAt(0), ...type("dir"), escape);

    expect(rowText(shell.screen, 0)).toBe("C:\\>");
    expect(cursorAt(shell)).toEqual([0, 4]);
  });

  test("clears both rows of a wrapped line", () => {
    const shell = press(shellAt(0), ...type(LONG), escape);

    expect(rowText(shell.screen, 0)).toBe("C:\\>");
    expect(rowText(shell.screen, 1)).toBe("");
  });

  test("changes nothing on an empty line", () => {
    const start = shellAt(0);

    expect(press(start, escape).screen).toEqual(start.screen);
  });
});

describe("wrapping and scrolling while typing", () => {
  test("continues on the next row at column 80", () => {
    const shell = press(shellAt(0), ...type(`${"x".repeat(76)}y`));

    expect(rowText(shell.screen, 0)).toBe(`C:\\>${"x".repeat(76)}`);
    expect(rowText(shell.screen, 1)).toBe("y");
    expect(cursorAt(shell)).toEqual([1, 1]);
  });

  test("scrolls when a line wraps on the bottom row", () => {
    const shell = press(shellAt(ROWS - 1), ...type(`${"x".repeat(76)}y`));

    expect(rowText(shell.screen, ROWS - 2)).toBe(`C:\\>${"x".repeat(76)}`);
    expect(rowText(shell.screen, ROWS - 1)).toBe("y");
    expect(shell.lineStart.row).toBe(ROWS - 2);
  });

  test("scrolls as soon as the last cell of the bottom row is filled", () => {
    const shell = press(shellAt(ROWS - 1), ...type("x".repeat(76)));

    expect(cursorAt(shell)).toEqual([ROWS - 1, 0]);
    expect(rowText(shell.screen, ROWS - 1)).toBe("");
  });

  test("Backspace crosses a wrap", () => {
    const shell = press(shellAt(0), ...type(`${"x".repeat(75)}y`), backspace);

    expect(cursorAt(shell)).toEqual([0, 79]);
    expect(rowText(shell.screen, 0)).toBe(`C:\\>${"x".repeat(75)}`);
  });

  test("redraws correctly after scrolling", () => {
    const shell = press(shellAt(ROWS - 1), ...type(LONG), home, del);

    expect(rowText(shell.screen, ROWS - 2)).toBe(`C:\\>${"x".repeat(76)}`);
    expect(rowText(shell.screen, ROWS - 1)).toBe("xxx");
    expect(cursorAt(shell)).toEqual([ROWS - 2, 4]);
  });

  test("does not scroll back down when the line shrinks", () => {
    const shell = press(shellAt(ROWS - 1), ...type(LONG), escape);

    expect(rowText(shell.screen, ROWS - 2)).toBe("C:\\>");
    expect(rowText(shell.screen, ROWS - 1)).toBe("");
    expect(cursorAt(shell)).toEqual([ROWS - 2, 4]);
  });
});

describe("submitting", () => {
  test("reports an unknown command, a blank row and a new prompt", () => {
    const shell = press(shellAt(0), ...type("foo"), enter);

    expect(rowText(shell.screen, 0)).toBe("C:\\>foo");
    expect(rowText(shell.screen, 1)).toBe("Bad command or file name");
    expect(rowText(shell.screen, 2)).toBe("");
    expect(rowText(shell.screen, 3)).toBe("C:\\>");
    expect(cursorAt(shell)).toEqual([3, 4]);
  });

  test("shows the next prompt on the next row for an empty line", () => {
    const shell = press(shellAt(0), enter);

    expect(rowText(shell.screen, 1)).toBe("C:\\>");
    expect(cursorAt(shell)).toEqual([1, 4]);
  });

  test("treats a line of spaces as empty, without storing it", () => {
    const shell = press(shellAt(0), ...type("   "), enter);

    expect(rowText(shell.screen, 1)).toBe("C:\\>");
    expect(shell.history.entries).toEqual([]);
  });

  test("submits the whole line from any cursor position", () => {
    const shell = press(shellAt(0), ...type("foo"), home, enter);

    expect(shell.history.entries).toEqual(["foo"]);
    expect(rowText(shell.screen, 1)).toBe("Bad command or file name");
  });

  test("writes output after the end of a wrapped line", () => {
    const shell = press(shellAt(0), ...type(LONG), home, enter);

    expect(rowText(shell.screen, 2)).toBe("Bad command or file name");
  });

  test("returns to insert mode", () => {
    const shell = press(
      shellAt(0),
      insert,
      enter,
      ...type("dr"),
      left,
      ...type("i"),
    );

    expect(shell.overstrike).toBe(false);
    expect(shell.line).toBe("dir");
  });

  test("scrolls so the new prompt is on the bottom row", () => {
    const shell = press(shellAt(ROWS - 1), ...type("foo"), enter);

    expect(rowText(shell.screen, ROWS - 4)).toBe("C:\\>foo");
    expect(rowText(shell.screen, ROWS - 3)).toBe("Bad command or file name");
    expect(rowText(shell.screen, ROWS - 2)).toBe("");
    expect(rowText(shell.screen, ROWS - 1)).toBe("C:\\>");
    expect(cursorAt(shell)).toEqual([ROWS - 1, 4]);
  });

  test("loses text that scrolls off the top", () => {
    const shell = press(shellAt(0), ...type("first"), enter, ...repeat(enter, ROWS));

    expect(shell.screen.rows.flat().some((cell) => cell.char === "f")).toBe(false);
  });

  test("stays usable after 100 submissions", () => {
    const commands = Array.from({ length: 100 }, () => [...type("foo"), enter]).flat();
    const shell = press(shellAt(0), ...commands, ...type("dir"));

    expect(rowText(shell.screen, ROWS - 1)).toBe("C:\\>dir");
    expect(cursorAt(shell)).toEqual([ROWS - 1, 7]);
    expect(shell.screen.rows).toHaveLength(ROWS);
  });
});

describe("recalling commands", () => {
  const withHistory = press(
    shellAt(0),
    ...type("one"),
    enter,
    ...type("two"),
    enter,
    ...type("three"),
    enter,
  );

  test("does nothing with an empty history", () => {
    const start = shellAt(0);

    expect(press(start, up, down, key("pageUp"), key("pageDown"))).toEqual(start);
  });

  test("steps back from the newest with the cursor at the end", () => {
    const first = press(withHistory, up);
    const second = press(first, up);

    expect(first.line).toBe("three");
    expect(second.line).toBe("two");
    expect(second.cursor).toBe(3);
    expect(rowText(second.screen, second.lineStart.row)).toBe("C:\\>two");
  });

  test("keeps the line at the oldest and newest commands", () => {
    expect(press(withHistory, up, up, up, up).line).toBe("one");
    expect(press(withHistory, up, down).line).toBe("three");
  });

  test("Down does nothing when nothing has been recalled", () => {
    const typed = press(withHistory, ...type("abc"));

    expect(press(typed, down)).toEqual(typed);
  });

  test("keeps an edit when Up cannot move", () => {
    const edited = press(withHistory, up, up, up, ...type("!"));

    expect(press(edited, up).line).toBe("one!");
  });

  test("PgUp and PgDn jump to either end", () => {
    expect(press(withHistory, key("pageUp")).line).toBe("one");
    expect(press(withHistory, key("pageUp"), key("pageDown")).line).toBe("three");
  });

  test("leaves no text behind from a longer line", () => {
    const shell = press(shellAt(0), ...type(LONG), enter, ...type("ab"), enter, up, up, down);

    expect(shell.line).toBe("ab");
    expect(rowText(shell.screen, shell.lineStart.row)).toBe("C:\\>ab");
    expect(rowText(shell.screen, shell.lineStart.row + 1)).toBe("");
  });

  test("adds an edited command and keeps the original", () => {
    const shell = press(withHistory, up, ...type("!"), enter);

    expect(shell.history.entries).toEqual(["one", "two", "three", "three!"]);
  });

  test("starts from the newest again after submitting", () => {
    expect(press(withHistory, up, up, ...repeat(enter, 1), up).line).toBe("two");
  });
});
