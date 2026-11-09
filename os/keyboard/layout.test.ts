import { describe, expect, test } from "vitest";

import { type KeyDef, keyName, LAYOUT, repeats, ROW_UNITS } from "./layout";

const keys = LAYOUT.flat();
const find = (predicate: (key: KeyDef) => boolean) => keys.find(predicate);
const action = (key: string) => find((def) => def.kind === "action" && def.key === key);

describe("The layout", () => {
  test.each(LAYOUT.map((row, index) => [index, row] as const))(
    "row %i is 15 units wide",
    (_, row) => {
      const units = row.reduce((sum, key) => sum + key.width, 0);
      expect(units).toBeCloseTo(ROW_UNITS);
    },
  );

  test("key ids are unique", () => {
    expect(new Set(keys.map((key) => key.id)).size).toBe(keys.length);
  });

  test.each(["\\", ":", "|", "<", ">", "^", "~"])("%s is typed by one key", (glyph) => {
    expect(
      find((key) => key.kind === "character" && (key.base === glyph || key.shifted === glyph)),
    ).toBeDefined();
  });

  test("every letter and digit has a key", () => {
    for (const glyph of "abcdefghijklmnopqrstuvwxyz0123456789") {
      expect(find((key) => key.kind === "character" && key.base === glyph)).toBeDefined();
    }
  });

  test.each([
    "Escape", "Tab", "Enter", "Backspace", " ", "F6", "F10",
    "Insert", "Delete", "Home", "End", "PageUp", "PageDown",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  ])("%s has a key", (key) => {
    expect(action(key)).toBeDefined();
  });

  test.each(["shift", "caps", "ctrl", "alt"])("%s has a key", (modifier) => {
    expect(find((key) => key.kind === "modifier" && key.modifier === modifier)).toBeDefined();
  });
});

describe("Repeating keys", () => {
  test.each(["Backspace", "Delete", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"])(
    "%s repeats",
    (key) => {
      expect(repeats(action(key)!)).toBe(true);
    },
  );

  test("character keys repeat", () => {
    expect(repeats(find((key) => key.kind === "character" && key.base === "a")!)).toBe(true);
  });

  test.each(["Enter", "Escape", "Tab", "F6", "F10"])("%s does not repeat", (key) => {
    expect(repeats(action(key)!)).toBe(false);
  });

  test("modifiers do not repeat", () => {
    for (const key of keys.filter((def) => def.kind === "modifier")) {
      expect(repeats(key)).toBe(false);
    }
  });
});

describe("Key names", () => {
  test("a letter is named by its capital", () => {
    expect(keyName(find((key) => key.kind === "character" && key.base === "q")!)).toBe("Q");
  });

  test("a symbol key is named by both legends", () => {
    expect(keyName(find((key) => key.kind === "character" && key.base === "\\")!)).toBe("\\ |");
  });

  test("the space bar is named", () => {
    expect(keyName(action(" ")!)).toBe("Space");
  });
});
