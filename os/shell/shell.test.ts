import { describe, expect, test } from "vitest";

import { COLUMNS, createScreen, moveCursor, ROWS, type Screen, writeText } from "../terminal/screen";
import { applySteps, createBootScreen, createBootSteps } from "../boot/bootSteps";
import { createDisk, type Disk } from "../fs/disk";
import { directory, textFile } from "../fs/entries";
import { createDirectory } from "../fs/operations";
import { print } from "../programs/output";
import type { Answer, QuestionRead } from "./commands";
import { VERSION } from "../version";
import { PROMPT } from "./prompt";
import { applyResult, createShell, reduceShell, type ShellState } from "./shell";
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

  test("HELP lists commands below the command line and pauses", () => {
    const shell = run(shellAt(0), "help");

    expect(rowText(shell.screen, 1)).toContain("type HELP command-name");
    expect(rowText(shell.screen, 2)).toBe("CD       Displays the name of or changes the current directory.");
    expect(rowText(shell.screen, 4)).toBe("CLS      Clears the screen.");
    expect(rowText(shell.screen, 24)).toBe("Press any key to continue . . .");
    expect(shell.input.type).toBe("pause");

    const rest = press(shell, ...type("x"));
    expect(rows(rest, ROWS - 3, ROWS - 1)).toEqual(["VER      Displays the ODD/OS version.", "", PROMPT]);
    expect(rest.input.type).toBe("command");
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

describe("The prompt shows the working directory", () => {
  test("is C:\\> at the start", () => {
    const screen = applySteps(createBootScreen(), createBootSteps());

    expect(rowText(screen, 6)).toBe("C:\\>");
  });

  test("follows a directory change", () => {
    const shell = run(shellAt(0), "cd dos");

    expect(rowText(shell.screen, 1)).toBe("C:\\DOS>");
    expect(cursorAt(shell)).toEqual([1, 7]);
  });

  test("a silent change leaves no blank row", () => {
    const shell = run(shellAt(0), "cd dos");

    expect(rowText(shell.screen, 0)).toBe("C:\\>cd dos");
    expect(rowText(shell.screen, 1)).toBe("C:\\DOS>");
  });

  test("a printed result is followed by a blank row and the new prompt", () => {
    const shell = run(shellAt(0), "cd dos", "cd");

    expect(rowText(shell.screen, 2)).toBe("C:\\DOS");
    expect(rowText(shell.screen, 3)).toBe("");
    expect(rowText(shell.screen, 4)).toBe("C:\\DOS>");
  });

  test("an empty line keeps the longer prompt", () => {
    const shell = run(shellAt(0), "cd dos", "");

    expect(rowText(shell.screen, 2)).toBe("C:\\DOS>");
  });

  test("typed text follows the prompt", () => {
    const shell = press(run(shellAt(0), "cd dos"), ...type("ver"));

    expect(rowText(shell.screen, 1)).toBe("C:\\DOS>ver");
    expect(cursorAt(press(shell, home))).toEqual([1, 7]);
  });

  test("editing keys leave the prompt alone", () => {
    const shell = press(run(shellAt(0), "cd dos"), backspace, left, del);

    expect(rowText(shell.screen, 1)).toBe("C:\\DOS>");
  });

  test("Esc leaves only the longer prompt", () => {
    const shell = press(run(shellAt(0), "cd dos"), ...type("ver"), escape);

    expect(rowText(shell.screen, 1)).toBe("C:\\DOS>");
    expect(cursorAt(shell)).toEqual([1, 7]);
  });

  test("a line wraps after a long prompt as after a short one", () => {
    const shell = press(run(shellAt(0), "cd dos"), ...type("x".repeat(80)));

    expect(rowText(shell.screen, 1)).toBe(`C:\\DOS>${"x".repeat(73)}`);
    expect(rowText(shell.screen, 2)).toBe("x".repeat(7));
  });

  test("the drive command keeps the directory", () => {
    const shell = run(shellAt(0), "cd dos", "c:");

    expect(rowText(shell.screen, 2)).toBe("C:\\DOS>");
  });

  test("an invalid drive prints a message and keeps the prompt", () => {
    const shell = run(shellAt(0), "a:");

    expect(rowText(shell.screen, 1)).toBe("Invalid drive specification");
    expect(rowText(shell.screen, 3)).toBe("C:\\>");
  });

  test("CLS in a subdirectory shows the longer prompt", () => {
    const shell = run(shellAt(5), "cd dos", "cls");

    expect(rowText(shell.screen, 1)).toBe("C:\\DOS>");
  });

  test("history is kept across directory changes", () => {
    const shell = press(run(shellAt(0), "cd dos"), up);

    expect(shell.line).toBe("cd dos");
  });
});

const PAUSE = "Press any key to continue . . .";
const WHEN = new Date(Date.UTC(1993, 8, 14, 9, 12));

const diskWithFiles = (count: number): Disk => ({
  filesystem: {
    root: directory(
      "",
      WHEN,
      Array.from({ length: count }, (_, index) => textFile(`F${String(index).padStart(2, "0")}.TXT`, WHEN, "x")),
    ),
  },
  cwd: "C:\\",
});

const shellWithFiles = (count: number) =>
  createShell(
    moveCursor(writeText(createScreen(), 0, 0, PROMPT), 0, PROMPT.length),
    CLOCK,
    diskWithFiles(count),
  );

const screenRows = (state: ShellState) =>
  state.screen.rows.map((_, row) => rowText(state.screen, row));

const pauseRow = (state: ShellState) => screenRows(state).lastIndexOf(PAUSE);

describe("Paged listings", () => {
  test("output that fits shows no pause", () => {
    const shell = run(shellAt(0), "dir /p");

    expect(screenRows(shell)).not.toContain(PAUSE);
    expect(shell.input).toEqual({ type: "command" });
    expect(screenRows(shell).some((row) => row.endsWith("bytes free"))).toBe(true);
  });

  test("output that does not fit stops after 23 rows", () => {
    const shell = run(shellWithFiles(40), "dir /p");

    expect(rowText(shell.screen, 0)).toBe("C:\\>dir /p");
    expect(rowText(shell.screen, 1)).toBe(" Volume in drive C has no label");
    expect(rowText(shell.screen, 23)).toContain("F18");
    expect(rowText(shell.screen, 24)).toBe(PAUSE);
    expect(cursorAt(shell)).toEqual([24, PAUSE.length]);
    expect(shell.input.type).toBe("pause");
  });

  test("the prompt does not appear while paused", () => {
    expect(screenRows(run(shellWithFiles(40), "dir /p")).some((row) => row.startsWith("C:\\>") && row !== "C:\\>dir /p")).toBe(false);
  });

  test("a key shows the next rows", () => {
    const shell = press(run(shellWithFiles(40), "dir /p"), ...type("x"));
    const rows = screenRows(shell);

    expect(rows.some((row) => row.includes("F39"))).toBe(true);
    expect(rows.some((row) => row.endsWith("bytes free"))).toBe(true);
  });

  test.each([
    ["Enter", enter],
    ["Space", { type: "char", char: " " } as ShellKey],
    ["Esc", escape],
    ["an arrow key", up],
    ["a letter", { type: "char", char: "q" } as ShellKey],
    ["Backspace", backspace],
    ["Tab", key("ignore")],
  ])("%s continues the listing", (_name, item) => {
    const shell = press(run(shellWithFiles(40), "dir /p"), item);

    expect(shell.input).toEqual({ type: "command" });
    expect(screenRows(shell).some((row) => row.endsWith("bytes free"))).toBe(true);
  });

  test("pauses again on later pages", () => {
    const shell = press(run(shellWithFiles(80), "dir /p"), enter);

    expect(shell.input.type).toBe("pause");
    expect(pauseRow(shell)).toBe(24);
  });

  test("the last page ends with the prompt and no further pause", () => {
    const shell = press(run(shellWithFiles(40), "dir /p"), enter);

    expect(shell.input).toEqual({ type: "command" });
    expect(screenRows(shell).at(-1)).toBe(PROMPT);
    expect(cursorAt(shell)).toEqual([24, PROMPT.length]);
  });

  test("a blank row precedes the prompt as after other output", () => {
    const rows = screenRows(press(run(shellWithFiles(40), "dir /p"), enter));

    expect(rows.at(-2)).toBe("");
    expect(rows.at(-3)).toMatch(/bytes free$/);
  });

  test("works with /W", () => {
    const shell = run(shellWithFiles(300), "dir /w /p");

    expect(shell.input.type).toBe("pause");
    expect(screenRows(shell)[24]).toBe(PAUSE);
  });
});

describe("Pausing output", () => {
  test("typing while paused shows nothing and continues", () => {
    const shell = press(run(shellWithFiles(40), "dir /p"), ...type("z"));

    expect(screenRows(shell).some((row) => row.includes("z"))).toBe(false);
    expect(screenRows(shell).some((row) => row.endsWith("bytes free"))).toBe(true);
  });

  test("history keys continue without recalling", () => {
    const before = run(shellWithFiles(40), "dir /p");
    const shell = press(before, up);

    expect(shell.line).toBe("");
    expect(shell.input).toEqual({ type: "command" });
  });

  test("editing keys do not edit the line", () => {
    const shell = press(run(shellWithFiles(500), "dir /p"), ...type("abc"), backspace);

    expect(shell.input.type).toBe("pause");
    expect(shell.line).toBe("");
  });

  test("pressing keys at every pause always reaches the prompt", () => {
    let shell = run(shellWithFiles(500), "dir /p");
    let presses = 0;

    while (shell.input.type === "pause" && presses < 100) {
      shell = press(shell, enter);
      presses += 1;
    }

    expect(shell.input).toEqual({ type: "command" });
    expect(presses).toBeGreaterThan(1);
    expect(screenRows(shell).at(-1)).toBe(PROMPT);
  });

  test("the command line works again afterwards", () => {
    const shell = press(press(run(shellWithFiles(40), "dir /p"), enter), ...type("ver"));

    expect(screenRows(shell).at(-1)).toBe(`${PROMPT}ver`);
  });

  test("entries made while paused stay out of the history", () => {
    const shell = press(press(run(shellWithFiles(40), "dir /p"), ...type("q")), up);

    expect(shell.line).toBe("dir /p");
  });
});

const shellWithText = (text: string, row = 0) =>
  createShell(
    moveCursor(writeText(createScreen(), row, 0, PROMPT), row, PROMPT.length),
    CLOCK,
    { filesystem: { root: directory("", WHEN, [textFile("T.TXT", WHEN, text)]) }, cwd: "C:\\" },
  );

describe("Output lines wrap", () => {
  test("a long output line continues on the next row", () => {
    const shell = run(shellWithText(`${"x".repeat(100)}\r\n`), "type t.txt");

    expect(rowText(shell.screen, 1)).toBe("x".repeat(80));
    expect(rowText(shell.screen, 2)).toBe("x".repeat(20));
    expect(rowText(shell.screen, 3)).toBe("");
    expect(rowText(shell.screen, 4)).toBe(PROMPT);
  });

  test("an 80-column line fills one row and adds no blank row", () => {
    const shell = run(shellWithText(`${"x".repeat(80)}\r\n`), "type t.txt");

    expect(rowText(shell.screen, 1)).toBe("x".repeat(80));
    expect(rowText(shell.screen, 2)).toBe("");
    expect(rowText(shell.screen, 3)).toBe(PROMPT);
  });

  test("a long line starting on the bottom row scrolls and stays whole", () => {
    const shell = run(shellWithText(`${"y".repeat(100)}\r\n`, 24), "type t.txt");

    expect(rowText(shell.screen, 21)).toBe("y".repeat(80));
    expect(rowText(shell.screen, 22)).toBe("y".repeat(20));
    expect(rowText(shell.screen, 24)).toBe(PROMPT);
  });

  test("a tab in output advances to the next 8-column stop", () => {
    const shell = run(shellWithText("a\tb\r\n"), "type t.txt");

    expect(rowText(shell.screen, 1)).toBe("a       b");
    expect(rowText(shell.screen, 1).indexOf("b")).toBe(8);
  });

  test("a tab in typed input is still ignored", () => {
    const shell = press(shellAt(0), ...type("a"), key("ignore"), ...type("b"));

    expect(rowText(shell.screen, 0)).toBe("C:\\>ab");
  });

  test("short output is unchanged", () => {
    const shell = run(shellAt(0), "ver");

    expect(rowText(shell.screen, 2)).toBe("ODD/OS Version 3.14");
  });
});

const nextRowOf = ({ screen }: ShellState) => moveCursor(screen, screen.cursor.row + 1, 0);

describe("commands that change the disk", () => {
  test("a files result replaces the disk and prints its lines", () => {
    const made = createDirectory(createDisk().filesystem, "C:\\", "GAMES", new Date(NOW));
    if (!made.ok) throw new Error(made.error);
    const disk = { filesystem: made.value, cwd: "C:\\" };

    const shell = applyResult(shellAt(0), nextRowOf(shellAt(0)), { type: "files", disk, lines: ["done"] });

    expect(shell.disk).toBe(disk);
    expect(rows(shell, 1, 3)).toEqual(["done", "", PROMPT]);
    expect(shell.input.type).toBe("command");
  });
});

describe("questions", () => {
  const yesOrNo: Answer = (text) =>
    /^[yn]/i.test(text)
      ? print(`answered ${text[0].toUpperCase()}`)
      : { type: "question", lines: [], prompt: "Sure (Y/N)?", read: "line", answer: yesOrNo };

  const asking = (read: QuestionRead, answer: Answer, prompt = "Sure (Y/N)?") =>
    applyResult(run(shellAt(0), "foo"), nextRowOf(run(shellAt(0), "foo")), {
      type: "question",
      lines: ["first"],
      prompt,
      read,
      answer,
    });

  const collected: string[] = [];
  const collect: Answer = (text) => {
    collected.push(text);
    return print("collected");
  };

  test("a line question shows its lines and prompt, and reads after it", () => {
    const shell = press(asking("line", yesOrNo), ...type("x"));

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("Sure (Y/N)?x");
    expect(rowText(shell.screen, shell.screen.cursor.row - 1)).toBe("first");
  });

  test("a rejected answer asks again", () => {
    const shell = run(asking("line", yesOrNo), "maybe");

    expect(shell.input.type).toBe("question");
    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("Sure (Y/N)?");
  });

  test("an accepted answer carries on and returns to the prompt", () => {
    const shell = run(asking("line", yesOrNo), "maybe", "yes");
    const row = shell.screen.cursor.row;

    expect(rows(shell, row - 2, row)).toEqual(["answered Y", "", PROMPT]);
    expect(shell.input.type).toBe("command");
  });

  test("a file question collects lines until one holding ^Z", () => {
    collected.length = 0;
    const shell = run(asking("file", collect, ""), "hello", "world", "last\x1Aignored");

    expect(collected).toEqual(["hello\r\nworld\r\nlast"]);
    expect(shell.input.type).toBe("command");
  });

  test("file lines start at column 0 with no prompt", () => {
    const shell = run(asking("file", collect, ""), "hello");

    expect(cursorAt(shell)).toEqual([shell.screen.cursor.row, 0]);
    expect(rowText(shell.screen, shell.screen.cursor.row - 1)).toBe("hello");
  });

  test("^Z alone ends the file after the finished lines", () => {
    collected.length = 0;
    run(asking("file", collect, ""), "hello", "\x1A");

    expect(collected).toEqual(["hello\r\n"]);
  });

  test.each([["up", up], ["down", down], ["pageUp", key("pageUp")], ["pageDown", key("pageDown")]])(
    "%s does nothing while answering",
    (_, item) => {
      for (const read of ["line", "file"] as const) {
        expect(press(asking(read, collect, ""), ...type("1"), item).line).toBe("1");
      }
    },
  );

  test("answers stay out of the history", () => {
    const shell = press(run(asking("line", yesOrNo), "yes"), up);

    expect(shell.line).toBe("foo");
  });

  test("Esc clears only the line", () => {
    const shell = press(asking("file", collect, ""), ...type("abc"), escape);

    expect(shell.line).toBe("");
    expect(shell.input.type).toBe("question");
  });

  test("^Z shows as two cells and edits as one character", () => {
    const eof: ShellKey = { type: "char", char: "\x1A" };
    const shell = press(asking("file", collect, ""), ...type("ab"), eof);
    const row = shell.screen.cursor.row;

    expect(rowText(shell.screen, row)).toBe("ab^Z");
    expect(cursorAt(shell)).toEqual([row, 4]);
    expect(rowText(press(shell, backspace).screen, row)).toBe("ab");
    expect(cursorAt(press(shell, left))).toEqual([row, 2]);
  });

  test("^Z and Enter show ^Z and move to the next row", () => {
    const shell = press(asking("file", collect, ""), { type: "char", char: "\x1A" }, enter);
    const row = shell.screen.cursor.row;

    expect(rows(shell, row - 3, row)).toEqual(["^Z", "collected", "", PROMPT]);
  });

  test("the date prompt still asks as before", () => {
    expect(run(asking("line", yesOrNo), "y", "date").input.type).toBe("date");
  });
});

describe("ECHO", () => {
  const lastRows = (shell: ShellState, count: number) => {
    const row = shell.screen.cursor.row;
    return rows(shell, row - count + 1, row);
  };

  test("prints a message exactly as typed", () => {
    expect(lastRows(run(shellAt(0), "echo Hello,  World"), 3)).toEqual(["Hello,  World", "", PROMPT]);
  });

  test("ECHO. prints an empty row", () => {
    expect(rows(run(shellAt(0), "echo."), 1, 3)).toEqual(["", "", PROMPT]);
  });

  test("a switch is text", () => {
    expect(rowText(run(shellAt(0), "echo /x").screen, 1)).toBe("/x");
  });

  test("ECHO /? shows its help", () => {
    expect(rowText(run(shellAt(0), "echo /?").screen, 1)).toBe(
      "Displays messages, or turns command-echoing on or off.",
    );
  });

  test("shows the setting", () => {
    expect(rowText(run(shellAt(0), "echo").screen, 1)).toBe("ECHO is on");
  });

  test("ECHO OFF hides the prompt, and ECHO shows it is off", () => {
    const off = run(shellAt(0), "eCHo oFF");

    expect(rows(off, 1, 2)).toEqual(["", ""]);
    expect(cursorAt(off)).toEqual([2, 0]);
    expect(rowText(run(off, "echo").screen, 3)).toBe("ECHO is off");
  });

  test("ECHO ON shows the prompt again", () => {
    const shell = run(shellAt(0), "echo off", "echo on");

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe(PROMPT);
  });

  test("Echo off: typing starts at column 0 and Home goes there", () => {
    const shell = press(run(shellAt(0), "echo off"), ...type("ver"));
    const row = shell.screen.cursor.row;

    expect(rowText(shell.screen, row)).toBe("ver");
    expect(cursorAt(press(shell, home))).toEqual([row, 0]);
  });

  test("output behaves as before while echo is off", () => {
    const shell = run(shellAt(0), "echo off", "ver");

    expect(rowText(shell.screen, 4)).toBe(VERSION);
  });

  test("the setting starts on", () => {
    expect(shellAt(0).echo).toBe(true);
  });
});

describe("COPY CON", () => {
  const eof: ShellKey = { type: "char", char: "\x1A" };
  const COUNT_1 = "        1 File(s) copied";

  const fileText = (shell: ShellState, name: string) => {
    const found = shell.disk.filesystem.root.entries.find((entry) => entry.name === name);
    return found?.kind === "file" && found.content.kind === "text" ? found.content.text : undefined;
  };

  test("Two lines", () => {
    const shell = press(run(shellAt(0), "copy con note.txt", "hello", "world"), eof, enter);

    expect(rows(shell, 1, 6)).toEqual(["hello", "world", "^Z", COUNT_1, "", PROMPT]);
    expect(fileText(shell, "NOTE.TXT")).toBe("hello\r\nworld\r\n");
    expect(fileText(shell, "NOTE.TXT")).toHaveLength(14);
  });

  test("Ending on a line with text", () => {
    const shell = press(run(shellAt(0), "copy con note.txt"), ...type("last"), eof, enter);

    expect(fileText(shell, "NOTE.TXT")).toBe("last");
  });

  test("Nothing typed", () => {
    const shell = press(run(shellAt(0), "copy con empty.txt"), eof, enter);

    expect(rowText(shell.screen, 2)).toBe("        0 File(s) copied");
    expect(fileText(shell, "EMPTY.TXT")).toBeUndefined();
  });

  test("Editing a line", () => {
    const shell = press(run(shellAt(0), "copy con note.txt"), ...type("helo"), left, ...type("l"), enter, eof, enter);

    expect(fileText(shell, "NOTE.TXT")).toBe("hello\r\n");
  });

  test("Escape clears only the line", () => {
    const shell = press(run(shellAt(0), "copy con note.txt"), ...type("oops"), escape);

    expect(shell.line).toBe("");
    expect(shell.input.type).toBe("question");
  });

  test("Not in history", () => {
    const shell = press(press(run(shellAt(0), "copy con note.txt", "hello"), eof, enter), up);

    expect(shell.line).toBe("copy con note.txt");
  });

  test("lines hold at most 127 characters", () => {
    const shell = press(run(shellAt(0), "copy con note.txt"), ...type("x".repeat(130)));

    expect(shell.line).toHaveLength(127);
  });

  test("an existing file is asked about once the text is typed", () => {
    const shell = press(run(shellAt(0), "copy con readme.txt", "new"), eof, enter);

    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("Overwrite C:\\README.TXT (Yes/No/All)?");
    expect(fileText(run(shell, "y"), "README.TXT")).toBe("new\r\n");
  });

  test("No way to get stuck", () => {
    const shell = press(run(shellAt(0), "copy con note.txt", "a", "b"), ...type("partial"), key("home"), eof, enter);

    expect(shell.input.type).toBe("command");
    expect(fileText(shell, "NOTE.TXT")).toBe("a\r\nb\r\n");
  });
});
