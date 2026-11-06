// Drawing DEFRAG.EXE: a blue screen with the menu bar, the block map of
// drive C, the status and legend boxes, the status line, and any menu or
// dialog. The layout and wording follow MS-DOS 6 Defrag from memory and are
// not verified.

import { type Cell, COLUMNS, ROWS, type Screen } from "../terminal/screen";
import { VERSION } from "../version";
import { type Block, MAP_BLOCKS, MAP_COLUMNS } from "./defragMap";
import type { Color } from "./defragPictures";
import {
  ANALYSIS_TICKS,
  DIALOG_FOCUS,
  type DialogFocus,
  type DefragState,
  END_BUTTONS,
  MENU_HINTS,
  MENU_ITEMS,
  METHOD_NAMES,
  METHODS,
  notFragmentedPercent,
  RECOMMEND_BUTTONS,
  TICK_MS,
} from "./defragRun";

export const MAP_TOP = 1;
export const MAP_LEFT = 1;
export const BOX_TOP = 18;
export const STATUS_LEFT = 1;
export const STATUS_WIDTH = 30;
export const LEGEND_LEFT = 32;
export const LEGEND_WIDTH = 47;
export const STATUS_ROW = ROWS - 1;
export const PRODUCT = "ODD/OS Defrag";

const SCREEN: Color = "blue";
const BAR: Color = "light-grey";

type Style = { readonly fg: Color; readonly bg: Color };

const PLAIN: Style = { fg: "white", bg: SCREEN };
const DIALOG: Style = { fg: "black", bg: BAR };
const SELECTED: Style = { fg: "white", bg: "black" };

// A grid of cells drawn into in place, then frozen into a Screen.
type Canvas = Cell[][];

const blankCanvas = (): Canvas =>
  Array.from({ length: ROWS }, () => Array.from({ length: COLUMNS }, () => ({ char: " ", ...PLAIN })));

const put = (canvas: Canvas, row: number, column: number, text: string, style: Style) => {
  Array.from(text).forEach((char, offset) => {
    const at = column + offset;
    if (row >= 0 && row < ROWS && at >= 0 && at < COLUMNS) canvas[row][at] = { char, ...style };
  });
};

const box = (canvas: Canvas, top: number, left: number, width: number, height: number, title: string, style: Style) => {
  const label = title === "" ? "" : ` ${title} `;
  const before = Math.floor((width - 2 - label.length) / 2);
  put(canvas, top, left, `┌${"─".repeat(before)}${label}${"─".repeat(width - 2 - before - label.length)}┐`, style);
  for (let row = top + 1; row < top + height - 1; row += 1) {
    put(canvas, row, left, `│${" ".repeat(width - 2)}│`, style);
  }
  put(canvas, top + height - 1, left, `└${"─".repeat(width - 2)}┘`, style);
};

const BLOCK_CELLS: Readonly<Record<Exclude<Block["kind"], "picture">, Cell>> = {
  unused: { char: "░", fg: "cyan", bg: SCREEN },
  used: { char: "█", fg: "white", bg: SCREEN },
  unmovable: { char: "X", fg: "white", bg: SCREEN },
  lost: { char: "X", fg: "white", bg: SCREEN },
};

const blockCell = (block: Block): Cell =>
  block.kind === "picture" ? { char: "█", fg: block.color, bg: SCREEN } : BLOCK_CELLS[block.kind];

const drawMap = (canvas: Canvas, state: DefragState) => {
  const shown =
    state.phase.kind === "choosing"
      ? 0
      : state.phase.kind === "analysing"
        ? Math.floor(((state.phase.tick + 1) / ANALYSIS_TICKS) * MAP_BLOCKS)
        : MAP_BLOCKS;
  const reading = new Set(state.reading);
  const writing = new Set(state.writing);

  state.blocks.slice(0, shown).forEach((block, index) => {
    const row = MAP_TOP + Math.floor(index / MAP_COLUMNS);
    const column = MAP_LEFT + (index % MAP_COLUMNS);
    canvas[row][column] = writing.has(index)
      ? { char: "W", fg: "yellow", bg: SCREEN }
      : reading.has(index)
        ? { char: "r", fg: "yellow", bg: SCREEN }
        : blockCell(block);
  });
};

