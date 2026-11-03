import { describe, expect, test } from "vitest";

import {
  advance,
  type Cell,
  createGame,
  type Direction,
  type GameState,
  HEIGHT,
  nextRandom,
  placeFood,
  type Playing,
  POINTS,
  restart,
  steer,
  WIDTH,
} from "./wormGame";

const FAR_AWAY: Cell = { x: 0, y: HEIGHT - 1 };

const playing = (
  worm: readonly Cell[],
  heading: Direction,
  food: Cell | undefined = FAR_AWAY,
): Playing => ({ phase: "playing", worm, heading, turn: heading, food, score: 0, seed: 1 });

const isInside = ({ x, y }: Cell) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;

const isOn = (cells: readonly Cell[], cell: Cell | undefined) =>
  cell !== undefined && cells.some(({ x, y }) => x === cell.x && y === cell.y);

const times = (game: GameState, count: number): GameState =>
  Array.from({ length: count }).reduce<GameState>((state) => advance(state), game);

const started = (seed = 1) => steer(createGame(seed), "right");

describe("Ready state", () => {
  test("Opening position", () => {
    const game = createGame(1);

    expect(game.phase).toBe("ready");
    expect(game.worm).toEqual([
      { x: 39, y: 10 },
      { x: 38, y: 10 },
      { x: 37, y: 10 },
    ]);
    expect(game.heading).toBe("right");
    expect(game.score).toBe(0);
    expect(game.food).toBeDefined();
    expect(isInside(game.food as Cell)).toBe(true);
    expect(isOn(game.worm, game.food)).toBe(false);
  });

  test("the opening worm is in the middle of the playfield", () => {
    const [head] = createGame(1).worm;

    expect(head.y).toBe(Math.floor(HEIGHT / 2));
    expect(Math.abs(head.x - WIDTH / 2)).toBeLessThanOrEqual(1);
  });

  test("Waiting", () => {
    const game = createGame(1);

    expect(advance(game)).toBe(game);
  });

  test("Starting", () => {
    const game = steer(createGame(1), "up");

    expect(game).toMatchObject({ phase: "playing", turn: "up", heading: "right" });
    expect(advance(game).worm[0]).toEqual({ x: 39, y: 9 });
  });

  test("Starting straight on", () => {
    const game = steer(createGame(1), "right");

    expect(game).toMatchObject({ phase: "playing", turn: "right" });
    expect(advance(game).worm[0]).toEqual({ x: 40, y: 10 });
  });

  test("Starting down", () => {
    expect(steer(createGame(1), "down")).toMatchObject({ phase: "playing", turn: "down" });
  });

  test("Left does not start", () => {
    const game = createGame(1);

    expect(steer(game, "left")).toBe(game);
  });
});

describe("Random numbers and food placement", () => {
  test("values are between 0 and 1 and the seed moves on", () => {
    let seed = 0;

    for (let count = 0; count < 1_000; count += 1) {
      const random = nextRandom(seed);

      expect(random.value).toBeGreaterThanOrEqual(0);
      expect(random.value).toBeLessThan(1);
      expect(random.seed).not.toBe(seed);
      seed = random.seed;
    }
  });

  test("Same start, same game", () => {
    const play = (seed: number) => times(steer(createGame(seed), "up"), 3);

    expect(createGame(42)).toEqual(createGame(42));
    expect(play(42)).toEqual(play(42));
  });

  test("different seeds give different food", () => {
    const foods = new Set(
      Array.from({ length: 50 }, (_, seed) => JSON.stringify(createGame(seed).food)),
    );

    expect(foods.size).toBeGreaterThan(40);
  });

  test("any launch time gives a valid game", () => {
    [0, -1, 1.5, 1_793_638_327_123, Number.MAX_SAFE_INTEGER].forEach((now) => {
      const game = createGame(now);

      expect(Number.isInteger(game.seed)).toBe(true);
      expect(isInside(game.food as Cell)).toBe(true);
    });
  });

  test("New food is free: inside the playfield and never on the worm", () => {
    const long = Array.from({ length: 400 }, (_, index) => ({
      x: index % WIDTH,
      y: Math.floor(index / WIDTH),
    }));

    [createGame(0).worm, long].forEach((worm) => {
      for (let seed = 0; seed < 500; seed += 1) {
        const { food } = placeFood(worm, seed);

        expect(food).toBeDefined();
        expect(isInside(food as Cell)).toBe(true);
        expect(isOn(worm, food)).toBe(false);
      }
    });
  });

  test("the only free cell is the one chosen", () => {
    const worm = Array.from({ length: WIDTH * HEIGHT }, (_, index) => ({
      x: index % WIDTH,
      y: Math.floor(index / WIDTH),
    })).filter(({ x, y }) => !(x === 70 && y === 15));

    for (let seed = 0; seed < 20; seed += 1) {
      expect(placeFood(worm, seed).food).toEqual({ x: 70, y: 15 });
    }
  });

  test("a full field has no food", () => {
    const worm = Array.from({ length: WIDTH * HEIGHT }, (_, index) => ({
      x: index % WIDTH,
      y: Math.floor(index / WIDTH),
    }));

    expect(placeFood(worm, 5)).toEqual({ food: undefined, seed: 5 });
  });
});

