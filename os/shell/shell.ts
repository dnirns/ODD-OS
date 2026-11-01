import {
  COLUMNS,
  moveCursor,
  ROWS,
  type Screen,
  scrollUp,
  writeText,
} from "../terminal/screen";
import {
  addEntry,
  createHistory,
  type History,
  recallNewest,
  recallNext,
  recallOldest,
  recallPrevious,
} from "./history";
import { PROMPT } from "./prompt";
import type { ShellKey } from "./shellKeys";

const MAX_LINE_LENGTH = 127;
const BAD_COMMAND = "Bad command or file name";

type Position = {
  readonly row: number;
  readonly column: number;
};

export type ShellState = {
  readonly screen: Screen;
  readonly lineStart: Position;
  readonly line: string;
  readonly cursor: number;
  readonly overstrike: boolean;
  readonly history: History;
};

const cellAt = ({ row, column }: Position, offset: number): Position => ({
  row: row + Math.floor((column + offset) / COLUMNS),
  column: (column + offset) % COLUMNS,
});

const writeWrapped = (
  screen: Screen,
  { row, column }: Position,
  text: string,
): Screen => {
  if (text === "") return screen;

  const width = COLUMNS - column;
  return writeWrapped(
    writeText(screen, row, column, text.slice(0, width)),
    { row: row + 1, column: 0 },
    text.slice(width),
  );
};

const redraw = (
  state: ShellState,
  { line = state.line, cursor = state.cursor }: {
    readonly line?: string;
    readonly cursor?: number;
  },
): ShellState => {
  const overflow = Math.max(
    cellAt(state.lineStart, line.length).row - (ROWS - 1),
    0,
  );
  const lineStart = { ...state.lineStart, row: state.lineStart.row - overflow };
  const screen = writeWrapped(
    overflow > 0 ? scrollUp(state.screen, overflow) : state.screen,
    lineStart,
    line.padEnd(state.line.length),
  );
  const { row, column } = cellAt(lineStart, cursor);

  return {
    ...state,
    screen: moveCursor(screen, row, column),
    lineStart,
    line,
    cursor,
  };
};

const typeChar = (state: ShellState, char: string): ShellState => {
  const { line, cursor, overstrike } = state;
  const replaces = overstrike && cursor < line.length;

  if (!replaces && line.length >= MAX_LINE_LENGTH) return state;

  return redraw(state, {
    line: line.slice(0, cursor) + char + line.slice(cursor + (replaces ? 1 : 0)),
    cursor: cursor + 1,
  });
};

const removeAt = (state: ShellState, index: number): ShellState =>
  redraw(state, {
    line: state.line.slice(0, index) + state.line.slice(index + 1),
    cursor: index,
  });

const recall = (state: ShellState, history: History): ShellState => {
  if (history.position === state.history.position) return state;

  const line = history.entries[history.position ?? 0];
  return { ...redraw(state, { line, cursor: line.length }), history };
};

const nextRow = (screen: Screen): Screen => {
  const { row } = screen.cursor;

  return row === ROWS - 1
    ? moveCursor(scrollUp(screen), row, 0)
    : moveCursor(screen, row + 1, 0);
};

const printLine = (screen: Screen, text: string): Screen =>
  nextRow(writeText(screen, screen.cursor.row, 0, text));

const showPrompt = (screen: Screen): Screen => {
  const { row } = screen.cursor;
  return moveCursor(writeText(screen, row, 0, PROMPT), row, PROMPT.length);
};

const submit = ({ screen, lineStart, line, history }: ShellState): ShellState => {
  const end = cellAt(lineStart, line.length);
  const afterLine = nextRow(moveCursor(screen, end.row, end.column));
  const isBlank = line.trim() === "";
  const output = isBlank ? afterLine : nextRow(printLine(afterLine, BAD_COMMAND));
  const prompted = showPrompt(output);

  return {
    screen: prompted,
    lineStart: prompted.cursor,
    line: "",
    cursor: 0,
    overstrike: false,
    history: isBlank ? history : addEntry(history, line),
  };
};

export const createShell = (screen: Screen): ShellState => ({
  screen,
  lineStart: { row: screen.cursor.row, column: screen.cursor.column },
  line: "",
  cursor: 0,
  overstrike: false,
  history: createHistory(),
});

export const reduceShell = (state: ShellState, key: ShellKey): ShellState => {
  const { line, cursor, history } = state;

  switch (key.type) {
    case "char":
      return typeChar(state, key.char);
    case "backspace":
      return cursor === 0 ? state : removeAt(state, cursor - 1);
    case "delete":
      return cursor === line.length ? state : removeAt(state, cursor);
    case "left":
      return redraw(state, { cursor: Math.max(cursor - 1, 0) });
    case "right":
      return redraw(state, { cursor: Math.min(cursor + 1, line.length) });
    case "home":
      return redraw(state, { cursor: 0 });
    case "end":
      return redraw(state, { cursor: line.length });
    case "escape":
      return redraw(state, { line: "", cursor: 0 });
    case "insert":
      return { ...state, overstrike: !state.overstrike };
    case "up":
      return recall(state, recallPrevious(history));
    case "down":
      return recall(state, recallNext(history));
    case "pageUp":
      return recall(state, recallOldest(history));
    case "pageDown":
      return recall(state, recallNewest(history));
    case "enter":
      return submit(state);
    case "ignore":
      return state;
  }
};