const count = (value: number) => value.toLocaleString("en-US");

export const elapsed = (ticks: number) => {
  const seconds = Math.floor((ticks * TICK_MS) / 1000);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${part(Math.floor(seconds / 3600))}:${part(Math.floor(seconds / 60) % 60)}:${part(seconds % 60)}`;
};

const centred = (text: string, width: number) => {
  const before = Math.max(Math.floor((width - text.length) / 2), 0);
  return `${" ".repeat(before)}${text}`.padEnd(width);
};

const drawBoxes = (canvas: Canvas, state: DefragState) => {
  const inner = STATUS_WIDTH - 2;
  box(canvas, BOX_TOP, STATUS_LEFT, STATUS_WIDTH, 6, "Status", PLAIN);
  const cluster = `Cluster ${count(state.cluster)}`;
  const percent = `${state.percent}%`;
  put(canvas, BOX_TOP + 1, STATUS_LEFT + 1, ` ${cluster}${percent.padStart(inner - cluster.length - 2)} `, PLAIN);
  put(canvas, BOX_TOP + 2, STATUS_LEFT + 1, ` Elapsed Time: ${elapsed(state.elapsedTicks)}`, PLAIN);
  put(canvas, BOX_TOP + 3, STATUS_LEFT + 1, centred(METHOD_NAMES[state.method], inner), PLAIN);

  box(canvas, BOX_TOP, LEGEND_LEFT, LEGEND_WIDTH, 6, "Legend", PLAIN);
  const legend = [
    "█ - Used              ░ - Unused",
    "r - Reading           W - Writing",
    "B - Bad               X - Unmovable",
    `Drive C:  1 block = ${count(state.map.clustersPerBlock)} clusters`,
  ];
  legend.forEach((line, offset) => put(canvas, BOX_TOP + 1 + offset, LEGEND_LEFT + 2, line, PLAIN));
};

const statusText = (state: DefragState): string => {
  const { phase } = state;
  switch (phase.kind) {
    case "analysing":
      return "Reading drive information...";
    case "main":
      return phase.overlay.kind === "none"
        ? "F10=Menu  Esc=Exit"
        : phase.overlay.kind === "menu"
          ? MENU_HINTS[phase.overlay.item]
          : "Enter=Select  Esc=Cancel";
    case "optimizing":
      return phase.stage !== "overrun" && state.reading.length === 0 ? "Writing..." : "Reading...";
    case "holding":
      return "Optimization complete. Press any key.";
    default:
      return "Enter=Select  Esc=Cancel";
  }
};

const drawBars = (canvas: Canvas, state: DefragState) => {
  const menuOpen = state.phase.kind === "main" && state.phase.overlay.kind === "menu";
  put(canvas, 0, 0, " ".repeat(COLUMNS), DIALOG);
  put(canvas, 0, 1, " Optimize ", menuOpen ? SELECTED : DIALOG);

  const product = `│ ${PRODUCT} `;
  put(canvas, STATUS_ROW, 0, " ".repeat(COLUMNS), DIALOG);
  put(canvas, STATUS_ROW, 1, statusText(state), DIALOG);
  put(canvas, STATUS_ROW, COLUMNS - product.length, product, DIALOG);
};

const buttons = (canvas: Canvas, row: number, left: number, width: number, labels: readonly string[], selected: number) => {
  const texts = labels.map((label) => `< ${label} >`);
  const total = texts.reduce((sum, text) => sum + text.length, 0) + (texts.length - 1) * 2;
  let column = left + Math.floor((width - total) / 2);
  texts.forEach((text, index) => {
    put(canvas, row, column, text, index === selected ? SELECTED : DIALOG);
    column += text.length + 2;
  });
};

// A dialog box centred on the screen, with its lines and a row of buttons.
const dialog = (
  canvas: Canvas,
  title: string,
  lines: readonly string[],
  labels: readonly string[],
  selected: number,
) => {
  const width = Math.max(...lines.map((line) => line.length + 4), labels.join("      ").length + 10, title.length + 8, 36);
  const height = lines.length + 5;
  const top = Math.floor((ROWS - height) / 2);
  const left = Math.floor((COLUMNS - width) / 2);

  box(canvas, top, left, width, height, title, DIALOG);
  lines.forEach((line, offset) => put(canvas, top + 2 + offset, left + 2, centred(line, width - 4), DIALOG));
  buttons(canvas, top + height - 2, left, width, labels, selected);
};

const choices = (
  canvas: Canvas,
  title: string,
  items: readonly string[],
  selected: number,
  focus: DialogFocus,
  radio: boolean,
) => {
  const width = Math.max(...items.map((item) => item.length + 10), title.length + 8, 36);
  const height = items.length + 6;
  const top = Math.floor((ROWS - height) / 2);
  const left = Math.floor((COLUMNS - width) / 2);

  box(canvas, top, left, width, height, title, DIALOG);
  items.forEach((item, offset) => {
    const mark = !radio ? "" : offset === selected ? "(•) " : "( ) ";
    put(canvas, top + 2 + offset, left + 3, ` ${mark}${item} `, focus === "list" && offset === selected ? SELECTED : DIALOG);
  });
  buttons(canvas, top + height - 2, left, width, ["OK", "Cancel"], DIALOG_FOCUS.indexOf(focus) - 1);
};

const drawMenu = (canvas: Canvas, item: number) => {
  const width = Math.max(...MENU_ITEMS.map((entry) => entry.length)) + 4;
  box(canvas, 1, 1, width, MENU_ITEMS.length + 2, "", DIALOG);
  MENU_ITEMS.forEach((entry, index) =>
    put(canvas, 2 + index, 2, ` ${entry}`.padEnd(width - 2), index === item ? SELECTED : DIALOG),
  );
};

const drawOverlay = (canvas: Canvas, state: DefragState) => {
  const { phase } = state;

  switch (phase.kind) {
    case "choosing":
      choices(canvas, "Select Drive", ["[-C-]"], 0, phase.focus, false);
      return;
    case "recommend":
      dialog(
        canvas,
        "Recommendation",
        [
          `${notFragmentedPercent(state)}% of drive C: is not fragmented.`,
          "",
          "Recommended optimization method:",
          METHOD_NAMES[phase.method],
        ],
        RECOMMEND_BUTTONS,
        phase.button,
      );
      return;
    case "main":
      switch (phase.overlay.kind) {
        case "menu":
          drawMenu(canvas, phase.overlay.item);
          return;
        case "method":
          choices(
            canvas,
            "Optimization Method",
            METHODS.map((method) => METHOD_NAMES[method]),
            phase.overlay.choice,
            phase.overlay.focus,
            true,
          );
          return;
        case "drive":
          choices(canvas, "Select Drive", ["[-C-]"], 0, phase.overlay.focus, false);
          return;
        case "about":
          dialog(canvas, "About Defrag", ["Defrag", VERSION, "(C)Copyright Ordinary Data Devices, Inc. 1993"], ["OK"], 0);
          return;
        default:
          return;
      }
    case "finished":
      dialog(canvas, "", ["Finished condensing."], ["OK"], 0);
      return;
    case "ended":
      dialog(canvas, "", ["Optimization of drive C: is over."], END_BUTTONS, phase.button);
      return;
    default:
      return;
  }
};

export const drawDefrag = (state: DefragState): Screen => {
  const canvas = blankCanvas();
  drawBars(canvas, state);
  drawMap(canvas, state);
  drawBoxes(canvas, state);
  drawOverlay(canvas, state);

  return { rows: canvas, cursor: { row: 0, column: 0, visible: false } };
};
