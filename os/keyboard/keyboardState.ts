import type { KeyInput } from "../shell/shellKeys";
import { isLetter, type KeyDef, type Modifier } from "./layout";

// A second tap of Shift this soon after the first holds it down.
export const SHIFT_LOCK_MS = 400;

export type KeyboardState = {
  readonly shift: "off" | "once" | "locked";
  readonly shiftAt: number;
  readonly caps: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
};

// What a physical keyboard would report in its `keydown`.
export type Keystroke = {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
};

export const INITIAL_KEYBOARD: KeyboardState = {
  shift: "off",
  shiftAt: 0,
  caps: false,
  ctrl: false,
  alt: false,
};

const toggleShift = (state: KeyboardState, now: number): KeyboardState => {
  if (state.shift === "off") return { ...state, shift: "once", shiftAt: now };
  if (state.shift === "once" && now - state.shiftAt <= SHIFT_LOCK_MS) {
    return { ...state, shift: "locked" };
  }
  return { ...state, shift: "off" };
};

const toggle = (state: KeyboardState, modifier: Modifier, now: number): KeyboardState => {
  switch (modifier) {
    case "shift":
      return toggleShift(state, now);
    case "caps":
      return { ...state, caps: !state.caps };
    case "ctrl":
      return { ...state, ctrl: !state.ctrl };
    case "alt":
      return { ...state, alt: !state.alt };
  }
};

// Caps Lock with Shift types lower case, as on a PC.
const typedKey = (state: KeyboardState, key: KeyDef & { kind: "character" }) => {
  const shifted = state.shift !== "off";
  const upper = isLetter(key) ? shifted !== state.caps : shifted;
  return upper ? key.shifted : key.base;
};

// One-shot modifiers apply to a single key and then let go.
const release = (state: KeyboardState): KeyboardState => ({
  ...state,
  shift: state.shift === "once" ? "off" : state.shift,
  ctrl: false,
  alt: false,
});

export const press = (
  state: KeyboardState,
  key: KeyDef,
  now: number,
): { readonly state: KeyboardState; readonly stroke?: Keystroke } => {
  if (key.kind === "gap") return { state };
  if (key.kind === "modifier") return { state: toggle(state, key.modifier, now) };

  const stroke: Keystroke = {
    key: key.kind === "character" ? typedKey(state, key) : key.key,
    shiftKey: state.shift !== "off",
    ctrlKey: state.ctrl,
    altKey: state.alt,
  };
  return { state: release(state), stroke };
};

export const isLit = (state: KeyboardState, modifier: Modifier) =>
  modifier === "shift" ? state.shift !== "off" : state[modifier];

export const toKeyInput = ({ key, ctrlKey, altKey }: Keystroke): KeyInput => ({
  key,
  ctrlKey,
  altKey,
  metaKey: false,
  altGraph: false,
});
