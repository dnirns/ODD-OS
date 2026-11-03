import type { Disk } from "../fs/disk";
import { readFile } from "../fs/operations";
import type {
  Exited,
  FullscreenProgramme,
  ProgrammeEvent,
  ProgrammeFiles,
  ProgrammeKey,
  Running,
} from "./types";
import {
  advance,
  createGame,
  type Direction,
  type GameState,
  OPENING_LENGTH,
  type Over,
  restart,
  steer,
} from "./wormGame";
import { appendEntry, type Ending, LOG_PATH } from "./wormLog";
import { drawGame } from "./wormScreen";

// A cell is 9 pixels wide and 16 tall, so a vertical move takes 16/9 as long
// to cover the same distance on screen as a horizontal one.
export const HORIZONTAL_TICK_MS = 120;
export const VERTICAL_TICK_MS = Math.round((HORIZONTAL_TICK_MS * 16) / 9);

// Timed by the last move made, so the interval only changes on a tick and a
// key press never restarts the timer.
const tickFor = ({ heading }: GameState) =>
  heading === "up" || heading === "down" ? VERTICAL_TICK_MS : HORIZONTAL_TICK_MS;

const DIRECTIONS: Partial<Readonly<Record<ProgrammeKey["type"], Direction>>> = {
  up: "up",
  down: "down",
  left: "left",
  right: "right",
};

const nextGame = (game: GameState, event: ProgrammeEvent): GameState => {
  if (event.type === "tick") return advance(game);
  if (event.key.type === "enter") return restart(game);

  const direction = DIRECTIONS[event.key.type];
  return direction === undefined ? game : steer(game, direction);
};

// Everything the programme carries between events. `startedAt` is set while
// a session is being played; `disk` gains the log entries of ended sessions.
type WormState = {
  readonly game: GameState;
  readonly disk: Disk;
  readonly launchDisk: Disk;
  readonly files: ProgrammeFiles;
  readonly startedAt: number | undefined;
};

const ENDINGS: Readonly<Record<Over["reason"], Ending>> = {
  wall: "wall",
  self: "self",
  full: "full",
};

const existingLog = (disk: Disk): { readonly ok: true; readonly text: string | undefined } | { readonly ok: false } => {
  const read = readFile(disk.filesystem, disk.cwd, LOG_PATH);

  if (read.ok) return read.value.kind === "text" ? { ok: true, text: read.value.text } : { ok: false };
  return read.error === "FileNotFound" ? { ok: true, text: undefined } : { ok: false };
};

// Appends one entry for the session that just ended. Any problem with the
// file leaves the disk as it was; the game carries on regardless.
const logSession = (state: WormState, game: GameState, ending: Ending, now: number): Disk => {
  const existing = existingLog(state.disk);
  if (!existing.ok) return state.disk;

  const written = state.files.write(
    state.disk,
    LOG_PATH,
    appendEntry(existing.text, {
      ending,
      score: game.score,
      length: game.worm.length,
      food: game.worm.length - OPENING_LENGTH,
      seconds: (now - (state.startedAt ?? now)) / 1000,
    }),
    now,
  );

  return written.ok ? written.value : state.disk;
};

const leave = (state: WormState, now: number): Exited => {
  const disk = state.game.phase === "playing" ? logSession(state, state.game, "operator", now) : state.disk;
  return disk === state.launchDisk ? { type: "exit" } : { type: "exit", disk };
};

const nextState = (state: WormState, event: ProgrammeEvent): WormState => {
  const game = nextGame(state.game, event);
  if (game === state.game) return state;

  if (game.phase === "playing" && state.game.phase === "ready") return { ...state, game, startedAt: event.now };
  if (game.phase === "over" && state.game.phase === "playing") {
    return { ...state, game, disk: logSession(state, game, ENDINGS[game.reason], event.now), startedAt: undefined };
  }
  if (game.phase === "ready") return { ...state, game, startedAt: undefined };

  return { ...state, game };
};

// An event that changes nothing returns this same value, so nothing is
// redrawn and key repeat costs nothing.
const running = (state: WormState): Running => {
  const current: Running = {
    type: "running",
    screen: drawGame(state.game),
    tickMs: state.game.phase === "playing" ? tickFor(state.game) : undefined,
    step: (event) => {
      if (event.type === "key" && event.key.type === "escape") return leave(state, event.now);

      const next = nextState(state, event);
      return next === state ? current : running(next);
    },
  };

  return current;
};

export const WORM: FullscreenProgramme = {
  kind: "fullscreen",
  start: (_args, { now, disk, files }) =>
    running({ game: createGame(now), disk, launchDisk: disk, files, startedAt: undefined }),
};
