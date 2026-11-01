import { MACHINE } from "../machine";
import {
  clearScreen,
  createScreen,
  moveCursor,
  type Screen,
  setCursorVisible,
  writeText,
} from "../terminal/screen";
import { PROMPT } from "../shell/prompt";

export type BootStep = {
  readonly delayMs: number;
  readonly apply: (screen: Screen) => Screen;
};

export type BootStepOptions = {
  readonly reducedMotion?: boolean;
};

type Line = readonly [row: number, text: string];

const MEMORY_STEPS = 32;
const REDUCED_MEMORY_STEPS = 4;
const MEMORY_TEST_MS = 3200;

const MEMORY_ROW = 7;
const SKIP_PROMPT_ROW = 24;
const PROMPT_ROW = 6;
const DEFAULT_PROMPT = "C>";

const show = (
  delayMs: number,
  cursorRow: number,
  ...lines: readonly Line[]
): BootStep => ({
  delayMs,
  apply: (screen) =>
    setCursorVisible(
      moveCursor(
        lines.reduce(
          (current, [row, text]) => writeText(current, row, 0, text),
          screen,
        ),
        cursorRow,
        0,
      ),
      true,
    ),
});

const memoryText = (kb: number) => `Memory Test: ${String(kb).padStart(4)}K`;

const memorySteps = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    show(MEMORY_TEST_MS / count, MEMORY_ROW + 1, [
      MEMORY_ROW,
      memoryText((MACHINE.memoryKb / count) * (index + 1)),
    ]),
  );

export const createBootScreen = () => setCursorVisible(createScreen(), false);

export const applySteps = (
  screen: Screen,
  steps: readonly BootStep[],
): Screen => steps.reduce((current, { apply }) => apply(current), screen);

export const createBootSteps = ({
  reducedMotion = false,
}: BootStepOptions = {}): BootStep[] => [
  show(
    600,
    2,
    [0, "ODD VGA BIOS Version 1.04"],
    [1, "(C) 1992 Ordinary Data Devices, Inc."],
    [SKIP_PROMPT_ROW, "Press ESC to skip startup"],
  ),
  show(
    700,
    5,
    [3, "ODD BIOS (C) 1993 Ordinary Data Devices, Inc."],
    [4, "ODD-486 BIOS Revision 3.14"],
  ),
  show(600, 7, [6, `CPU: ${MACHINE.cpu}`]),
  ...memorySteps(reducedMotion ? REDUCED_MEMORY_STEPS : MEMORY_STEPS),
  show(300, MEMORY_ROW + 1, [MEMORY_ROW, `${memoryText(MACHINE.memoryKb)} OK`]),
  show(
    1000,
    13,
    [9, `Fixed Disk 0: ${MACHINE.fixedDiskMb} MB`],
    [10, `Floppy Drive A: ${MACHINE.floppyDescription}`],
    [11, `Display: ${MACHINE.display}`],
    [12, "Keyboard: Detected"],
  ),
  {
    delayMs: 1600,
    apply: (screen) =>
      setCursorVisible(
        moveCursor(writeText(clearScreen(screen), 0, 0, "Starting ODD/OS..."), 1, 0),
        true,
      ),
  },
  show(1800, 3, [2, `${DEFAULT_PROMPT}PATH C:\\DOS`]),
  show(500, 4, [3, `${DEFAULT_PROMPT}DOSKEY /INSERT`]),
  show(300, 5, [4, "DOSKey installed."]),
  show(500, PROMPT_ROW, [5, `${DEFAULT_PROMPT}PROMPT $P$G`]),
  {
    delayMs: 900,
    apply: (screen) =>
      moveCursor(writeText(screen, PROMPT_ROW, 0, PROMPT), PROMPT_ROW, PROMPT.length),
  },
];
