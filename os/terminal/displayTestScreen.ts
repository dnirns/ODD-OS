import { type Color, COLORS } from "./colors";
import {
  COLUMNS,
  createScreen,
  moveCursor,
  ROWS,
  type Screen,
  writeText,
} from "./screen";

const LEFT_MARGIN = 3;
const SAMPLE_COLUMN_WIDTH = 37;
const FIRST_SAMPLE_ROW = 7;
const SAMPLES_PER_COLUMN = 8;
const SWATCH = "    ";

const labelBackground = (color: Color): Color =>
  color === "black" ? "light-grey" : "black";

const drawBorder = (screen: Screen) => {
  const edge = "═".repeat(COLUMNS - 2);
  const horizontal = writeText(
    writeText(screen, 0, 0, `╔${edge}╗`),
    ROWS - 1,
    0,
    `╚${edge}╝`,
  );

  return Array.from({ length: ROWS - 2 }, (_, index) => index + 1).reduce(
    (current, row) =>
      writeText(writeText(current, row, 0, "║"), row, COLUMNS - 1, "║"),
    horizontal,
  );
};

export const createDisplayTestScreen = () => {
  const header = [
    { row: 2, text: "ODD/OS Version 3.14" },
    { row: 3, text: "Ordinary Data Devices, Inc." },
    { row: 5, text: "Display test" },
  ].reduce(
    (screen, { row, text }) => writeText(screen, row, LEFT_MARGIN, text),
    drawBorder(createScreen()),
  );

  const samples = COLORS.reduce((screen, color, index) => {
    const row = FIRST_SAMPLE_ROW + (index % SAMPLES_PER_COLUMN);
    const column =
      LEFT_MARGIN +
      Math.floor(index / SAMPLES_PER_COLUMN) * SAMPLE_COLUMN_WIDTH;
    const swatch = writeText(screen, row, column, SWATCH, { bg: color });

    return writeText(
      swatch,
      row,
      column + SWATCH.length + 1,
      color.toUpperCase(),
      { fg: color, bg: labelBackground(color) },
    );
  }, header);

  return moveCursor(
    samples,
    FIRST_SAMPLE_ROW + SAMPLES_PER_COLUMN + 2,
    LEFT_MARGIN,
  );
};
