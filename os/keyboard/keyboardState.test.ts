import { describe, expect, test } from "vitest";

import { toShellKey } from "../shell/shellKeys";
import {
  INITIAL_KEYBOARD,
  isLit,
  type KeyboardState,
  type Keystroke,
  press,
  SHIFT_LOCK_MS,
  toKeyInput,
} from "./keyboardState";
import { type KeyDef, LAYOUT } from "./layout";

const keys = LAYOUT.flat();
const byId = (id: string) => keys.find((key) => key.id === id)!;

const SHIFT = "shift-left";

// Taps the keys in turn, a second apart unless a gap is given, and returns
// what was typed and the keyboard's state.
const tap = (ids: readonly (string | number)[], start: KeyboardState = INITIAL_KEYBOARD) => {
  let state = start;
  let now = 10_000;
  const strokes: Keystroke[] = [];
  for (const entry of ids) {
    if (typeof entry === "number") {
      now += entry;
      continue;
    }
    const result = press(state, byId(entry), now);
    state = result.state;
    if (result.stroke) strokes.push(result.stroke);
    now += 1000;
  }
  return { state, strokes, typed: strokes.map((stroke) => stroke.key).join("") };
};

describe("Shift", () => {
  test("applies to one key", () => {
    expect(tap([SHIFT, "char-a", "char-a"]).typed).toBe("Aa");
  });

  test("selects the upper legend of a symbol", () => {
    expect(tap([SHIFT, "char-;"]).typed).toBe(":");
  });

  test("the right Shift works as the left", () => {
    expect(tap(["shift-right", "char-\\"]).typed).toBe("|");
  });

  test("is reported with the keystroke", () => {
    expect(tap([SHIFT, "char-a"]).strokes[0].shiftKey).toBe(true);
  });

  test("a quick double tap holds it", () => {
    const { state, typed } = tap([SHIFT, -1000 + SHIFT_LOCK_MS - 100, SHIFT, "char-a", "char-b"]);
    expect(typed).toBe("AB");
    expect(state.shift).toBe("locked");
  });

  test("a tap releases a held Shift", () => {
    const { typed } = tap([SHIFT, -900, SHIFT, SHIFT, "char-a"]);
    expect(typed).toBe("a");
  });

  test("a slow second tap releases it", () => {
    const { state, typed } = tap([SHIFT, SHIFT, "char-a"]);
    expect(typed).toBe("a");
    expect(state.shift).toBe("off");
  });
});

describe("Caps Lock", () => {
  test("upper-cases letters only", () => {
    expect(tap(["caps", "char-a", "char-1"]).typed).toBe("A1");
  });

  test("stays on until tapped again", () => {
    expect(tap(["caps", "char-a", "char-b", "caps", "char-c"]).typed).toBe("ABc");
  });

  test("with Shift types lower case", () => {
    expect(tap(["caps", SHIFT, "char-a"]).typed).toBe("a");
  });

  test("is lit while on", () => {
    expect(isLit(tap(["caps"]).state, "caps")).toBe(true);
  });
});

describe("Ctrl and Alt", () => {
  test("Ctrl applies to the next key only", () => {
    const { strokes } = tap(["ctrl", "char-c", "char-c"]);
    expect(strokes.map((stroke) => stroke.ctrlKey)).toEqual([true, false]);
    expect(strokes[0].key).toBe("c");
  });

  test("a second tap releases Ctrl", () => {
    const { strokes, state } = tap(["ctrl", "ctrl", "char-c"]);
    expect(strokes[0]).toEqual({ key: "c", shiftKey: false, ctrlKey: false, altKey: false });
    expect(isLit(state, "ctrl")).toBe(false);
  });

  test("Ctrl is lit while held", () => {
    expect(isLit(tap(["ctrl"]).state, "ctrl")).toBe(true);
  });

  test("Alt applies to the next key only", () => {
    const { strokes } = tap(["alt", "char-\\", "char-\\"]);
    expect(strokes.map((stroke) => stroke.altKey)).toEqual([true, false]);
  });

  test("an action key releases one-shot modifiers", () => {
    const { state, strokes } = tap([SHIFT, "ctrl", "Tab"]);
    expect(strokes[0]).toEqual({ key: "Tab", shiftKey: true, ctrlKey: true, altKey: false });
    expect(state).toMatchObject({ shift: "off", ctrl: false, alt: false });
  });
});

describe("Gaps", () => {
  test("type nothing", () => {
    const gap = keys.find((key): key is KeyDef & { kind: "gap" } => key.kind === "gap")!;
    expect(press(INITIAL_KEYBOARD, gap, 0).stroke).toBeUndefined();
  });
});

// The keyboard's keystrokes go through the same decoding as a physical key.
describe("Keystrokes reach the command line", () => {
  const decode = (
    ids: readonly string[],
    acceptsEndOfFile = false,
    acceptsBreak = false,
    acceptsF10 = false,
  ) =>
    tap(ids).strokes.map((stroke) =>
      toShellKey(toKeyInput(stroke), acceptsEndOfFile, acceptsBreak, acceptsF10),
    );

  test("letters", () => {
    expect(decode(["char-d", "char-i", "char-r"])).toEqual([
      { type: "char", char: "d" },
      { type: "char", char: "i" },
      { type: "char", char: "r" },
    ]);
  });

  test("a backslash and a colon", () => {
    expect(decode(["char-\\", SHIFT, "char-;"])).toEqual([
      { type: "char", char: "\\" },
      { type: "char", char: ":" },
    ]);
  });

  test("the arrows, Enter, Backspace and Space", () => {
    expect(decode(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Backspace", "Space"])).toEqual([
      { type: "up" },
      { type: "down" },
      { type: "left" },
      { type: "right" },
      { type: "enter" },
      { type: "backspace" },
      { type: "char", char: " " },
    ]);
  });

  test("Esc", () => {
    expect(decode(["Escape"])).toEqual([{ type: "escape" }]);
  });

  test("Ctrl+C breaks a running batch file", () => {
    expect(decode(["ctrl", "char-c"], false, true)).toEqual([{ type: "break" }]);
  });

  test("Ctrl+C does nothing at the prompt", () => {
    expect(decode(["ctrl", "char-c"])).toEqual([undefined]);
  });

  test("F6 and Ctrl+Z end a file typed at the console", () => {
    expect(decode(["F6", "ctrl", "char-z"], true)).toEqual([
      { type: "char", char: "\x1A" },
      { type: "char", char: "\x1A" },
    ]);
  });

  test("F10 reaches a fullscreen programme", () => {
    expect(decode(["F10"], false, false, true)).toEqual([{ type: "f10" }]);
  });

  test("Alt with a symbol types the symbol", () => {
    expect(decode(["alt", "char-\\"])).toEqual([{ type: "char", char: "\\" }]);
  });
});
