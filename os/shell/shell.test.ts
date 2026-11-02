import { describe, expect, test } from "vitest";

import { COLUMNS, createScreen, moveCursor, ROWS, type Screen, writeText } from "../terminal/screen";
import { applySteps, createBootScreen, createBootSteps } from "../boot/bootSteps";
import { PROMPT } from "./prompt";
import { createShell, reduceShell, type ShellState } from "./shell";
import type { ShellKey } from "./shellKeys";

const key = (type: Exclude<ShellKey["type"], "char">): ShellKey => ({ type });

const type = (text: string): ShellKey[] =>
  Array.from(text, (char) => ({ type: "char", char }));

const NOW = Date.UTC(2026, 10, 1, 12, 0);
const CLOCK = { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - NOW };

const press = (state: ShellState, ...keys: readonly ShellKey[]) =>
  keys.reduce((current, item) => reduceShell(current, { key: item, now: NOW }), state);

const run = (state: ShellState, ...lines: readonly string[]) =>
  lines.reduce((current, line) => press(current, ...type(line), enter), state);

const shellAt = (row: number) =>
  createShell(moveCursor(writeText(createScreen(), row, 0, PROMPT), row, PROMPT.length), CLOCK);

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
    const shell = press(createShell(screen, CLOCK), ...type("d"));

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

const rows = (shell: ShellState, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => rowText(shell.screen, from + index));

describe("running commands", () => {
  test("VER prints its text with DOS spacing", () => {
    const shell = run(shellAt(0), "ver");

    expect(rows(shell, 1, 5)).toEqual(["", "ODD/OS Version 3.14", "", "", PROMPT]);
    expect(cursorAt(shell)).toEqual([5, 4]);
  });

  test("CLS leaves the prompt on the second row", () => {
    const filled = run(shellAt(0), "foo", "bar", "baz");
    const shell = run(filled, "cLs");

    expect(rows(shell, 0, 1)).toEqual(["", PROMPT]);
    expect(rows(shell, 2, ROWS - 1).every((row) => row === "")).toBe(true);
    expect(cursorAt(shell)).toEqual([1, 4]);
  });

  test("CLS /? does not clear the screen", () => {
    const shell = run(shellAt(0), "cls/?");

    expect(rows(shell, 0, 3)).toEqual(["C:\\>cls/?", "Clears the screen.", "", "CLS"]);
  });

  test("HELP lists commands below the command line", () => {
    const shell = run(shellAt(0), "help");

    expect(rowText(shell.screen, 1)).toContain("type HELP command-name");
    expect(rowText(shell.screen, 2)).toBe("CLS      Clears the screen.");
    expect(rowText(shell.screen, 7)).toBe("VER      Displays the ODD/OS version.");
    expect(rows(shell, 8, 9)).toEqual(["", PROMPT]);
  });

  test("MEM scrolls within the screen from the bottom row", () => {
    const shell = run(shellAt(ROWS - 1), "mem");

    expect(rowText(shell.screen, ROWS - 1)).toBe(PROMPT);
    expect(rowText(shell.screen, ROWS - 3)).toBe("ODD/OS is resident in the high memory area.");
    expect(cursorAt(shell)).toEqual([ROWS - 1, 4]);
  });
});

describe("date and time prompts", () => {
  const DATE_PROMPT = "Enter new date (mm-dd-yy): ";
  const TIME_PROMPT = "Enter new time: ";

  test("DATE asks on the next row with the cursor after the prompt", () => {
    const shell = run(shellAt(0), "date");

    expect(rows(shell, 1, 2)).toEqual(["Current date is Mon 11-01-1993", DATE_PROMPT.trimEnd()]);
    expect(cursorAt(shell)).toEqual([2, DATE_PROMPT.length]);
  });

  test("Enter keeps the date and returns to the prompt", () => {
    const shell = run(shellAt(0), "date", "", "date");

    expect(rows(shell, 3, 5)).toEqual(["", "C:\\>date", "Current date is Mon 11-01-1993"]);
  });

  test("a date entered at the prompt changes the clock", () => {
    const shell = run(shellAt(0), "date", "12-25-93", "date");

    expect(rows(shell, 3, 5)).toEqual(["", "C:\\>date", "Current date is Sat 12-25-1993"]);
  });

  test("a date argument sets the clock with no prompt", () => {
    const shell = run(shellAt(0), "date 12/25/1993");

    expect(rows(shell, 1, 2)).toEqual(["", PROMPT]);
  });

  test("an invalid date reports and asks again", () => {
    const shell = run(shellAt(0), "date", "foo");

    expect(rows(shell, 3, 5)).toEqual(["", "Invalid date", DATE_PROMPT.trimEnd()]);
    expect(cursorAt(shell)).toEqual([5, DATE_PROMPT.length]);
  });

  test("an invalid date argument skips the current date", () => {
    const shell = run(shellAt(0), "date foo");

    expect(rows(shell, 1, 3)).toEqual(["", "Invalid date", DATE_PROMPT.trimEnd()]);
  });

  test("the prompt only ends through a valid entry or Enter", () => {
    const shell = run(shellAt(0), "date", "foo", "bar", "");

    expect(shell.input.type).toBe("command");
    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe(PROMPT);
  });

  test("TIME rejects, then accepts a time", () => {
    const shell = run(shellAt(0), "time", "25:00", "9:30p", "time");

    expect(rowText(shell.screen, 1)).toBe("Current time is  3:45:12.34p");
    expect(rowText(shell.screen, 2)).toBe(`${TIME_PROMPT}25:00`);
    expect(rowText(shell.screen, 4)).toBe("Invalid time");
    expect(rows(shell, 7, 8)).toEqual(["C:\\>time", "Current time is  9:30:00.00p"]);
  });

  test("line editing works at the prompt", () => {
    const shell = press(run(shellAt(0), "date"), ...type("12-25-94"), backspace, ...type("3"), enter);

    expect(run(shell, "date").screen.rows.flat().map((cell) => cell.char).join("")).toContain("Sat 12-25-1993");
  });

  test("Esc clears the entry but keeps the prompt", () => {
    const shell = press(run(shellAt(0), "date"), ...type("12"), escape);

    expect(rowText(shell.screen, 2)).toBe(DATE_PROMPT.trimEnd());
    expect(cursorAt(shell)).toEqual([2, DATE_PROMPT.length]);
    expect(shell.input.type).toBe("date");
  });

  test.each([["up", up], ["down", down], ["pageUp", key("pageUp")], ["pageDown", key("pageDown")]])(
    "%s does nothing at the prompt",
    (_, item) => {
      const shell = press(run(shellAt(0), "foo", "date"), ...type("1"));

      expect(press(shell, item).line).toBe("1");
    },
  );

  test("entries stay out of the history", () => {
    const shell = press(run(shellAt(0), "date", "12-25-93"), up);

    expect(shell.line).toBe("date");
  });

  test("the clock keeps its offset across later commands", () => {
    const before = run(shellAt(0), "date 12-25-93");

    expect(run(before, "ver").clock).toEqual(before.clock);
  });
});