describe("Steering", () => {
  const right = playing([{ x: 10, y: 5 }, { x: 9, y: 5 }, { x: 8, y: 5 }], "right");

  test("Turning", () => {
    const game = steer(right, "up");

    expect(game).toMatchObject({ turn: "up", heading: "right" });
    expect(advance(game).worm[0]).toEqual({ x: 10, y: 4 });
  });

  test("Reversing is ignored", () => {
    expect(steer(right, "left")).toBe(right);
    expect(advance(steer(right, "left")).worm[0]).toEqual({ x: 11, y: 5 });
  });

  test("Two quick keys cannot reverse the worm", () => {
    const game = steer(steer(right, "up"), "left");

    expect(game.turn).toBe("up");
    expect(advance(game)).toMatchObject({ phase: "playing", worm: [{ x: 10, y: 4 }, { x: 10, y: 5 }, { x: 9, y: 5 }] });
  });

  test("Last allowed key wins", () => {
    const game = steer(steer(right, "up"), "down");

    expect(game.turn).toBe("down");
    expect(advance(game).worm[0]).toEqual({ x: 10, y: 6 });
  });

  test("Same direction", () => {
    expect(steer(right, "right")).toBe(right);
  });

  test("after a turn, the reversal is the new direction's opposite", () => {
    const up = advance(steer(right, "up"));

    expect(up.heading).toBe("up");
    expect(steer(up, "down")).toBe(up);
    expect(steer(up, "left").turn).toBe("left");
  });

  test("steering a finished game changes nothing", () => {
    const over: GameState = { ...right, phase: "over", reason: "wall" };

    (["up", "down", "left", "right"] as const).forEach((direction) => {
      expect(steer(over, direction)).toBe(over);
    });
  });
});

describe("Movement", () => {
  test("Moving by itself", () => {
    const game = times(started(), 3);

    expect(game.worm).toEqual([
      { x: 42, y: 10 },
      { x: 41, y: 10 },
      { x: 40, y: 10 },
    ]);
  });

  test("Whole worm follows", () => {
    const game = playing([{ x: 10, y: 5 }, { x: 10, y: 6 }, { x: 11, y: 6 }, { x: 12, y: 6 }], "up");

    expect(advance(steer(game, "left")).worm).toEqual([
      { x: 9, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 6 },
      { x: 11, y: 6 },
    ]);
  });

  test("Ticks while not playing", () => {
    const ready = createGame(3);
    const over: GameState = { ...ready, phase: "over", reason: "wall" };

    expect(advance(ready)).toBe(ready);
    expect(advance(over)).toBe(over);
  });
});

describe("Food, score and growth", () => {
  const hungry = playing([{ x: 10, y: 5 }, { x: 9, y: 5 }, { x: 8, y: 5 }], "right", { x: 11, y: 5 });

  test("Eating", () => {
    const game = advance(hungry);

    expect(game.phase).toBe("playing");
    expect(game.score).toBe(POINTS);
    expect(game.score).toBe(10);
    expect(game.worm).toEqual([
      { x: 11, y: 5 },
      { x: 10, y: 5 },
      { x: 9, y: 5 },
      { x: 8, y: 5 },
    ]);
    expect(game.food).not.toEqual({ x: 11, y: 5 });
    expect(isOn(game.worm, game.food)).toBe(false);
    expect(game.seed).not.toBe(hungry.seed);
  });

  test("Growth shows", () => {
    const after = times(advance(hungry), 2);

    expect(after.worm).toHaveLength(4);
    expect(after.score).toBe(10);
  });

  test("not eating keeps the score and the food", () => {
    const game = playing([{ x: 10, y: 5 }, { x: 9, y: 5 }, { x: 8, y: 5 }], "right", { x: 30, y: 5 });
    const next = advance(game);

    expect(next.score).toBe(0);
    expect(next.food).toEqual({ x: 30, y: 5 });
    expect(next.seed).toBe(game.seed);
  });

  test("One piece of food, never on the worm, across a long game", () => {
    let game: GameState = steer(createGame(9), "up");

    for (let move = 0; move < 2_000 && game.phase === "playing"; move += 1) {
      const [head] = game.worm;
      const food = game.food as Cell;
      const direction: Direction =
        food.x > head.x ? "right" : food.x < head.x ? "left" : food.y > head.y ? "down" : "up";

      game = advance(steer(game, direction));
      expect(isOn(game.worm, game.food)).toBe(false);
      expect(game.score).toBe((game.worm.length - 3) * POINTS);
    }

    expect(game.score).toBeGreaterThan(0);
  });
});

