import {
  clearScreen,
  COLUMNS,
  moveCursor,
  ROWS,
  type Screen,
  scrollUp,
  writeText,
} from "../terminal/screen";
import { type Environment } from "../environment/environment";
import { createDisk, type Disk } from "../fs/disk";
import { readFile } from "../fs/operations";
import { PROGRAMMES } from "../programs/registry";
import { stepProgramme } from "../programs/step";
import type { Exited, ProgrammeEvent, Registry, Running } from "../programs/types";
import {
  type BatchFrame,
  batchLines,
  batchParams,
  classifyLine,
  expandLine,
  isQuiet,
  type Pace,
} from "./batch";
import { type Clock, readClock } from "./clock";
import {
  type Answer,
  answerPrompt,
  type CommandContext,
  type CommandResult,
  PAUSE_MESSAGE,
  PROMPT_TEXT,
  type PromptInput,
  type QuestionRead,
} from "./commands";
import { PAGE_ROWS, runRedirected } from "./redirect";
import {
  addEntry,
  createHistory,
  type History,
  recallNewest,
  recallNext,
  recallOldest,
  recallPrevious,
} from "./history";
import { STOCK_ENVIRONMENT } from "./environmentCommands";
import { formatPrompt } from "./prompt";
import { layoutRows } from "./text";
import type { ShellKey } from "./shellKeys";

const MAX_LINE_LENGTH = 127;

type Position = {
  readonly row: number;
  readonly column: number;
};

export const END_OF_FILE = "\x1A";

// The end-of-file character is one character of the line, shown as `^Z`.
const shown = (text: string) => text.replaceAll(END_OF_FILE, "^Z");


type InputMode =
  | { readonly type: "command" }
  | { readonly type: PromptInput }
  | { readonly type: "pause"; readonly remaining: readonly string[] }
  // Between the lines of a batch file, when no key is read.
  | { readonly type: "batch" }
  // Asking whether to end the batch, then going back to `previous`.
  | { readonly type: "terminate"; readonly previous: InputMode }
  | {
      readonly type: "question";
      readonly read: QuestionRead;
      readonly answer: Answer;
      // The finished lines of a file being typed, each ending in CR and LF.
      readonly text: string;
    };

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
  // ECHO's setting. While it is off, the command prompt is not shown.
  readonly echo: boolean;
  // This interpreter's environment, and those of the interpreters that
  // started it, the nearest last.
  readonly environment: Environment;
  readonly outer: readonly Environment[];
  // The time of the latest key or tick, which the prompt's `$T` and `$D` read.
  readonly now: number;
  // The batch file this interpreter is running, and those of the interpreters
  // that started it, parallel to `outer`.
  readonly batch: BatchFrame | undefined;
  readonly outerBatches: readonly (BatchFrame | undefined)[];
  // Whether DOSKEY has been run since the computer started.
  readonly doskeyLoaded: boolean;
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
  const text = shown(line);
  const overflow = Math.max(
    cellAt(state.lineStart, text.length).row - (ROWS - 1),
    0,
  );
  const lineStart = { ...state.lineStart, row: state.lineStart.row - overflow };
  const screen = writeWrapped(
    overflow > 0 ? scrollUp(state.screen, overflow) : state.screen,
    lineStart,
    text.padEnd(shown(state.line).length),
  );
  const { row, column } = cellAt(lineStart, shown(line.slice(0, cursor)).length);

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

// The command prompt is printed like output, so it can take several rows,
// wrap and scroll. The cursor stays after its last character.
const showCommandPrompt = (screen: Screen, prompt: string): Screen => {
  const rows = prompt.split("\n").flatMap((part) => layoutRows(part));
  const last = rows.at(-1) ?? "";
  const printed = rows.slice(0, -1).reduce(printRow, screen);

  if (last.length >= COLUMNS) return printRow(printed, last);

  const { row } = printed.cursor;
  return moveCursor(writeText(printed, row, 0, last), row, last.length);
};

const promptOf = ({ echo, environment, disk, clock, now }: ShellState) =>
  echo ? formatPrompt(environment, disk.cwd, readClock(clock, now)) : "";

const startLine = (state: ShellState, screen: Screen): ShellState => ({
  ...state,
  screen,
  lineStart: screen.cursor,
  line: "",
  cursor: 0,
  overstrike: false,
});

// At the prompt a command is followed by a blank row. A batch file shows no
// prompt between its lines, so it has no blank row either.
const closing = ({ batch }: ShellState, screen: Screen): Screen =>
  batch === undefined ? nextRow(screen) : screen;

