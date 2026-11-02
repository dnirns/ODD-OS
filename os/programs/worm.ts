import type { FullscreenProgramme, ProgrammeEvent, ProgrammeKey, Running } from "./types";
import { advance, createGame, type Direction, type GameState, restart, steer } from "./wormGame";
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

// An event that changes nothing returns this same value, so nothing is
// redrawn and key repeat costs nothing.
const running = (game: GameState): Running => {
  const current: Running = {
    type: "running",
    screen: drawGame(game),
    tickMs: game.phase === "playing" ? tickFor(game) : undefined,
    step: (event) => {
      if (event.type === "key" && event.key.type === "escape") return { type: "exit" };

      const next = nextGame(game, event);
      return next === game ? current : running(next);
    },
  };

  return current;
};

export const WORM: FullscreenProgramme = {
  kind: "fullscreen",
  start: (_args, { now }) => running(createGame(now)),
};
