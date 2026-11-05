export type AttributeCode = "D" | "R" | "H" | "S" | "A";

export type AttributeTerm = { readonly code: AttributeCode; readonly wanted: boolean };

export type SortCode = "N" | "E" | "S" | "D" | "G";

export type SortKey = { readonly code: SortCode; readonly reversed: boolean };

export type DirOptions = {
  // `undefined` is the default: everything except hidden and system entries.
  // An empty list shows every entry.
  readonly attributes: readonly AttributeTerm[] | undefined;
  // Empty means storage order.
  readonly order: readonly SortKey[];
  readonly bare: boolean;
  readonly lower: boolean;
  readonly subdirectories: boolean;
  readonly wide: boolean;
  readonly page: boolean;
};

export const DEFAULT_DIR_OPTIONS: DirOptions = {
  attributes: undefined,
  order: [],
  bare: false,
  lower: false,
  subdirectories: false,
  wide: false,
  page: false,
};

// `/O` alone: directories first, then by name.
const DEFAULT_ORDER: readonly SortKey[] = [
  { code: "G", reversed: false },
  { code: "N", reversed: false },
];

const ATTRIBUTE_CODES: readonly AttributeCode[] = ["D", "R", "H", "S", "A"];
const SORT_CODES: readonly SortCode[] = ["N", "E", "S", "D", "G"];

// Reads codes such as `D`, `-H` or `HS-D`; each may be preceded by `-`.
const parseCodes = <Code extends string, Item>(
  text: string,
  allowed: readonly Code[],
  make: (code: Code, negated: boolean) => Item,
): Item[] | undefined => {
  const result: Item[] = [];
  let negated = false;

  for (const char of text.replace(/^:/, "")) {
    const code = allowed.find((candidate) => candidate === char);

    if (char === "-" && !negated) {
      negated = true;
    } else if (code !== undefined) {
      result.push(make(code, negated));
      negated = false;
    } else {
      return undefined;
    }
  }

  return negated ? undefined : result;
};

const BOOLEANS = {
  B: "bare",
  L: "lower",
  S: "subdirectories",
  W: "wide",
  P: "page",
} as const;

const isBoolean = (name: string): name is keyof typeof BOOLEANS => Object.hasOwn(BOOLEANS, name);

// Applies one switch such as `/W`, `/-W`, `/A:D` or `/OGN` to the options.
// Returns `undefined` for a switch DIR does not have.
export const applyDirSwitch = (
  options: DirOptions,
  text: string,
): DirOptions | undefined => {
  const switchText = text.toUpperCase();
  if (!switchText.startsWith("/")) return undefined;

  const body = switchText.slice(1);
  const off = body.startsWith("-");
  const name = off ? body.slice(1) : body;

  if (name === "C" || name === "CH") return options;
  if (isBoolean(name)) {
    return { ...options, [BOOLEANS[name]]: !off };
  }

  if (off) {
    if (name === "A") return { ...options, attributes: undefined };
    if (name === "O") return { ...options, order: [] };
    return undefined;
  }

  if (body.startsWith("A")) {
    const terms = parseCodes(body.slice(1), ATTRIBUTE_CODES, (code, negated) => ({
      code,
      wanted: !negated,
    }));
    return terms && { ...options, attributes: terms };
  }
  if (body.startsWith("O")) {
    const keys = parseCodes(body.slice(1), SORT_CODES, (code, reversed) => ({ code, reversed }));
    return keys && { ...options, order: keys.length === 0 ? DEFAULT_ORDER : keys };
  }

  return undefined;
};

export const applyDirSwitches = (
  options: DirOptions,
  switches: readonly string[],
): DirOptions | undefined => {
  let current: DirOptions | undefined = options;

  for (const text of switches) {
    current = current && applyDirSwitch(current, text);
  }

  return current;
};

const DIRCMD_SWITCH = /\/[^/\s,;=]*/g;

// The options `DIRCMD` presets. A value that is not made of valid DIR
// switches is ignored in full.
export const presetOptions = (dircmd: string | undefined): DirOptions =>
  (dircmd && applyDirSwitches(DEFAULT_DIR_OPTIONS, dircmd.match(DIRCMD_SWITCH) ?? [])) ||
  DEFAULT_DIR_OPTIONS;
