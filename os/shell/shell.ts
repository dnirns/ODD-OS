import {
  clearScreen,
  COLUMNS,
  moveCursor,
  ROWS,
  type Screen,
  scrollUp,
  writeText,
} from "../terminal/screen";
import type { Clock } from "./clock";
import {
  answerPrompt,
  type CommandResult,
  type PromptInput,
  runCommand,
} from "./commands";
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

const PROMPT_TEXT: Readonly<Record<PromptInput, string>> = {
  date: "Enter new date (mm-dd-yy): ",
  time: "Enter new time: ",
};

type Position = {
  readonly row: number;
  readonly column: number;
};

type InputMode = { readonly type: "command" } | { readonly type: PromptInput };

export type ShellState = {
  readonly screen: Screen;
  readonly lineStart: Position;
  readonly line: string;
  readonly cursor: number;
  readonly overstrike: boolean;
  readonly history: History;
  readonly input: InputMode;
  readonly clock: Clock;
};

export type ShellAction = {
  readonly key: ShellKey;
  readonly now: number;
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
  if (
    state.input.type !== "command" ||
    history.position === state.history.position
  ) {
    return state;
  }

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

const printLines = (screen: Screen, lines: readonly string[]): Screen =>
  lines.reduce(printLine, screen);

const showPrompt = (screen: Screen, prompt: string): Screen => {
  const { row } = screen.cursor;
  return moveCursor(writeText(screen, row, 0, prompt), row, prompt.length);
};

const startLine = (state: ShellState, screen: Screen): ShellState => ({
  ...state,
  screen,
  lineStart: screen.cursor,
  line: "",
  cursor: 0,
  overstrike: false,
});

const toCommandPrompt = (state: ShellState, screen: Screen): ShellState => ({
  ...startLine(state, showPrompt(screen, PROMPT)),
  input: { type: "command" },
});

const applyResult = (
  state: ShellState,
  screen: Screen,
  result: CommandResult,
): ShellState => {
  switch (result.type) {
    case "print":
      return toCommandPrompt(state, nextRow(printLines(screen, result.lines)));
    case "clear":
      return toCommandPrompt(state, nextRow(clearScreen(screen)));
    case "ask":
      return {
        ...startLine(
          state,
          showPrompt(printLines(screen, result.lines), PROMPT_TEXT[result.input]),
        ),
        input: { type: result.input },
      };
    case "setClock":
      return toCommandPrompt({ ...state, clock: result.clock }, nextRow(screen));
  }
};

const submit = (state: ShellState, now: number): ShellState => {
  const { screen, lineStart, line, history, input, clock } = state;
  const end = cellAt(lineStart, line.length);
  const afterLine = nextRow(moveCursor(screen, end.row, end.column));
  const context = { clock, now };

  if (input.type !== "command") {
    return applyResult(state, afterLine, answerPrompt(input.type, line, context));
  }
  if (line.trim() === "") return toCommandPrompt(state, afterLine);

  return applyResult(
    { ...state, history: addEntry(history, line) },
    afterLine,
    runCommand(line, context),
  );
};

export const createShell = (screen: Screen, clock: Clock): ShellState => ({
  screen,
  lineStart: { row: screen.cursor.row, column: screen.cursor.column },
  line: "",
  cursor: 0,
  overstrike: false,
  history: createHistory(),
  input: { type: "command" },
  clock,
});

export const reduceShell = (
  state: ShellState,
  { key, now }: ShellAction,
): ShellState => {
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
      return submit(state, now);
    case "ignore":
      return state;
  }
};
