export type ShellKey =
  | { readonly type: "char"; readonly char: string }
  | {
      readonly type:
        | "backspace"
        | "delete"
        | "down"
        | "end"
        | "enter"
        | "escape"
        | "home"
        | "ignore"
        | "insert"
        | "left"
        | "pageDown"
        | "pageUp"
        | "right"
        | "up";
    };

export type KeyInput = {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly altGraph: boolean;
};

const NAMED_KEYS: Readonly<Record<string, ShellKey>> = {
  ArrowDown: { type: "down" },
  ArrowLeft: { type: "left" },
  ArrowRight: { type: "right" },
  ArrowUp: { type: "up" },
  Backspace: { type: "backspace" },
  Delete: { type: "delete" },
  End: { type: "end" },
  Enter: { type: "enter" },
  Escape: { type: "escape" },
  Home: { type: "home" },
  Insert: { type: "insert" },
  PageDown: { type: "pageDown" },
  PageUp: { type: "pageUp" },
  Tab: { type: "ignore" },
};

const COMMAND_KEYS: Readonly<Record<string, ShellKey>> = {
  ArrowLeft: { type: "home" },
  ArrowRight: { type: "end" },
};

const isPrintable = (key: string) => /^[ -~]$/.test(key);
const isSymbol = (key: string) => /^[!-/:-@[-`{-~]$/.test(key);

const toChar = (key: string, accepts: (key: string) => boolean) =>
  accepts(key) ? ({ type: "char", char: key } as const) : undefined;

export const toShellKey = ({
  key,
  ctrlKey,
  metaKey,
  altKey,
  altGraph,
}: KeyInput): ShellKey | undefined => {
  if (altGraph) return toChar(key, isPrintable);
  if (metaKey && !ctrlKey && !altKey) return COMMAND_KEYS[key];
  if (ctrlKey || metaKey) return undefined;
  if (altKey) return toChar(key, isSymbol);

  return Object.hasOwn(NAMED_KEYS, key)
    ? NAMED_KEYS[key]
    : toChar(key, isPrintable);
};
