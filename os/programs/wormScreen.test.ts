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
  HI_COLUMN,
  KEYS,
  KEYS_ROW,
  MESSAGE_ROW,
  MESSAGES,
} from "./wormScreen";

// Most tests draw a game with no record to beat.
const draw = (game: GameState, record = 0) => drawGame(game, record);

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

const over = (reason: "wall" | "self" | "full", game: GameState = createGame(1)): GameState => ({
  ...game,
  phase: "over",
  reason,
});

describe("The game screen", () => {
  const screen = draw(createGame(1));

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
    expect(header).toContain("HI: 0");
    expect(header.indexOf("WORM")).toBeLessThan(header.indexOf("SCORE: "));
    expect(header.indexOf("SCORE: ")).toBeLessThan(header.indexOf("LENGTH: "));
    expect(header.indexOf("LENGTH: ")).toBeLessThan(header.indexOf("HI: "));
    expect(header.indexOf("HI: ")).toBe(HI_COLUMN);
  });

  test("Header fits the largest figures", () => {
    const cells = WIDTH * HEIGHT;
    const longest = Array.from({ length: cells }, (_, index): Cell => ({ x: index % WIDTH, y: Math.floor(index / WIDTH) }));
    const score = (cells - 3) * 10;
    const header = text(draw({ ...over("full", { ...createGame(1), food: undefined }), worm: longest, score }, score), 0);

    expect(score).toBe(16_350);
    expect(header).toMatch(/^ {2}WORM {24}SCORE: 16350 {8}LENGTH: 1638 {4}HI: 16350 {5}$/);
  });

  test("the high score is the record while the score is below it", () => {
    expect(text(draw({ ...createGame(1), score: 30 }, 450), 0)).toContain("HI: 450");
  });

  test("the high score follows the score once it passes the record", () => {
    const header = text(draw({ ...createGame(1), score: 30 }, 20), 0);

    expect(header).toContain("SCORE: 30");
    expect(header).toContain("HI: 30");
  });

  test("the header shows a new score and length", () => {
    const fed = draw({ ...playing([{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 3 }], "right"), score: 1_230 });

    expect(text(fed, 0)).toContain("SCORE: 1230");
    expect(text(fed, 0)).toContain("LENGTH: 4");
  });

  test("a growing score does not move the length", () => {
    const small = text(draw(createGame(1)), 0);
    const large = text(draw({ ...createGame(1), score: 16_350 }), 0);

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
    expect(stars(draw(steer(createGame(5), "up")))).toBe(1);
  });

  test("Nothing outside the playfield", () => {
    const blank = border(draw(playing([{ x: 40, y: 10 }], "right")));
    const edges = [
      playing([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], "left", { x: 77, y: 0 }),
      playing([{ x: 77, y: 0 }, { x: 77, y: 1 }], "up", { x: 0, y: 20 }),
      playing([{ x: 77, y: 20 }, { x: 76, y: 20 }], "right", { x: 77, y: 19 }),
      playing([{ x: 0, y: 20 }, { x: 0, y: 19 }], "down", { x: 0, y: 0 }),
    ];

    edges.forEach((game) => {
      expect(border(draw(game))).toEqual(blank);
    });
  });

  test("Drawing does not disturb the display", () => {
    const before = steer(createGame(1), "right");
    const after = advance(before);
    const [first, second] = [draw(before), draw(after)];
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

  test("passing the record changes only the header digits", () => {
    const before = { ...steer(createGame(1), "right"), score: 20 };
    const after = { ...before, score: 30 };
    const [first, second] = [draw(before, 20), draw(after, 20)];
    const changed = first.rows.flatMap((cells, row) =>
      cells.flatMap((cell, column) => (cell.char === second.rows[row][column].char ? [] : [[row, column]])),
    );

    expect(changed).toEqual([
      [0, 37],
      [0, 70],
    ]);
    expect(text(second, 0)).toContain("HI: 30");
  });
});

