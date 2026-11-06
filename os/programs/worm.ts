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
import { formatRecord, HI_PATH, parseRecord } from "./wormHighScore";
import { appendEntry, type Ending, LOG_PATH } from "./wormLog";
import { drawGame } from "./wormScreen";

// One move per tick in every direction, as text-mode games of the period
// did: a vertical move covers more of the screen than a horizontal one.
export const MOVE_MS = 120;

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
// a session is being played; `disk` gains the log entries and records of
// ended sessions. `record` is the best score before the current game began,
// and `canWrite` is false when WORM.HI holds something the game cannot read.
type WormState = {
  readonly game: GameState;
  readonly disk: Disk;
  readonly launchDisk: Disk;
  readonly files: ProgrammeFiles;
  readonly startedAt: number | undefined;
  readonly record: number;
  readonly canWrite: boolean;
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

type StoredRecord =
  | { readonly kind: "missing" }
  | { readonly kind: "usable"; readonly score: number }
  | { readonly kind: "unusable" };

const storedRecord = (disk: Disk): StoredRecord => {
  const read = readFile(disk.filesystem, disk.cwd, HI_PATH);

  if (!read.ok) return read.error === "FileNotFound" ? { kind: "missing" } : { kind: "unusable" };
  if (read.value.kind !== "text") return { kind: "unusable" };

  const score = parseRecord(read.value.text);
  return score === undefined ? { kind: "unusable" } : { kind: "usable", score };
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

// Writes a record the session set. A file the game cannot read is never
// overwritten, and a failed write leaves the disk as it was.
const saveRecord = (state: WormState, disk: Disk, game: GameState, now: number): Disk => {
  if (!state.canWrite || game.score <= state.record) return disk;

  const written = state.files.write(disk, HI_PATH, formatRecord(game.score), now);
  return written.ok ? written.value : disk;
};

// The log entry and the record are written one after the other, so either
// can fail without affecting the other.
const endSession = (state: WormState, game: GameState, ending: Ending, now: number): Disk =>
  saveRecord(state, logSession(state, game, ending, now), game, now);

const leave = (state: WormState, now: number): Exited => {
  const disk = state.game.phase === "playing" ? endSession(state, state.game, "operator", now) : state.disk;
  return disk === state.launchDisk ? { type: "exit" } : { type: "exit", disk };
};

const nextState = (state: WormState, event: ProgrammeEvent): WormState => {
  const game = nextGame(state.game, event);
  if (game === state.game) return state;

  if (game.phase === "playing" && state.game.phase === "ready") return { ...state, game, startedAt: event.now };
  if (game.phase === "over" && state.game.phase === "playing") {
    return { ...state, game, disk: endSession(state, game, ENDINGS[game.reason], event.now), startedAt: undefined };
  }
  if (game.phase === "ready") {
    return { ...state, game, startedAt: undefined, record: Math.max(state.record, state.game.score) };
  }

  return { ...state, game };
};

// An event that changes nothing returns this same value, so nothing is
// redrawn and key repeat costs nothing.
const running = (state: WormState): Running => {
  const current: Running = {
    type: "running",
    screen: drawGame(state.game, state.record),
    tickMs: state.game.phase === "playing" ? MOVE_MS : undefined,
    step: (event) => {
      if (event.type === "key" && event.key.type === "escape") return leave(state, event.now);

      const next = nextState(state, event);
      return next === state ? current : running(next);
    },
  };

  return current;
};

export const WORM = {
  kind: "fullscreen",
  start: (_args, { now, disk, files }) => {
    const stored = storedRecord(disk);

    return running({
      game: createGame(now),
      disk,
      launchDisk: disk,
      files,
      startedAt: undefined,
      record: stored.kind === "usable" ? stored.score : 0,
      canWrite: stored.kind !== "unusable",
    });
  },
} satisfies FullscreenProgramme;
