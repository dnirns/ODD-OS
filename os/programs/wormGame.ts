// The rules of WORM.EXE. Pure: no screen, keys or clock.

import { nextRandom } from "./random";

export const WIDTH = 78;
export const HEIGHT = 21;
export const POINTS = 10;

export type Direction = "up" | "down" | "left" | "right";

export type Cell = {
  readonly x: number;
  readonly y: number;
};

export type Board = {
  readonly worm: readonly Cell[];
  readonly heading: Direction;
  readonly turn: Direction;
  readonly food: Cell | undefined;
  readonly score: number;
  readonly seed: number;
};

export type Ready = Board & { readonly phase: "ready" };
export type Playing = Board & { readonly phase: "playing" };
export type Over = Board & {
  readonly phase: "over";
  readonly reason: "wall" | "self" | "full";
};

export type GameState = Ready | Playing | Over;

const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const STEP: Readonly<Record<Direction, Cell>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPENING_WORM: readonly Cell[] = [
  { x: 39, y: 10 },
  { x: 38, y: 10 },
  { x: 37, y: 10 },
];

export const OPENING_LENGTH = OPENING_WORM.length;

const sameCell = (a: Cell) => (b: Cell) => a.x === b.x && a.y === b.y;

const cellIndex = ({ x, y }: Cell) => y * WIDTH + x;

const isOutside = ({ x, y }: Cell) => x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT;

// Picks one free cell uniformly, counting free cells in reading order.
export const placeFood = (
  worm: readonly Cell[],
  seed: number,
): { readonly food: Cell | undefined; readonly seed: number } => {
  const taken = new Set(worm.map(cellIndex));
  const free = WIDTH * HEIGHT - taken.size;

  if (free === 0) return { food: undefined, seed };

  const random = nextRandom(seed);
  let remaining = Math.floor(random.value * free);

  for (let index = 0; index < WIDTH * HEIGHT; index += 1) {
    if (taken.has(index)) continue;
    if (remaining === 0) return { food: { x: index % WIDTH, y: Math.floor(index / WIDTH) }, seed: random.seed };
    remaining -= 1;
  }

  return { food: undefined, seed: random.seed };
};

export const createGame = (seed: number): Ready => {
  const placed = placeFood(OPENING_WORM, seed >>> 0);

  return {
    phase: "ready",
    worm: OPENING_WORM,
    heading: "right",
    turn: "right",
    food: placed.food,
    score: 0,
    seed: placed.seed,
  };
};

export const steer = (game: GameState, direction: Direction): GameState => {
  if (game.phase === "over") return game;
  if (direction === OPPOSITE[game.heading]) return game;
  if (game.phase === "ready") return { ...game, phase: "playing", turn: direction };

  return direction === game.turn ? game : { ...game, turn: direction };
};

export const advance = (game: GameState): GameState => {
  if (game.phase !== "playing") return game;

  const [head] = game.worm;
  const next = { x: head.x + STEP[game.turn].x, y: head.y + STEP[game.turn].y };
  const eats = game.food !== undefined && sameCell(game.food)(next);
  const body = eats ? game.worm : game.worm.slice(0, -1);

  if (isOutside(next)) return { ...game, phase: "over", reason: "wall" };
  if (body.some(sameCell(next))) return { ...game, phase: "over", reason: "self" };

  const worm = [next, ...body];

  if (!eats) return { ...game, worm, heading: game.turn };

  const placed = placeFood(worm, game.seed);
  const fed = {
    ...game,
    worm,
    heading: game.turn,
    food: placed.food,
    score: game.score + POINTS,
    seed: placed.seed,
  };

  return placed.food === undefined
    ? { ...fed, phase: "over", reason: "full" }
    : fed;
};

export const restart = (game: GameState): GameState =>
  game.phase === "over" ? createGame(game.seed) : game;