describe("Key lines", () => {
  test("ready", () => {
    expect(text(draw(createGame(1)), KEYS_ROW)).toContain("Press an arrow key to start");
  });

  test.each<GameState>([createGame(1), steer(createGame(1), "up"), over("wall")])(
    "each phase names its keys and the way out",
    (game) => {
      const row = text(draw(game), KEYS_ROW);

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
    const screen = draw({ ...over("wall"), score: 40 });

    expect(inPlayfield(screen, "GAME OVER")).toBe(true);
    expect(inPlayfield(screen, "Press Enter to play again or Esc to exit")).toBe(true);
    expect(text(screen, 0)).toContain("SCORE: 40");
    expect(text(screen, 0)).toContain("LENGTH: 3");
  });

  test("the messages are centred in the playfield", () => {
    const screen = draw(over("wall"));
    const row = text(screen, MESSAGE_ROW);
    const start = row.indexOf(MESSAGES.crashed);
    const end = start + MESSAGES.crashed.length;

    expect(Math.abs(start - FIELD_LEFT - (FIELD_LEFT + WIDTH - end))).toBeLessThanOrEqual(1);
  });

  test("both kinds of crash show GAME OVER", () => {
    (["wall", "self"] as const).forEach((reason) => {
      expect(inPlayfield(draw(over(reason)), "GAME OVER")).toBe(true);
    });
  });

  test("the board stays under the message", () => {
    const game = createGame(1);
    const screen = draw(over("wall", game));

    expect(cellChar(screen, game.worm[0])).toBe(HEAD);
  });

  test("No room for food", () => {
    const screen = draw(over("full", { ...createGame(1), food: undefined }));

    expect(inPlayfield(screen, "YOU FILLED THE FIELD")).toBe(true);
    expect(inPlayfield(screen, "GAME OVER")).toBe(false);
    expect(stars(screen)).toBe(0);
  });

  test("A new record", () => {
    const screen = draw({ ...over("wall"), score: 60 }, 40);
    const rows = [MESSAGES.crashed, MESSAGES.record, MESSAGES.restart].map((message) =>
      screen.rows.findIndex((cells) => cells.map(({ char }) => char).join("").includes(message)),
    );

    expect(rows).toEqual([MESSAGE_ROW, MESSAGE_ROW + 1, MESSAGE_ROW + 2]);
    expect(MESSAGES.record).toBe("NEW HIGH SCORE");
  });

  test("the new record line is centred", () => {
    const row = text(draw({ ...over("wall"), score: 60 }, 40), MESSAGE_ROW + 1);
    const start = row.indexOf(MESSAGES.record);
    const end = start + MESSAGES.record.length;

    expect(Math.abs(start - FIELD_LEFT - (FIELD_LEFT + WIDTH - end))).toBeLessThanOrEqual(1);
  });

  test("No record", () => {
    const screen = draw({ ...over("wall"), score: 40 }, 40);

    expect(inPlayfield(screen, "GAME OVER")).toBe(true);
    expect(inPlayfield(screen, MESSAGES.restart)).toBe(true);
    expect(inPlayfield(screen, "NEW HIGH SCORE")).toBe(false);
  });

  test("Filled the field with a record", () => {
    const screen = draw({ ...over("full", { ...createGame(1), food: undefined }), score: 60 }, 40);

    expect(inPlayfield(screen, "YOU FILLED THE FIELD")).toBe(true);
    expect(inPlayfield(screen, "NEW HIGH SCORE")).toBe(true);
  });

  test("no record message while the score is passing the record in play", () => {
    expect(inPlayfield(draw({ ...steer(createGame(1), "up"), score: 60 }, 40), "NEW HIGH SCORE")).toBe(false);
  });

  test("no message before the game is over", () => {
    [createGame(1), steer(createGame(1), "up")].forEach((game) => {
      const screen = draw(game);

      expect(inPlayfield(screen, MESSAGES.crashed)).toBe(false);
      expect(inPlayfield(screen, MESSAGES.restart)).toBe(false);
    });
  });
});
