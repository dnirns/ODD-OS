import { describe, expect, test } from "vitest";

import { COLUMNS, ROWS, type Screen } from "../terminal/screen";
import {
  applySteps,
  type BootStep,
  createBootScreen,
  createBootSteps,
} from "./bootSteps";

const screenText = (screen: Screen) =>
  screen.rows.map((cells) => cells.map((cell) => cell.char).join("")).join("\n");

const rowText = (screen: Screen, row: number) =>
  screen.rows[row].map((cell) => cell.char).join("").trimEnd();

const screensAfterEachStep = (steps: readonly BootStep[]) =>
  steps.reduce<Screen[]>(
    (screens, { apply }) => [...screens, apply(screens.at(-1)!)],
    [createBootScreen()],
  );

const totalDelay = (steps: readonly BootStep[]) =>
  steps.reduce((sum, { delayMs }) => sum + delayMs, 0);

const memoryCounts = (screens: readonly Screen[]) => [
  ...new Set(
    screens.flatMap((screen) => {
      const match = /Memory Test:\s+(\d+)K/.exec(screenText(screen));
      return match ? [Number(match[1])] : [];
    }),
  ),
];

const steps = createBootSteps();
const screens = screensAfterEachStep(steps);
const firstScreenWith = (text: string) =>
  screens.findIndex((screen) => screenText(screen).includes(text));
const finalScreen = screens.at(-1)!;

describe("createBootScreen", () => {
  test("is a blank 25x80 screen with a hidden cursor", () => {
    const screen = createBootScreen();

    expect(screen.rows).toHaveLength(ROWS);
    expect(screenText(screen).replaceAll("\n", "")).toBe(" ".repeat(ROWS * COLUMNS));
    expect(screen.cursor.visible).toBe(false);
  });
});

