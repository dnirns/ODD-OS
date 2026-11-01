import { type Color, DEFAULT_BACKGROUND, DEFAULT_FOREGROUND } from "./colors";

export const COLUMNS = 80;
export const ROWS = 25;

export type Cell = {
  readonly char: string;
  readonly fg: Color;
  readonly bg: Color;
};

export type Cursor = {
  readonly row: number;
  readonly column: number;
  readonly visible: boolean;
};

export type Screen = {
  readonly rows: readonly (readonly Cell[])[];
  readonly cursor: Cursor;
};

export type TextStyle = {
  readonly fg?: Color;
  readonly bg?: Color;
};

export type Run = {
  readonly text: string;
  readonly fg: Color;
  readonly bg: Color;
};

const BLANK_CELL: Cell = {
  char: " ",
  fg: DEFAULT_FOREGROUND,
  bg: DEFAULT_BACKGROUND,
};

const clamp = (value: number, max: number) =>
  Math.min(Math.max(value, 0), max);

const toDisplayChar = (char: string) => (/\p{Cc}/u.test(char) ? " " : char);

export const createScreen = (): Screen => ({
  rows: Array.from({ length: ROWS }, () =>
    Array.from({ length: COLUMNS }, () => BLANK_CELL),
  ),
  cursor: { row: 0, column: 0, visible: true },
});

export const writeText = (
  screen: Screen,
  row: number,
  column: number,
  text: string,
  { fg = DEFAULT_FOREGROUND, bg = DEFAULT_BACKGROUND }: TextStyle = {},
): Screen => {
  const chars = Array.from(text, toDisplayChar);

  return {
    ...screen,
    rows: screen.rows.map((cells, rowIndex) =>
      rowIndex === row
        ? cells.map((cell, columnIndex) => {
            const char = chars[columnIndex - column];
            return char === undefined ? cell : { char, fg, bg };
          })
        : cells,
    ),
  };
};

export const clearScreen = (screen: Screen): Screen => {
  const { rows, cursor } = createScreen();
  return { rows, cursor: { ...cursor, visible: screen.cursor.visible } };
};

export const scrollUp = (screen: Screen, count = 1): Screen => ({
  ...screen,
  rows: [...screen.rows.slice(count), ...createScreen().rows].slice(0, ROWS),
});

export const moveCursor = (
  screen: Screen,
  row: number,
  column: number,
): Screen => ({
  ...screen,
  cursor: {
    ...screen.cursor,
    row: clamp(row, ROWS - 1),
    column: clamp(column, COLUMNS - 1),
  },
});

export const setCursorVisible = (screen: Screen, visible: boolean): Screen => ({
  ...screen,
  cursor: { ...screen.cursor, visible },
});

export const toRuns = (cells: readonly Cell[]): Run[] =>
  cells.reduce<Run[]>((runs, { char, fg, bg }) => {
    const last = runs.at(-1);

    return last?.fg === fg && last.bg === bg
      ? [...runs.slice(0, -1), { ...last, text: last.text + char }]
      : [...runs, { text: char, fg, bg }];
  }, []);
