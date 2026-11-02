import {
  clearScreen,
  COLUMNS,
  moveCursor,
  ROWS,
  type Screen,
  scrollUp,
  writeText,
} from "../terminal/screen";
import { createDisk, type Disk } from "../fs/disk";
import { PROGRAMMES } from "../programs/registry";
import { stepProgramme } from "../programs/step";
import type { Exited, ProgrammeEvent, Registry, Running } from "../programs/types";
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
import { formatPrompt } from "./prompt";
import { layoutRows } from "./text";
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

const PAUSE_MESSAGE = "Press any key to continue . . .";
const PAGE_ROWS = ROWS - 2;

type InputMode =
  | { readonly type: "command" }
  | { readonly type: PromptInput }
  | { readonly type: "pause"; readonly remaining: readonly string[] };

export type ActiveProgramme = {
  readonly programme: Running;
  readonly saved: Screen;
};

export type ShellState = {
  readonly screen: Screen;
  readonly lineStart: Position;
  readonly line: string;
  readonly cursor: number;
  readonly overstrike: boolean;
  readonly history: History;
  readonly input: InputMode;
  readonly clock: Clock;
  readonly disk: Disk;
  readonly programmes: Registry;
  readonly depth: number;
  readonly running: ActiveProgramme | undefined;
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

const printRow = (screen: Screen, text: string): Screen =>
  nextRow(writeText(screen, screen.cursor.row, 0, text));

const printLine = (screen: Screen, text: string): Screen =>
  layoutRows(text).reduce(printRow, screen);

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
  ...startLine(state, showPrompt(screen, formatPrompt(state.disk.cwd))),
  input: { type: "command" },
});

const showPage = (
  state: ShellState,
  screen: Screen,
  lines: readonly string[],
): ShellState => {
  if (lines.length <= PAGE_ROWS) {
    return toCommandPrompt(state, nextRow(printLines(screen, lines)));
  }

  const paused = showPrompt(
    printLines(screen, lines.slice(0, PAGE_ROWS)),
    PAUSE_MESSAGE,
  );

  return {
    ...startLine(state, paused),
    input: { type: "pause", remaining: lines.slice(PAGE_ROWS) },
  };
};

const continuePaging = (state: ShellState): ShellState =>
  state.input.type === "pause"
    ? showPage(state, nextRow(state.screen), state.input.remaining)
    : state;

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
    case "setDirectory":
      return toCommandPrompt(
        { ...state, disk: { ...state.disk, cwd: result.cwd } },
        screen,
      );
    case "page":
      return showPage(state, screen, result.lines);
    case "nest":
      return {
        ...toCommandPrompt(state, nextRow(printLines(screen, result.lines))),
        depth: state.depth + 1,
      };
    case "leave":
      return toCommandPrompt(
        { ...state, depth: Math.max(state.depth - 1, 0) },
        nextRow(screen),
      );
    case "launch":
      return {
        ...state,
        screen: result.running.screen,
        running: { programme: result.running, saved: screen },
      };
  }
};

const leaveProgramme = (
  state: ShellState,
  { saved }: ActiveProgramme,
  { disk }: Exited,
): ShellState =>
  toCommandPrompt(
    { ...state, running: undefined, disk: disk ?? state.disk },
    nextRow(saved),
  );

const stepRunning = (state: ShellState, event: ProgrammeEvent): ShellState => {
  const { running } = state;
  if (running === undefined) return state;

  const next = stepProgramme(running.programme, event);

  return next.type === "running"
    ? { ...state, screen: next.screen, running: { ...running, programme: next } }
    : leaveProgramme(state, running, next);
};

export const tickShell = (state: ShellState, now: number): ShellState =>
  stepRunning(state, { type: "tick", now });

export const tickInterval = ({ running }: ShellState): number | undefined =>
  running?.programme.tickMs;

const submit = (state: ShellState, now: number): ShellState => {
  const { screen, lineStart, line, history, input, clock, disk } = state;
  const end = cellAt(lineStart, line.length);
  const afterLine = nextRow(moveCursor(screen, end.row, end.column));
  const entries = addEntry(history, line);
  const context = { clock, now, disk, history: entries.entries, programmes: state.programmes };

  if (input.type === "pause") return state;
  if (input.type !== "command") {
    return applyResult(state, afterLine, answerPrompt(input.type, line, context));
  }
  if (line.trim() === "") return toCommandPrompt(state, afterLine);

  return applyResult(
    { ...state, history: entries },
    afterLine,
    runCommand(line, context),
  );
};

export const createShell = (
  screen: Screen,
  clock: Clock,
  disk: Disk = createDisk(),
  programmes: Registry = PROGRAMMES,
): ShellState => ({
  screen,
  lineStart: { row: screen.cursor.row, column: screen.cursor.column },
  line: "",
  cursor: 0,
  overstrike: false,
  history: createHistory(),
  input: { type: "command" },
  clock,
  disk,
  programmes,
  depth: 0,
  running: undefined,
});

export const reduceShell = (
  state: ShellState,
  { key, now }: ShellAction,
): ShellState => {
  const { line, cursor, history } = state;

  if (state.running) return stepRunning(state, { type: "key", key, now });
  if (state.input.type === "pause") return continuePaging(state);

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
