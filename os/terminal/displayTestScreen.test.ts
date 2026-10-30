import { expect, test } from "vitest";

import { COLORS } from "./colors";
import { createDisplayTestScreen } from "./displayTestScreen";
import { COLUMNS, ROWS } from "./screen";

const screen = createDisplayTestScreen();
const cells = screen.rows.flat();
const text = screen.rows
  .map((row) => row.map((cell) => cell.char).join(""))
  .join("\n");

test("shows the ODD/OS name", () => {
  expect(text).toContain("ODD/OS");
});

test("shows every colour as a foreground and a background", () => {
  const visible = cells.filter((cell) => cell.char !== " ");

  for (const color of COLORS) {
    expect(visible.some((cell) => cell.fg === color)).toBe(true);
    expect(cells.some((cell) => cell.bg === color)).toBe(true);
  }
});

test("keeps every colour label readable against its background", () => {
  expect(cells.filter((cell) => cell.fg === cell.bg && cell.char !== " ")).toEqual(
    [],
  );
});

test("draws a border on every outer cell", () => {
  const first = screen.rows[0].map((cell) => cell.char).join("");
  const last = screen.rows[ROWS - 1].map((cell) => cell.char).join("");

  expect(first).toBe(`╔${"═".repeat(COLUMNS - 2)}╗`);
  expect(last).toBe(`╚${"═".repeat(COLUMNS - 2)}╝`);

  for (const row of screen.rows.slice(1, -1)) {
    expect(row[0].char).toBe("║");
    expect(row[COLUMNS - 1].char).toBe("║");
  }
});

test("shows a visible cursor inside the border", () => {
  const { row, column, visible } = screen.cursor;

  expect(visible).toBe(true);
  expect(row).toBeGreaterThan(0);
  expect(row).toBeLessThan(ROWS - 1);
  expect(column).toBeGreaterThan(0);
  expect(column).toBeLessThan(COLUMNS - 1);
});

test("uses only characters confirmed in the font", () => {
  expect(text.replaceAll("\n", "")).toMatch(/^[\x20-\x7E╔═╗║╚╝]+$/);
});
