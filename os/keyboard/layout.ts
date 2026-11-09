export type Modifier = "shift" | "caps" | "ctrl" | "alt";

// Widths are in key units: a letter key is one unit and every row is 15.
export type KeyDef =
  | {
      readonly kind: "character";
      readonly id: string;
      readonly base: string;
      readonly shifted: string;
      readonly width: number;
    }
  | {
      readonly kind: "modifier";
      readonly id: string;
      readonly modifier: Modifier;
      readonly label: string;
      readonly name: string;
      readonly width: number;
    }
  | {
      readonly kind: "action";
      readonly id: string;
      // The `key` a physical keyboard reports, such as `ArrowUp`.
      readonly key: string;
      readonly label: string;
      readonly name: string;
      readonly width: number;
      readonly repeats: boolean;
    }
  | { readonly kind: "gap"; readonly id: string; readonly width: number };

export const ROW_UNITS = 15;

const char = (base: string, shifted: string, width = 1): KeyDef => ({
  kind: "character",
  id: `char-${base}`,
  base,
  shifted,
  width,
});

const letters = (row: string) =>
  [...row].map((letter) => char(letter, letter.toUpperCase()));

const action = (
  key: string,
  label: string,
  name: string,
  width: number,
  repeats = false,
  id = key,
): KeyDef => ({ kind: "action", id, key, label, name, width, repeats });

const modifier = (
  id: string,
  mod: Modifier,
  label: string,
  name: string,
  width: number,
): KeyDef => ({ kind: "modifier", id, modifier: mod, label, name, width });

const gap = (id: string, width: number): KeyDef => ({ kind: "gap", id, width });

// The main block of a US 101-key keyboard. Its edit keys move to the top
// strip and its arrows to the bottom corner, as on a laptop, so that the
// whole keyboard is 15 units wide.
export const LAYOUT: readonly (readonly KeyDef[])[] = [
  [
    action("Escape", "Esc", "Escape", 1.5),
    gap("gap-esc", 0.75),
    action("F6", "F6", "F6", 1.5),
    action("F10", "F10", "F10", 1.5),
    gap("gap-edit", 0.75),
    action("Insert", "Ins", "Insert", 1.5),
    action("Delete", "Del", "Delete", 1.5, true),
    action("Home", "Home", "Home", 1.5),
    action("End", "End", "End", 1.5),
    action("PageUp", "PgUp", "Page Up", 1.5, true),
    action("PageDown", "PgDn", "Page Down", 1.5, true),
  ],
  [
    char("`", "~"),
    char("1", "!"),
    char("2", "@"),
    char("3", "#"),
    char("4", "$"),
    char("5", "%"),
    char("6", "^"),
    char("7", "&"),
    char("8", "*"),
    char("9", "("),
    char("0", ")"),
    char("-", "_"),
    char("=", "+"),
    action("Backspace", "Bksp", "Backspace", 2, true),
  ],
  [
    action("Tab", "Tab", "Tab", 1.5),
    ...letters("qwertyuiop"),
    char("[", "{"),
    char("]", "}"),
    char("\\", "|", 1.5),
  ],
  [
    modifier("caps", "caps", "Caps Lock", "Caps Lock", 1.75),
    ...letters("asdfghjkl"),
    char(";", ":"),
    char("'", '"'),
    action("Enter", "Enter", "Enter", 2.25),
  ],
  [
    modifier("shift-left", "shift", "Shift", "Shift", 2.25),
    ...letters("zxcvbnm"),
    char(",", "<"),
    char(".", ">"),
    char("/", "?"),
    modifier("shift-right", "shift", "Shift", "Shift", 1.75),
    action("ArrowUp", "↑", "Up", 1, true),
  ],
  [
    modifier("ctrl", "ctrl", "Ctrl", "Control", 1.5),
    modifier("alt", "alt", "Alt", "Alt", 1.5),
    action(" ", "", "Space", 9, true, "Space"),
    action("ArrowLeft", "←", "Left", 1, true),
    action("ArrowDown", "↓", "Down", 1, true),
    action("ArrowRight", "→", "Right", 1, true),
  ],
];

export const isLetter = (key: KeyDef) =>
  key.kind === "character" && /^[a-z]$/.test(key.base);

// Character keys and the keys a PC repeats for editing and moving repeat
// while held; modifiers, Enter, Esc, Tab and the function keys do not.
export const repeats = (key: KeyDef) =>
  key.kind === "character" || (key.kind === "action" && key.repeats);

// What assistive technology announces for the key.
export const keyName = (key: KeyDef): string => {
  switch (key.kind) {
    case "character":
      return isLetter(key) ? key.shifted : `${key.base} ${key.shifted}`;
    case "modifier":
    case "action":
      return key.name;
    case "gap":
      return "";
  }
};
