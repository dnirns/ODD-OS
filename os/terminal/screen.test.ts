import { describe, expect, test } from "vitest";

import {
  clearScreen,
  COLUMNS,
  createScreen,
  moveCursor,
  ROWS,
  type Screen,
  setCursorVisible,
  toRuns,
  writeText,
} from "./screen";

const rowText = (screen: Screen, row: number) =>
  screen.rows[row].map((cell) => cell.char).join("");

describe("createScreen", () => {
  test("creates 25 rows of 80 blank default-coloured cells", () => {
    const { rows } = createScreen();

    expect(rows).toHaveLength(ROWS);
    expect(rows.every((cells) => cells.length === COLUMNS)).toBe(true);
    expect(
      rows
        .flat()
        .every(
          (cell) =>
            cell.char === " " && cell.fg === "light-grey" && cell.bg === "black",
        ),
    ).toBe(true);
  });

  test("places a visible cursor at the top-left cell", () => {
    expect(createScreen().cursor).toEqual({ row: 0, column: 0, visible: true });
  });
});

describe("writeText", () => {
  test("places consecutive characters at the given position", () => {
    const screen = writeText(createScreen(), 2, 4, "HELLO");

    expect(rowText(screen, 2).slice(0, 10)).toBe("    HELLO ");
  });

  test("uses default colours when none are given", () => {
    const { rows } = writeText(createScreen(), 0, 0, "A");

    expect(rows[0][0]).toEqual({ char: "A", fg: "light-grey", bg: "black" });
  });

  test("colours only the written cells", () => {
    const initial = writeText(createScreen(), 0, 0, "ABC", { fg: "red" });
    const { rows } = writeText(initial, 0, 1, "X", {
      fg: "yellow",
      bg: "blue",
    });

    expect(rows[0][0]).toEqual({ char: "A", fg: "red", bg: "black" });
    expect(rows[0][1]).toEqual({ char: "X", fg: "yellow", bg: "blue" });
    expect(rows[0][2]).toEqual({ char: "C", fg: "red", bg: "black" });
  });

  test("discards text past the last column without touching other rows", () => {
    const blank = createScreen();
    const screen = writeText(blank, 3, 78, "ABCD");

    expect(rowText(screen, 3).slice(-2)).toBe("AB");
    expect(screen.rows[4]).toBe(blank.rows[4]);
  });

  test("ignores cells outside the grid", () => {
    const blank = createScreen();

    expect(writeText(blank, -1, 0, "A").rows).toEqual(blank.rows);
    expect(writeText(blank, ROWS, 0, "A").rows).toEqual(blank.rows);
    expect(writeText(blank, 0, COLUMNS, "A").rows).toEqual(blank.rows);
    expect(rowText(writeText(blank, 0, -1, "AB"), 0).slice(0, 2)).toBe("B ");
  });

  test("shows control characters as blanks in one cell each", () => {
    const screen = writeText(createScreen(), 0, 0, "A\nB\tC\u0007D");

    expect(rowText(screen, 0).slice(0, 7)).toBe("A B C D");
  });

  test("gives a surrogate pair exactly one cell", () => {
    const { rows } = writeText(createScreen(), 0, 0, "\u{1F40D}B");

    expect(rows[0][0].char).toBe("\u{1F40D}");
    expect(rows[0][1].char).toBe("B");
  });

  test("leaves the input screen unchanged", () => {
    const blank = createScreen();

    writeText(blank, 0, 0, "A");

    expect(blank.rows[0][0].char).toBe(" ");
  });
});

describe("clearScreen", () => {
  test("blanks every cell and homes the cursor", () => {
    const written = moveCursor(
      writeText(createScreen(), 5, 5, "A", { fg: "red", bg: "blue" }),
      5,
      6,
    );
    const screen = clearScreen(written);

    expect(screen.rows).toEqual(createScreen().rows);
    expect(screen.cursor).toEqual({ row: 0, column: 0, visible: true });
  });

  test("keeps the cursor hidden when it was hidden", () => {
    const hidden = setCursorVisible(createScreen(), false);

    expect(clearScreen(hidden).cursor.visible).toBe(false);
  });
});

describe("moveCursor", () => {
  test("moves the cursor to the given cell", () => {
    const { cursor } = moveCursor(createScreen(), 10, 20);

    expect(cursor).toEqual({ row: 10, column: 20, visible: true });
  });

  test("clamps positions to the nearest cell in the grid", () => {
    expect(moveCursor(createScreen(), -5, -5).cursor).toMatchObject({
      row: 0,
      column: 0,
    });
    expect(moveCursor(createScreen(), 99, 99).cursor).toMatchObject({
      row: 24,
      column: 79,
    });
  });
});

describe("setCursorVisible", () => {
  test("hides and shows the cursor", () => {
    const hidden = setCursorVisible(createScreen(), false);

    expect(hidden.cursor.visible).toBe(false);
    expect(setCursorVisible(hidden, true).cursor.visible).toBe(true);
  });
});

describe("toRuns", () => {
  test("merges adjacent cells with the same colours", () => {
    expect(toRuns(createScreen().rows[0])).toEqual([
      { text: " ".repeat(COLUMNS), fg: "light-grey", bg: "black" },
    ]);
  });

  test("splits runs where colours change", () => {
    const { rows } = writeText(createScreen(), 0, 2, "AB", { fg: "red" });

    expect(toRuns(rows[0]).map(({ text, fg }) => [text, fg])).toEqual([
      ["  ", "light-grey"],
      ["AB", "red"],
      [" ".repeat(COLUMNS - 4), "light-grey"],
    ]);
  });

  test("splits runs where only the background changes", () => {
    const { rows } = writeText(createScreen(), 0, 0, "A", { bg: "blue" });

    expect(toRuns(rows[0])).toHaveLength(2);
  });

  test("covers all 80 cells", () => {
    const { rows } = writeText(createScreen(), 0, 10, "A", { fg: "red" });
    const total = toRuns(rows[0]).reduce(
      (sum, run) => sum + Array.from(run.text).length,
      0,
    );

    expect(total).toBe(COLUMNS);
  });
});
