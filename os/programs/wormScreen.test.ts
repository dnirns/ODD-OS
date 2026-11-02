import { describe, expect, test } from "vitest";

import { COLUMNS, ROWS, type Screen } from "../terminal/screen";
import {
  advance,
  type Cell,
  createGame,
  type Direction,
  type GameState,
  HEIGHT,
  type Playing,
  steer,
  WIDTH,
} from "./wormGame";
import {
  BODY,
  drawGame,
  EXIT_KEY,
  FIELD_LEFT,
  FIELD_TOP,
  FOOD,
  HEAD,
  KEYS,
  KEYS_ROW,
  MESSAGE_ROW,
  MESSAGES,
} from "./wormScreen";

const text = (screen: Screen, row: number) => screen.rows[row].map(({ char }) => char).join("");

const charAt = (screen: Screen, row: number, column: number) => screen.rows[row][column].char;

const cellChar = (screen: Screen, { x, y }: Cell) => charAt(screen, FIELD_TOP + y, FIELD_LEFT + x);

const playing = (worm: readonly Cell[], heading: Direction, food?: Cell): Playing => ({
  phase: "playing",
  worm,
  heading,
  turn: heading,
  food,
  score: 0,
  seed: 1,
});

const isBorder = (row: number, column: number) =>
  (row === 1 || row === FIELD_TOP + HEIGHT) && column >= 0 && column < COLUMNS
    ? true
    : row > 1 && row < FIELD_TOP + HEIGHT && (column === 0 || column === COLUMNS - 1);

const border = (screen: Screen) =>
  screen.rows.flatMap((cells, row) =>
    cells.filter((_, column) => isBorder(row, column)).map(({ char, fg }) => `${char}${fg}`),
  );

const stars = (screen: Screen) =>
  screen.rows
    .slice(FIELD_TOP, FIELD_TOP + HEIGHT)
    .flatMap((cells) => cells.slice(FIELD_LEFT, FIELD_LEFT + WIDTH))
    .filter(({ char }) => char === FOOD).length;

const over = (reason: "crashed" | "full", game: GameState = createGame(1)): GameState => ({
  ...game,
  phase: "over",
  reason,
});

describe("The game screen", () => {
  const screen = drawGame(createGame(1));

  test("is 80 by 25", () => {
    expect(screen.rows).toHaveLength(ROWS);
    screen.rows.forEach((cells) => expect(cells).toHaveLength(COLUMNS));
  });

  test("Frame", () => {
    expect(charAt(screen, 1, 0)).toBe("╔");
    expect(charAt(screen, 1, 79)).toBe("╗");
    expect(charAt(screen, 23, 0)).toBe("╚");
    expect(charAt(screen, 23, 79)).toBe("╝");
    expect(text(screen, 1).slice(1, 79)).toBe("═".repeat(78));
    expect(text(screen, 23).slice(1, 79)).toBe("═".repeat(78));

    for (let row = 2; row <= 22; row += 1) {
      expect(charAt(screen, row, 0)).toBe("║");
      expect(charAt(screen, row, 79)).toBe("║");
    }
  });

  test("the playfield is 78 columns by 21 rows inside the box", () => {
    expect(FIELD_TOP).toBe(2);
    expect(FIELD_LEFT).toBe(1);
    expect(WIDTH).toBe(78);
    expect(HEIGHT).toBe(21);
  });

  test("the cursor is not shown", () => {
    expect(screen.cursor.visible).toBe(false);
  });

  test("Header", () => {
    const header = text(screen, 0);

    expect(header).toContain("WORM");
    expect(header).toContain("SCORE: 0");
    expect(header).toContain("LENGTH: 3");
  });

  test("the header shows a new score and length", () => {
    const fed = drawGame({ ...playing([{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 3 }], "right"), score: 1_230 });

    expect(text(fed, 0)).toContain("SCORE: 1230");
    expect(text(fed, 0)).toContain("LENGTH: 4");
  });

  test("a growing score does not move the length", () => {
    const small = text(drawGame(createGame(1)), 0);
    const large = text(drawGame({ ...createGame(1), score: 16_350 }), 0);

    expect(large.indexOf("LENGTH: ")).toBe(small.indexOf("LENGTH: "));
  });

  test("the worm and the food", () => {
    const game = createGame(1);

    expect(cellChar(screen, game.worm[0])).toBe(HEAD);
    expect(cellChar(screen, game.worm[1])).toBe(BODY);
    expect(cellChar(screen, game.worm[2])).toBe(BODY);
    expect(cellChar(screen, game.food as Cell)).toBe(FOOD);
    expect(charAt(screen, 12, 40)).toBe("@");
    expect([HEAD, BODY, FOOD]).toEqual(["@", "o", "*"]);
  });

  test("One piece of food", () => {
    expect(stars(screen)).toBe(1);
    expect(stars(drawGame(steer(createGame(5), "up")))).toBe(1);
  });

  test("Nothing outside the playfield", () => {
    const blank = border(drawGame(playing([{ x: 40, y: 10 }], "right")));
    const edges = [
      playing([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], "left", { x: 77, y: 0 }),
      playing([{ x: 77, y: 0 }, { x: 77, y: 1 }], "up", { x: 0, y: 20 }),
      playing([{ x: 77, y: 20 }, { x: 76, y: 20 }], "right", { x: 77, y: 19 }),
      playing([{ x: 0, y: 20 }, { x: 0, y: 19 }], "down", { x: 0, y: 0 }),
    ];

    edges.forEach((game) => {
      expect(border(drawGame(game))).toEqual(blank);
    });
  });

  test("Drawing does not disturb the display", () => {
    const before = steer(createGame(1), "right");
    const after = advance(before);
    const [first, second] = [drawGame(before), drawGame(after)];
    const changed = first.rows.flatMap((cells, row) =>
      cells.flatMap((cell, column) =>
        cell.char === second.rows[row][column].char && cell.fg === second.rows[row][column].fg
          ? []
          : [[row, column]],
      ),
    );
    const worm = [...before.worm, ...after.worm].map(({ x, y }) => [FIELD_TOP + y, FIELD_LEFT + x]);

    expect(changed.length).toBeGreaterThan(0);
    changed.forEach((cell) => expect(worm).toContainEqual(cell));
    expect(second.cursor).toEqual(first.cursor);
  });
});