describe("Collisions", () => {
  test.each<[string, Cell, Direction]>([
    ["right", { x: WIDTH - 1, y: 5 }, "right"],
    ["left", { x: 0, y: 5 }, "left"],
    ["top", { x: 20, y: 0 }, "up"],
    ["bottom", { x: 20, y: HEIGHT - 1 }, "down"],
  ])("Wall: the %s edge", (_, head, direction) => {
    const behind = { x: head.x - (direction === "right" ? 1 : direction === "left" ? -1 : 0), y: head.y - (direction === "down" ? 1 : direction === "up" ? -1 : 0) };
    const game = playing([head, behind], direction);
    const over = advance(game);

    expect(over).toMatchObject({ phase: "over", reason: "wall" });
    expect(over.worm).toEqual(game.worm);
    expect(over.score).toBe(0);
  });

  test("Itself", () => {
    const game = playing(
      [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }],
      "left",
    );
    const over = advance(steer(game, "down"));

    expect(over).toMatchObject({ phase: "over", reason: "self" });
    expect(over.worm).toEqual(game.worm);
  });

  test("a wall and the worm itself are told apart", () => {
    const wall = advance(playing([{ x: WIDTH - 1, y: 5 }, { x: WIDTH - 2, y: 5 }], "right"));
    const self = advance(
      steer(playing([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }], "left"), "down"),
    );

    expect(wall).toMatchObject({ reason: "wall" });
    expect(self).toMatchObject({ reason: "self" });
  });

  test("Following the tail", () => {
    const game = playing([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }], "left");
    const next = advance(steer(game, "down"));

    expect(next.phase).toBe("playing");
    expect(next.worm).toEqual([{ x: 5, y: 6 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }]);
  });

  test("a worm going round in a square never dies", () => {
    const turns: readonly Direction[] = ["down", "right", "up", "left"];
    let game: GameState = playing([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }], "left");

    for (let move = 0; move < 40; move += 1) {
      game = advance(steer(game, turns[move % 4]));
      expect(game.phase).toBe("playing");
    }
  });
});

describe("Full playfield", () => {
  // Every cell in a snaking order, so neighbours in the list are neighbours
  // on the playfield.
  const path = Array.from({ length: HEIGHT }, (_, y) =>
    Array.from({ length: WIDTH }, (__, column) => ({ x: y % 2 === 0 ? column : WIDTH - 1 - column, y })),
  ).flat();

  test("No room for food", () => {
    const food = path[path.length - 1];
    const worm = path.slice(0, -1).toReversed();
    const [head, neck] = worm;
    const heading: Direction = head.x > neck.x ? "right" : head.x < neck.x ? "left" : "down";
    const over = advance(playing(worm, heading, food));

    expect(over).toMatchObject({ phase: "over", reason: "full", food: undefined });
    expect(over.worm).toHaveLength(WIDTH * HEIGHT);
    expect(over.score).toBe(POINTS);
  });
});

describe("Game over and restart", () => {
  const crashed = (seed: number) => times(started(seed), 60);

  test("hitting the wall from the opening position ends the game", () => {
    expect(crashed(1)).toMatchObject({ phase: "over", reason: "wall" });
  });

  test("Restart", () => {
    const game = restart(crashed(7));

    expect(game).toMatchObject({ phase: "ready", score: 0, heading: "right", turn: "right" });
    expect(game.worm).toEqual(createGame(7).worm);
  });

  test("a restart gives different food from the first game", () => {
    const different = Array.from({ length: 20 }, (_, seed) => seed).filter(
      (seed) => JSON.stringify(restart(crashed(seed)).food) !== JSON.stringify(createGame(seed).food),
    );

    expect(different.length).toBeGreaterThan(15);
  });

  test("Arrow keys do not restart", () => {
    const over = crashed(1);

    (["up", "down", "left", "right"] as const).forEach((direction) => {
      expect(steer(over, direction)).toBe(over);
    });
  });

  test("restart does nothing before the game is over", () => {
    const ready = createGame(1);
    const moving = started();

    expect(restart(ready)).toBe(ready);
    expect(restart(moving)).toBe(moving);
  });
});