describe("createBootSteps", () => {
  test("shows the video BIOS banner before anything else", () => {
    const first = screens[1];

    expect(rowText(first, 0)).toBe("ODD VGA BIOS Version 1.04");
    expect(screenText(first)).not.toContain("ODD BIOS");
    expect(
      screenText(first).split("\n").filter((row) => row.trim() !== ""),
    ).toHaveLength(3);
  });

  test("shows the system BIOS header below the video banner", () => {
    const second = screens[2];

    expect(rowText(second, 0)).toBe("ODD VGA BIOS Version 1.04");
    expect(rowText(second, 3)).toContain("ODD BIOS (C) 1993");
    expect(rowText(second, 4)).toBe("ODD-486 BIOS Revision 3.14");
  });

  test("shows the boot messages in order", () => {
    const video = firstScreenWith("ODD VGA BIOS");
    const header = firstScreenWith("ODD BIOS");
    const memory = firstScreenWith("8192K OK");
    const devices = firstScreenWith("Fixed Disk 0");
    const starting = firstScreenWith("Starting ODD/OS...");
    const path = firstScreenWith("C>PATH C:\\DOS");
    const promptCommand = firstScreenWith("C>PROMPT $P$G");
    const prompt = screens.findIndex((screen) => rowText(screen, 4) === "C:\\>");

    expect(video).toBeGreaterThan(0);
    expect(video).toBeLessThan(header);
    expect(header).toBeLessThan(memory);
    expect(memory).toBeLessThan(devices);
    expect(devices).toBeLessThan(starting);
    expect(starting).toBeLessThan(path);
    expect(path).toBeLessThan(promptCommand);
    expect(promptCommand).toBeLessThan(prompt);
  });

  test("shows the detected devices together in one step", () => {
    const devices = ["Fixed Disk 0", "Floppy Drive A", "Display:", "Keyboard:"];
    const indexes = devices.map(firstScreenWith);

    expect(indexes[0]).toBeGreaterThan(0);
    expect(new Set(indexes).size).toBe(1);
  });

  test("shows only what a real system printed", () => {
    const text = screens.map(screenText).join("\n");

    expect(text).not.toMatch(/booting from/i);
    expect(text).not.toMatch(/processing/i);
    expect(text).not.toContain("CONFIG.SYS");
  });

  test("counts memory upwards to 8192K and then marks it OK", () => {
    const counts = memoryCounts(screens);

    expect(counts.length).toBeGreaterThan(10);
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
    expect(counts.at(-1)).toBe(8192);
    expect(screenText(screens[firstScreenWith("8192K OK")])).toContain(
      "Memory Test: 8192K OK",
    );
  });

  test("shows the skip prompt on the bottom row throughout POST", () => {
    const starting = firstScreenWith("Starting ODD/OS...");

    for (const screen of screens.slice(1, starting)) {
      expect(rowText(screen, ROWS - 1)).toBe("Press ESC to skip startup");
    }
  });

  test("clears POST in the same step that shows Starting ODD/OS", () => {
    const starting = screens[firstScreenWith("Starting ODD/OS...")];

    expect(screenText(starting)).not.toContain("BIOS");
    expect(screenText(starting)).not.toContain("Memory Test");
    expect(screenText(starting)).not.toContain("Press ESC");
  });

  test("shows the cursor from the first text onwards", () => {
    expect(screens[0].cursor.visible).toBe(false);
    expect(screens.slice(1).every((screen) => screen.cursor.visible)).toBe(true);
  });

  test("keeps the cursor below the text being written during POST", () => {
    const video = screens[1];
    const header = screens[2];
    const memory = screens[firstScreenWith("8192K OK")];

    expect(video.cursor).toEqual({ row: 2, column: 0, visible: true });
    expect(header.cursor).toEqual({ row: 5, column: 0, visible: true });
    expect(memory.cursor).toEqual({ row: 8, column: 0, visible: true });
  });

  test("ends at C:\\> with the cursor visible in the next cell", () => {
    const row = finalScreen.rows.findIndex(
      (cells) => cells.map((cell) => cell.char).join("").trimEnd() === "C:\\>",
    );

    expect(row).toBeGreaterThan(-1);
    expect(finalScreen.cursor).toEqual({ row, column: 4, visible: true });
  });

  test("echoes the AUTOEXEC.BAT commands above the final prompt", () => {
    expect(rowText(finalScreen, 0)).toBe("Starting ODD/OS...");
    expect(rowText(finalScreen, 2)).toBe("C>PATH C:\\DOS");
    expect(rowText(finalScreen, 3)).toBe("C>PROMPT $P$G");
    expect(rowText(finalScreen, 4)).toBe("C:\\>");
  });

  test("takes between 10 and 14 seconds", () => {
    expect(totalDelay(steps)).toBeGreaterThanOrEqual(10000);
    expect(totalDelay(steps)).toBeLessThanOrEqual(14000);
  });

  test("mentions no key other than Escape", () => {
    const text = screens.map(screenText).join("\n");

    const pressed = [...text.matchAll(/press (\S+)/gi)].map(([, key]) => key);
    expect(pressed.length).toBeGreaterThan(0);
    expect(pressed.every((key) => key === "ESC")).toBe(true);
    expect(text).not.toMatch(/\b(F\d{1,2}|DEL|DELETE|ENTER|TAB|SETUP)\b/);
  });

  test("applySteps reaches the same final screen in one go", () => {
    expect(applySteps(createBootScreen(), steps)).toEqual(finalScreen);
  });
});

describe("createBootSteps with reduced motion", () => {
  const reduced = createBootSteps({ reducedMotion: true });
  const reducedScreens = screensAfterEachStep(reduced);

  test("updates the memory count in only a few steps", () => {
    const counts = memoryCounts(reducedScreens);

    expect(counts.length).toBeLessThanOrEqual(5);
    expect(counts.at(-1)).toBe(8192);
    expect(counts.length).toBeLessThan(memoryCounts(screens).length);
  });

  test("keeps the same total duration", () => {
    expect(totalDelay(reduced)).toBe(totalDelay(steps));
  });

  test("ends on an identical final screen", () => {
    expect(reducedScreens.at(-1)).toEqual(finalScreen);
  });
});