describe("Key lines", () => {
  test("ready", () => {
    expect(text(drawGame(createGame(1)), KEYS_ROW)).toContain("Press an arrow key to start");
  });

  test.each<GameState>([createGame(1), steer(createGame(1), "up"), over("crashed")])(
    "each phase names its keys and the way out",
    (game) => {
      const row = text(drawGame(game), KEYS_ROW);

      expect(row).toContain(KEYS[game.phase]);
      expect(row).toContain(EXIT_KEY);
    },
  );
});

describe("Game over", () => {
  const inPlayfield = (screen: Screen, message: string) =>
    screen.rows.some(
      (cells, row) =>
        row >= FIELD_TOP &&
        row < FIELD_TOP + HEIGHT &&
        cells
          .slice(FIELD_LEFT, FIELD_LEFT + WIDTH)
          .map(({ char }) => char)
          .join("")
          .includes(message),
    );

  test("Over screen", () => {
    const screen = drawGame({ ...over("crashed"), score: 40 });

    expect(inPlayfield(screen, "GAME OVER")).toBe(true);
    expect(inPlayfield(screen, "Press Enter to play again or Esc to exit")).toBe(true);
    expect(text(screen, 0)).toContain("SCORE: 40");
    expect(text(screen, 0)).toContain("LENGTH: 3");
  });

  test("the messages are centred in the playfield", () => {
    const screen = drawGame(over("crashed"));
    const row = text(screen, MESSAGE_ROW);
    const start = row.indexOf(MESSAGES.crashed);
    const end = start + MESSAGES.crashed.length;

    expect(Math.abs(start - FIELD_LEFT - (FIELD_LEFT + WIDTH - end))).toBeLessThanOrEqual(1);
  });

  test("the board stays under the message", () => {
    const game = createGame(1);
    const screen = drawGame(over("crashed", game));

    expect(cellChar(screen, game.worm[0])).toBe(HEAD);
  });

  test("No room for food", () => {
    const screen = drawGame(over("full", { ...createGame(1), food: undefined }));

    expect(inPlayfield(screen, "YOU FILLED THE FIELD")).toBe(true);
    expect(inPlayfield(screen, "GAME OVER")).toBe(false);
    expect(stars(screen)).toBe(0);
  });

  test("no message before the game is over", () => {
    [createGame(1), steer(createGame(1), "up")].forEach((game) => {
      const screen = drawGame(game);

      expect(inPlayfield(screen, MESSAGES.crashed)).toBe(false);
      expect(inPlayfield(screen, MESSAGES.restart)).toBe(false);
    });
  });
});
