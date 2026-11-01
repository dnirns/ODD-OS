import { describe, expect, test } from "vitest";

import { type KeyInput, toShellKey } from "./shellKeys";

const press = (key: string, modifiers: Partial<KeyInput> = {}) =>
  toShellKey({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    altGraph: false,
    ...modifiers,
  });

describe("toShellKey", () => {
  test.each(["a", "Z", "7", " ", "\\", "~", "/", "'"])(
    "treats %j as a typed character",
    (key) => {
      expect(press(key)).toEqual({ type: "char", char: key });
    },
  );

  test.each([
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["ArrowUp", "up"],
    ["Backspace", "backspace"],
    ["Delete", "delete"],
    ["End", "end"],
    ["Enter", "enter"],
    ["Escape", "escape"],
    ["Home", "home"],
    ["Insert", "insert"],
    ["PageDown", "pageDown"],
    ["PageUp", "pageUp"],
    ["Tab", "ignore"],
  ])("maps %s to %s", (key, type) => {
    expect(press(key)).toEqual({ type });
  });

  test("makes Cmd+Left and Cmd+Right act as Home and End", () => {
    expect(press("ArrowLeft", { metaKey: true })).toEqual({ type: "home" });
    expect(press("ArrowRight", { metaKey: true })).toEqual({ type: "end" });
  });

  test.each<[string, Partial<KeyInput>]>([
    ["c", { ctrlKey: true }],
    ["v", { metaKey: true }],
    ["r", { metaKey: true }],
    ["ArrowLeft", { ctrlKey: true }],
    ["ArrowUp", { metaKey: true }],
    ["ArrowLeft", { metaKey: true, altKey: true }],
    ["ArrowLeft", { altKey: true }],
    ["d", { altKey: true }],
    ["1", { altKey: true }],
    [" ", { altKey: true }],
    ["Enter", { ctrlKey: true }],
  ])("leaves %s with %j to the browser", (key, modifiers) => {
    expect(press(key, modifiers)).toBeUndefined();
  });

  test.each(["\\", "@", "[", "{"])("accepts Option or Alt producing %s", (key) => {
    expect(press(key, { altKey: true })).toEqual({ type: "char", char: key });
  });

  test("accepts AltGr, which Windows reports as Ctrl+Alt", () => {
    expect(
      press("\\", { ctrlKey: true, altKey: true, altGraph: true }),
    ).toEqual({ type: "char", char: "\\" });
  });

  test.each(["Dead", "Process", "é", "£", "F3", "F5", "Shift", "Unidentified"])(
    "produces nothing for %s",
    (key) => {
      expect(press(key)).toBeUndefined();
    },
  );

  test("ignores key names inherited from Object", () => {
    expect(press("constructor")).toBeUndefined();
  });
});
