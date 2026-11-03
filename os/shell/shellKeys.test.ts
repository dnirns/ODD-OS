import { describe, expect, test } from "vitest";

import { type KeyInput, toShellKey } from "./shellKeys";

const press = (key: string, modifiers: Partial<KeyInput> = {}, acceptsEndOfFile = false) =>
  toShellKey(
    {
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      altGraph: false,
      ...modifiers,
    },
    acceptsEndOfFile,
  );

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

describe("keys that must not continue a paused listing", () => {
  test.each(["Shift", "Control", "Alt", "Meta", "CapsLock"])("%s alone gives no key", (key) => {
    expect(press(key)).toBeUndefined();
  });

  test.each([
    ["r", { metaKey: true }],
    ["r", { ctrlKey: true }],
    ["c", { ctrlKey: true }],
    ["l", { metaKey: true }],
  ])("%s with a Cmd or Ctrl modifier gives no key", (key, modifiers) => {
    expect(press(key, modifiers)).toBeUndefined();
  });

  test.each(["F1", "F5", "F12"])("%s gives no key", (key) => {
    expect(press(key)).toBeUndefined();
  });
});

describe("keys that continue a paused listing", () => {
  test.each(["Enter", " ", "Escape", "ArrowUp", "ArrowDown", "a", "Tab"])("%j gives a key", (key) => {
    expect(press(key)).toBeDefined();
  });
});

describe("the end-of-file key", () => {
  const END_OF_FILE = { type: "char", char: "\x1A" };

  test.each([
    ["Ctrl+Z", "z", { ctrlKey: true }],
    ["Ctrl+Shift+Z", "Z", { ctrlKey: true }],
    ["F6", "F6", {}],
  ])("%s types it while a file is read", (_, key, modifiers) => {
    expect(press(key, modifiers, true)).toEqual(END_OF_FILE);
  });

  test.each([
    ["Ctrl+Z", "z", { ctrlKey: true }],
    ["F6", "F6", {}],
  ])("%s maps to nothing at the prompt", (_, key, modifiers) => {
    expect(press(key, modifiers)).toBeUndefined();
  });

  test.each([
    ["Cmd+Z", "z", { metaKey: true }],
    ["Alt+F6", "F6", { altKey: true }],
    ["Ctrl+Alt+Z", "z", { ctrlKey: true, altKey: true }],
  ])("%s does not type it", (_, key, modifiers) => {
    expect(press(key, modifiers, true)).not.toEqual(END_OF_FILE);
  });

  test("other keys are unchanged while a file is read", () => {
    expect(press("a", {}, true)).toEqual({ type: "char", char: "a" });
    expect(press("c", { ctrlKey: true }, true)).toBeUndefined();
  });
});