const freshRow = (screen: Screen): Screen =>
  screen.cursor.column > 0 ? nextRow(screen) : screen;

const toCommandPrompt = (state: ShellState, screen: Screen): ShellState =>
  state.batch === undefined
    ? {
        ...startLine(state, showCommandPrompt(screen, promptOf(state))),
        input: { type: "command" },
      }
    : { ...startLine(state, screen), input: { type: "batch" } };

const showPage = (
  state: ShellState,
  screen: Screen,
  lines: readonly string[],
): ShellState => {
  if (lines.length <= PAGE_ROWS) {
    return toCommandPrompt(state, closing(state, printLines(screen, lines)));
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

export const applyResult = (
  state: ShellState,
  screen: Screen,
  result: CommandResult,
): ShellState => {
  switch (result.type) {
    case "print":
      return toCommandPrompt(state, closing(state, printLines(screen, result.lines)));
    case "installDoskey":
      return toCommandPrompt(
        { ...state, doskeyLoaded: true },
        closing(state, printLines(screen, result.lines)),
      );
    case "batch":
      return startBatch(state, screen, result);
    case "clear":
      return toCommandPrompt(state, closing(state, clearScreen(screen)));
    case "ask":
      return {
        ...startLine(
          state,
          showPrompt(printLines(screen, result.lines), PROMPT_TEXT[result.input]),
        ),
        input: { type: result.input },
      };
    case "setEcho":
      return toCommandPrompt({ ...state, echo: result.echo }, closing(state, screen));
    case "setClock":
      return toCommandPrompt({ ...state, clock: result.clock }, closing(state, screen));
    case "setEnvironment":
      return toCommandPrompt(
        { ...state, environment: result.environment },
        closing(state, screen),
      );
    case "setDirectory":
      return toCommandPrompt(
        { ...state, disk: { ...state.disk, cwd: result.cwd } },
        screen,
      );
    case "page":
      return showPage(state, screen, result.lines);
    case "withDisk":
      return applyResult({ ...state, disk: result.disk }, screen, result.result);
    case "files":
      return toCommandPrompt(
        { ...state, disk: result.disk },
        closing(state, printLines(screen, result.lines)),
      );
    case "question":
      return {
        ...startLine(state, showPrompt(printLines(screen, result.lines), result.prompt)),
        input: { type: "question", read: result.read, answer: result.answer, text: "" },
      };
    case "nest":
      return {
        ...toCommandPrompt(
          {
            ...state,
            outer: [...state.outer, state.environment],
            outerBatches: [...state.outerBatches, state.batch],
            batch: undefined,
          },
          nextRow(printLines(screen, result.lines)),
        ),
        depth: state.depth + 1,
      };
    case "leave": {
      const left = state.outer.length > 0;
      const restored = left ? state.outerBatches.at(-1) : state.batch;

      return toCommandPrompt(
        {
          ...state,
          depth: Math.max(state.depth - 1, 0),
          environment: state.outer.at(-1) ?? state.environment,
          outer: state.outer.slice(0, -1),
          batch: restored,
          outerBatches: state.outerBatches.slice(0, -1),
        },
        closing({ ...state, batch: restored }, screen),
      );
    }
    case "launch":
      return {
        ...state,
        screen: result.running.screen,
        running: { programme: result.running, saved: screen },
      };
  }
};

const BREAK_ECHO = "^C";
const TERMINATE_QUESTION = "Terminate batch job (Y/N)?";
const STEP_LIMIT = 10_000;

// The first line at or after the frame's position that is not a label.
const lineAt = ({ lines, next }: BatchFrame) => {
  for (let index = next; index < lines.length; index += 1) {
    const line = classifyLine(lines[index]);
    if (line.type === "line") return { index, quiet: line.quiet, text: line.text };
  }

  return undefined;
};

// A batch put the ECHO setting back when it ends, and shows the prompt.
const endBatch = (state: ShellState): ShellState =>
  state.batch === undefined
    ? state
    : toCommandPrompt(
        { ...state, batch: undefined, echo: state.batch.echoWas },
        freshRow(state.screen),
      );

const startBatch = (
  state: ShellState,
  screen: Screen,
  { name, text, tail }: { readonly name: string; readonly text: string; readonly tail: string },
): ShellState => {
  const frame: BatchFrame = {
    lines: batchLines(text),
    next: 0,
    params: batchParams(name, tail),
    // A batch run from a batch replaces it and keeps its saved setting.
    echoWas: state.batch?.echoWas ?? state.echo,
    echoes: true,
    leadingBlank: false,
    pace: undefined,
    pending: undefined,
  };

  return { ...startLine({ ...state, batch: frame }, screen), input: { type: "batch" } };
};

const echoRows = (screen: Screen, text: string): Screen =>
  text.split("\n").flatMap((part) => layoutRows(part)).reduce(printRow, screen);

// Runs the next line of the batch, or shows the output of one already run.
const stepBatch = (state: ShellState, now: number): ShellState => {
  const { batch: frame } = state;
  if (frame === undefined || state.input.type !== "batch" || state.running) return state;

  if (frame.pending !== undefined) {
    return applyResult(
      { ...state, batch: { ...frame, pending: undefined } },
      freshRow(state.screen),
      frame.pending,
    );
  }

  const found = lineAt(frame);
  if (found === undefined) return endBatch(state);

  const after: BatchFrame = { ...frame, next: found.index + 1, leadingBlank: false };
  const line = expandLine(found.text, frame.params, state.environment);
  const start = frame.leadingBlank ? nextRow(freshRow(state.screen)) : freshRow(state.screen);
  const screen =
    state.echo && frame.echoes && !found.quiet
      ? echoRows(start, promptOf(state) + line)
      : start;
  const running = { ...state, batch: after };
  const result: CommandResult =
    line.trim() === "" ? { type: "print", lines: [] } : runRedirected(line, contextOf(running, now, state.history));

  if (frame.pace === undefined || isQuiet(result)) return applyResult(running, screen, result);

  return {
    ...startLine(running, screen),
    input: { type: "batch" },
    batch: { ...after, pending: result },
  };
};

// How long to wait before the next step of a batch, or `undefined` when none
// is due.
export const batchDelay = ({ batch, input, running }: ShellState): number | undefined => {
  if (batch === undefined || input.type !== "batch" || running) return undefined;
  if (batch.pace === undefined) return 0;
  if (batch.pending !== undefined) return batch.pace.outputMs;
  if (lineAt(batch) === undefined) return batch.pace.endMs;

  return batch.next === 0 ? batch.pace.firstMs : batch.pace.lineMs;
};

// Runs a batch to its end, or to where it waits for the visitor, without
// pausing between steps.
const runThrough = (state: ShellState, now: number): ShellState => {
  let current: ShellState =
    state.batch === undefined ? state : { ...state, batch: { ...state.batch, pace: undefined } };

  for (let steps = 0; steps < STEP_LIMIT && current.batch !== undefined; steps += 1) {
    if (current.input.type !== "batch") break;
    current = stepBatch(current, now);
  }

  return current;
};

export const STARTUP_PACE: Pace = { firstMs: 1800, lineMs: 500, outputMs: 300, endMs: 900 };
const AUTOEXEC_PATH = "C:\\AUTOEXEC.BAT";

// Runs `AUTOEXEC.BAT` as the computer starts, from the default prompt. Without
// the file, as MS-DOS does, the date and time are asked for.
export const startup = (state: ShellState, now: number, instant: boolean): ShellState => {
  const file = readFile(state.disk.filesystem, "C:\\", AUTOEXEC_PATH);
  const found = file.ok && file.value.kind === "text" ? file.value.text : undefined;
  const frame: BatchFrame = {
    lines: found === undefined ? ["DATE", "TIME"] : batchLines(found),
    next: 0,
    params: batchParams("AUTOEXEC", ""),
    echoWas: state.echo,
    echoes: found !== undefined,
    leadingBlank: true,
    pace: found === undefined ? undefined : STARTUP_PACE,
    pending: undefined,
  };
  const started: ShellState = {
    ...state,
    now,
    batch: frame,
    input: { type: "batch" },
  };

  return instant ? runThrough(started, now) : started;
};

// Whether Ctrl+C is the break key now: a batch is running and the visitor is
// not typing a line.
export const acceptsBreak = ({ batch, input, running }: ShellState): boolean =>
  batch !== undefined &&
  running === undefined &&
  (input.type === "batch" ||
    input.type === "pause" ||
    (input.type === "question" && input.read === "key"));

const askTerminate = (state: ShellState): ShellState => {
  const { row, column } = state.screen.cursor;
  const marked = nextRow(writeText(state.screen, row, column, BREAK_ECHO));

  return {
    ...startLine(state, showPrompt(marked, TERMINATE_QUESTION)),
    input: { type: "terminate", previous: state.input },
  };
};

const answerTerminate = (state: ShellState, char: string): ShellState => {
  if (state.input.type !== "terminate") return state;

  const answer = char.toUpperCase();
  if (answer !== "Y" && answer !== "N") return state;

  const { row, column } = state.screen.cursor;
  const answered = nextRow(writeText(state.screen, row, column, answer));

  return answer === "Y"
    ? endBatch({ ...state, screen: answered })
    : { ...state, screen: answered, input: state.input.previous };
};

const leaveProgramme = (
  state: ShellState,
  { saved }: ActiveProgramme,
  { disk }: Exited,
): ShellState =>
  toCommandPrompt(
    { ...state, running: undefined, disk: disk ?? state.disk },
    closing(state, saved),
  );

const stepRunning = (state: ShellState, event: ProgrammeEvent): ShellState => {
  const { running } = state;
  if (running === undefined) return state;

  const next = stepProgramme(running.programme, event);

  return next.type === "running"
    ? { ...state, screen: next.screen, running: { ...running, programme: next } }
    : leaveProgramme(state, running, next);
};

// Records the time for the prompt, and gives back the same state when the
// step changed nothing.
const atTime = (
  previous: ShellState,
  now: number,
  step: (state: ShellState) => ShellState,
): ShellState => {
  const state = { ...previous, now };
  const next = step(state);

  return next === state ? previous : next;
};

export const tickShell = (state: ShellState, now: number): ShellState =>
  atTime(state, now, (timed) =>
    timed.running ? stepRunning(timed, { type: "tick", now }) : stepBatch(timed, now),
  );

export const acceptsEndOfFile = ({ input, running }: ShellState): boolean =>
  running === undefined && input.type === "question" && input.read === "file";

// Whether F10 goes to a fullscreen programme rather than the browser.
export const acceptsF10 = ({ running }: ShellState): boolean => running !== undefined;

export const tickInterval = ({ running }: ShellState): number | undefined =>
  running?.programme.tickMs;

const contextOf = (state: ShellState, now: number, history: History): CommandContext => ({
  clock: state.clock,
  now,
  disk: state.disk,
  history: history.entries,
  programmes: state.programmes,
  echo: state.echo,
  environment: state.environment,
  doskeyLoaded: state.doskeyLoaded,
});

const submit = (state: ShellState, now: number): ShellState => {
  const { screen, lineStart, line, history, input } = state;
  const end = cellAt(lineStart, shown(line).length);
  const afterLine = nextRow(moveCursor(screen, end.row, end.column));
  const entries = addEntry(history, line);
  const context = contextOf(state, now, entries);

  if (input.type === "pause" || input.type === "batch" || input.type === "terminate") return state;
  if (input.type === "question") {
    const end = line.indexOf(END_OF_FILE);

    if (input.read === "file" && end === -1) {
      return { ...startLine(state, afterLine), input: { ...input, text: `${input.text}${line}\r\n` } };
    }
    const text = input.read === "file" ? input.text + line.slice(0, end) : line;
    return applyResult(state, afterLine, input.answer(text, context));
  }
  if (input.type !== "command") {
    return applyResult(state, afterLine, answerPrompt(input.type, line, context));
  }
  if (line.trim() === "") return toCommandPrompt(state, afterLine);

  return applyResult(
    { ...state, history: entries },
    afterLine,
    runRedirected(line, context),
  );
};

export const createShell = (
  screen: Screen,
  clock: Clock,
  disk: Disk = createDisk(),
  programmes: Registry = PROGRAMMES,
  environment: Environment = STOCK_ENVIRONMENT,
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
  echo: true,
  environment,
  outer: [],
  now: 0,
  batch: undefined,
  outerBatches: [],
  doskeyLoaded: false,
});

export const reduceShell = (
  previous: ShellState,
  action: ShellAction,
): ShellState => atTime(previous, action.now, (state) => reduceKey(state, action));

const reduceKey = (state: ShellState, { key, now }: ShellAction): ShellState => {
  const { line, cursor, history } = state;

  if (state.running) return stepRunning(state, { type: "key", key, now });
  if (key.type === "break") return acceptsBreak(state) ? askTerminate(state) : state;
  if (state.input.type === "terminate") {
    return key.type === "char" ? answerTerminate(state, key.char) : state;
  }
  if (state.input.type === "batch") {
    // Esc during the startup runs the rest of `AUTOEXEC.BAT` at once.
    return key.type === "escape" && state.batch?.pace !== undefined
      ? runThrough(state, now)
      : state;
  }
  if (state.input.type === "pause") return continuePaging(state);
  if (state.input.type === "question" && state.input.read === "key") {
    return applyResult(state, state.screen, state.input.answer("", contextOf(state, now, history)));
  }

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
    case "tab":
    case "f10":
      return state;
  }
};
