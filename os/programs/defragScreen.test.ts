import { describe, expect, test } from "vitest";

import { createDisk } from "../fs/disk";
import { createClock } from "../shell/clock";
import { COLUMNS, ROWS, type Screen } from "../terminal/screen";
import { MACHINE } from "../machine";
import { advanceDefrag, ANALYSIS_TICKS, type DefragState, startDefrag, TICK_MS } from "./defragRun";
import { BOX_TOP, drawDefrag, elapsed, MAP_LEFT, MAP_TOP, PRODUCT, STATUS_ROW } from "./defragScreen";
import { programmeFiles } from "./files";
import type { ProgrammeKey } from "./types";

const NOW = Date.UTC(2026, 10, 1, 12, 0);
const files = programmeFiles("C:\\DOS", createClock(NOW));

const start = () => startDefrag({ disk: createDisk(), files, capacityMb: MACHINE.fixedDiskMb, moveHidden: false, method: undefined, chooseDrive: false, seed: 5 });

const step = (state: DefragState, ...events: readonly ("tick" | ProgrammeKey["type"])[]) =>
  events.reduce(
    (current, event) =>
      advanceDefrag(current, event === "tick" ? { type: "tick", now: NOW } : { type: "key", key: { type: event } as ProgrammeKey, now: NOW }),
    state,
  );

const ticks = (state: DefragState, count: number) => step(state, ...Array.from({ length: count }, () => "tick" as const));

const text = (screen: Screen, row: number) => screen.rows[row].map((cell) => cell.char).join("");
const all = (screen: Screen) => screen.rows.map((_, row) => text(screen, row)).join("\n");
const analysed = () => ticks(start(), ANALYSIS_TICKS);

describe("DEFRAG screen", () => {
  test("is 80 by 25 on a blue background, with the cursor hidden", () => {
    const screen = drawDefrag(analysed());

    expect(screen.rows).toHaveLength(ROWS);
    expect(screen.rows.every((row) => row.length === COLUMNS)).toBe(true);
    expect(screen.rows[10][0].bg).toBe("blue");
    expect(screen.cursor.visible).toBe(false);
  });

  test("the starting drive list sits over an empty map", () => {
    const choosing = startDefrag({ disk: createDisk(), files, capacityMb: MACHINE.fixedDiskMb, moveHidden: false, method: undefined, chooseDrive: true, seed: 5 });
    const screen = drawDefrag(choosing);
    const map = screen.rows.slice(MAP_TOP, BOX_TOP).flatMap((row) => row.slice(MAP_LEFT, MAP_LEFT + 78));

    expect(all(screen)).toContain("Select Drive");
    expect(map.some((cell) => cell.char === "X" || (cell.char === "█" && cell.fg === "white"))).toBe(false);
  });

  test("the focused button of a dialog with a list is highlighted", () => {
    const dialog = step(analysed(), "escape", "f10", "down", "enter");
    const row = (state: DefragState) => drawDefrag(state).rows.findIndex((cells) => cells.map((cell) => cell.char).join("").includes("< OK >"));
    const highlighted = (state: DefragState, label: string) => {
      const screen = drawDefrag(state);
      const line = text(screen, row(state));
      return screen.rows[row(state)][line.indexOf(label)].bg === "black";
    };

    expect(highlighted(dialog, "< OK >")).toBe(false);
    expect(highlighted(step(dialog, "tab"), "< OK >")).toBe(true);
    expect(highlighted(step(dialog, "tab", "tab"), "< Cancel >")).toBe(true);
    expect(highlighted(step(dialog, "tab", "tab"), "< OK >")).toBe(false);
  });

  test("the menu bar, map, boxes and status line are in place", () => {
    const screen = drawDefrag(ticks(analysed(), 0));

    expect(text(screen, 0)).toContain("Optimize");
    expect(text(screen, BOX_TOP)).toContain(" Status ");
    expect(text(screen, BOX_TOP)).toContain(" Legend ");
    expect(text(screen, STATUS_ROW)).toContain(PRODUCT);
    expect(screen.rows[MAP_TOP][MAP_LEFT].char).toBe("X");
  });

  test("the legend names every block and the clusters per block", () => {
    const legend = all(drawDefrag(analysed()));

    for (const entry of ["█ - Used", "░ - Unused", "r - Reading", "W - Writing", "B - Bad", "X - Unmovable"]) {
      expect(legend).toContain(entry);
    }
    expect(legend).toContain("1 block = 33 clusters");
  });

  test("the recommendation dialog", () => {
    const screen = all(drawDefrag(analysed()));

    expect(screen).toMatch(/\d+% of drive C: is not fragmented\./);
    expect(screen).toContain("Recommended optimization method:");
    expect(screen).toContain("Full Optimization");
    expect(screen).toContain("< Optimize >");
    expect(screen).toContain("< Configure >");
  });

  test("the menu lists its items", () => {
    const screen = all(drawDefrag(step(analysed(), "escape", "f10")));

    for (const item of ["Begin Optimization", "Drive...", "Optimization Method...", "About Defrag...", "Exit"]) {
      expect(screen).toContain(item);
    }
  });

  test("elapsed time", () => {
    expect(elapsed(13_000 / TICK_MS)).toBe("00:00:13");
    expect(all(drawDefrag({ ...analysed(), elapsedTicks: 13_000 / TICK_MS }))).toContain("Elapsed Time: 00:00:13");
  });

  test("reading and writing are shown on the map", () => {
    const screen = all(drawDefrag({ ...analysed(), reading: [500], writing: [501] }));

    expect(screen.split("\n")[MAP_TOP + 6]).toContain("rW");
  });

  test("picture blocks take their colour", () => {
    const state = analysed();
    const blocks = state.blocks.map((block, index) => (index === 400 ? { kind: "picture" as const, color: "yellow" as const } : block));
    const cell = drawDefrag({ ...state, blocks }).rows[MAP_TOP + 5][MAP_LEFT + 400 - 5 * 78];

    expect(cell).toEqual({ char: "█", fg: "yellow", bg: "blue" });
  });
});
