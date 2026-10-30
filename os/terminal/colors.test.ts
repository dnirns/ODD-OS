import { expect, test } from "vitest";

import { COLORS } from "./colors";

test("defines 16 unique colours in DOS index order", () => {
  expect(new Set(COLORS).size).toBe(16);
  expect(COLORS.indexOf("black")).toBe(0);
  expect(COLORS.indexOf("brown")).toBe(6);
  expect(COLORS.indexOf("light-grey")).toBe(7);
  expect(COLORS.indexOf("dark-grey")).toBe(8);
  expect(COLORS.indexOf("white")).toBe(15);
});
