export type ShellKey =
  | { readonly type: "char"; readonly char: string }
  | {
      readonly type:
        | "backspace"
        | "break"
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

const END_OF_FILE_KEY = { type: "char", char: "\x1A" } as const;

const isEndOfFileKey = ({ key, ctrlKey, metaKey, altKey, altGraph }: KeyInput) =>
  !metaKey && !altKey && !altGraph && (ctrlKey ? key.toLowerCase() === "z" : key === "F6");

const BREAK_KEY = { type: "break" } as const;

const isBreakKey = ({ key, ctrlKey, metaKey, altKey, altGraph }: KeyInput) =>
  ctrlKey && !metaKey && !altKey && !altGraph && (key.toLowerCase() === "c" || key === "Pause" || key === "Cancel");

// Ctrl+Z and F6 type the end-of-file character only where it is accepted,
// while `COPY CON` reads a file. Elsewhere the browser keeps them. Ctrl+C and
// Ctrl+Break are the break key only while a batch file runs; at the prompt
// the browser keeps Ctrl+C to copy.
export const toShellKey = (
  input: KeyInput,
  acceptsEndOfFile = false,
  acceptsBreak = false,
): ShellKey | undefined => {
  const { key, ctrlKey, metaKey, altKey, altGraph } = input;

  if (acceptsBreak && isBreakKey(input)) return BREAK_KEY;  if (acceptsEndOfFile && isEndOfFileKey(input)) return END_OF_FILE_KEY;
  if (altGraph) return toChar(key, isPrintable);
  if (metaKey && !ctrlKey && !altKey) return COMMAND_KEYS[key];
  if (ctrlKey || metaKey) return undefined;
  if (altKey) return toChar(key, isSymbol);

  return Object.hasOwn(NAMED_KEYS, key)
    ? NAMED_KEYS[key]
    : toChar(key, isPrintable);
};
