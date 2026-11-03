import {
  COLUMNS,
  createScreen,
  type Screen,
  setCursorVisible,
  type TextStyle,
  writeText,
} from "../terminal/screen";
import { type Cell, type GameState, HEIGHT, WIDTH } from "./wormGame";

// The playfield sits inside a double-line box on rows 1 to 23.
export const FIELD_TOP = 2;
export const FIELD_LEFT = 1;

export const HEAD = "@";
export const BODY = "o";
export const FOOD = "*";

export const SCORE_COLUMN = 30;
export const LENGTH_COLUMN = 50;
export const HI_COLUMN = 66;
export const KEYS_ROW = 24;
export const MESSAGE_ROW = FIELD_TOP + Math.floor(HEIGHT / 2) - 1;

export const MESSAGES = {
  crashed: "GAME OVER",
  full: "YOU FILLED THE FIELD",
  record: "NEW HIGH SCORE",
  restart: "Press Enter to play again or Esc to exit",
} as const;

export const KEYS: Readonly<Record<GameState["phase"], string>> = {
  ready: "Press an arrow key to start",
  playing: "Arrow keys steer",
  over: "Enter plays again",
};

export const EXIT_KEY = "Esc exits to DOS";

const SCORE_LABEL = "SCORE: ";
const LENGTH_LABEL = "LENGTH: ";
const HI_LABEL = "HI: ";

type Color = NonNullable<TextStyle["fg"]>;

type Line = readonly [row: number, column: number, text: string];

const paint = (screen: Screen, color: Color, lines: readonly Line[]): Screen =>
  lines.reduce((painted, [row, column, text]) => writeText(painted, row, column, text, { fg: color }), screen);

const sides = Array.from({ length: HEIGHT }, (_, y): readonly Line[] => [
  [FIELD_TOP + y, 0, "║"],
  [FIELD_TOP + y, COLUMNS - 1, "║"],
]).flat();

// Everything that never changes, drawn once.
const FRAME = [
  { color: "cyan", lines: [[1, 0, `╔${"═".repeat(WIDTH)}╗`], ...sides, [FIELD_TOP + HEIGHT, 0, `╚${"═".repeat(WIDTH)}╝`]] },
  { color: "white", lines: [[0, 2, "WORM"]] },
  { color: "light-grey", lines: [[0, SCORE_COLUMN, SCORE_LABEL], [0, LENGTH_COLUMN, LENGTH_LABEL], [0, HI_COLUMN, HI_LABEL]] },
  { color: "dark-grey", lines: [[KEYS_ROW, COLUMNS - 2 - EXIT_KEY.length, EXIT_KEY]] },
] satisfies readonly { color: Color; lines: readonly Line[] }[];

const BLANK_FRAME = FRAME.reduce<Screen>(
  (screen, { color, lines }) => paint(screen, color, lines),
  setCursorVisible(createScreen(), false),
);

const atCell = ({ x, y }: Cell, text: string): Line => [FIELD_TOP + y, FIELD_LEFT + x, text];

const centred = (row: number, text: string): Line => {
  const padded = ` ${text} `;
  return [row, FIELD_LEFT + Math.floor((WIDTH - padded.length) / 2), padded];
};

// `record` is the best score before this game began; the header shows the
// greater of it and the score, so it follows the score once passed.
export const drawGame = (game: GameState, record: number): Screen => {
  const [head, ...body] = game.worm;

  let screen = paint(BLANK_FRAME, "white", [
    [0, SCORE_COLUMN + SCORE_LABEL.length, String(game.score)],
    [0, LENGTH_COLUMN + LENGTH_LABEL.length, String(game.worm.length)],
    [0, HI_COLUMN + HI_LABEL.length, String(Math.max(record, game.score))],
  ]);
  screen = paint(screen, "light-grey", [[KEYS_ROW, 2, KEYS[game.phase]]]);
  screen = paint(screen, "light-red", game.food ? [atCell(game.food, FOOD)] : []);
  screen = paint(screen, "light-green", body.map((cell) => atCell(cell, BODY)));
  screen = paint(screen, "yellow", [atCell(head, HEAD)]);

  if (game.phase !== "over") return screen;

  screen = paint(screen, "white", [centred(MESSAGE_ROW, game.reason === "full" ? MESSAGES.full : MESSAGES.crashed)]);
  screen = paint(screen, "yellow", game.score > record ? [centred(MESSAGE_ROW + 1, MESSAGES.record)] : []);
  return paint(screen, "light-grey", [centred(MESSAGE_ROW + 2, MESSAGES.restart)]);
};
