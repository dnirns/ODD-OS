import { describe, expect, test } from "vitest";

import { layoutRows } from "./text";

describe("layoutRows", () => {
  test("keeps short text on one row", () => {
    expect(layoutRows("hello")).toEqual(["hello"]);
  });

  test("gives one empty row for empty text", () => {
    expect(layoutRows("")).toEqual([""]);
  });

  test.each([79, 80])("keeps %i characters on one row", (length) => {
    expect(layoutRows("x".repeat(length))).toEqual(["x".repeat(length)]);
  });

  test("wraps 81 characters onto a second row", () => {
    expect(layoutRows("x".repeat(81))).toEqual(["x".repeat(80), "x"]);
  });

  test("splits 100 characters into 80 and 20", () => {
    expect(layoutRows("x".repeat(100)).map((row) => row.length)).toEqual([80, 20]);
  });

  test("advances a tab to the next 8-column stop", () => {
    const [row] = layoutRows("a\tb");

    expect(row.indexOf("b")).toBe(8);
  });

  test("advances a tab that falls on a stop by a full stop", () => {
    const [row] = layoutRows("abcdefgh\ti");

    expect(row.indexOf("i")).toBe(16);
  });

  test("counts the stop from the start of a wrapped row", () => {
    const rows = layoutRows(`${"x".repeat(82)}\tb`);

    expect(rows).toHaveLength(2);
    expect(rows[1].indexOf("b")).toBe(8);
  });

  test("wraps a tab that reaches the last column", () => {
    const rows = layoutRows(`${"x".repeat(79)}\tb`);

    expect(rows).toEqual([`${"x".repeat(79)} `, "b"]);
  });
});
