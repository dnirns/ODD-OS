import { describe, expect, test } from "vitest";

import { createPicture, PICTURE_NAMES, pictureFor, silhouette } from "./defragPictures";
import { randomStream } from "./random";

const COLUMNS = 78;
const ROWS = 17;
const MAP = COLUMNS * ROWS;

const make = (name: (typeof PICTURE_NAMES)[number], seed = 1) =>
  createPicture(name, randomStream(seed), COLUMNS, ROWS);

describe("The pictures", () => {
  test("the smiley comes first, the set in order, then the smiley again", () => {
    expect(pictureFor(0)).toBe("smiley");
    expect(pictureFor(1)).toBe("alien");
    expect(PICTURE_NAMES.map((_, number) => pictureFor(number))).toEqual([
      "smiley",
      "alien",
      "yinYang",
      "lavaLamp",
      "peace",
      "eye",
    ]);
    expect(pictureFor(6)).toBe("smiley");
  });

  test.each(PICTURE_NAMES)("%s covers the map without crowding it", (name) => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const cells = silhouette(make(name, seed)).length;

      expect(cells).toBeGreaterThan(MAP * 0.12);
      expect(cells).toBeLessThan(MAP * 0.5);
    }
  });

  test.each(PICTURE_NAMES)("%s keeps its silhouette in every frame", (name) => {
    const picture = make(name);
    const shape = (frame: number) => picture.frame(frame).map((color) => color !== undefined);

    for (const frame of [1, 7, 20, 33, 59, 100]) expect(shape(frame)).toEqual(shape(0));
    expect(picture.frame(0)).toHaveLength(MAP);
  });

  test.each(PICTURE_NAMES)("%s animates", (name) => {
    const picture = make(name);
    const frames = Array.from({ length: 120 }, (_, frame) => picture.frame(frame).join());

    expect(new Set(frames).size).toBeGreaterThan(1);
  });

  test.each(PICTURE_NAMES)("%s varies with the seed", (name) => {
    expect(make(name, 1).frame(0)).not.toEqual(make(name, 2).frame(0));
  });

  test("a fixed seed gives a fixed picture", () => {
    expect(make("smiley", 5).frame(0)).toEqual(make("smiley", 5).frame(0));
  });

  test("the smiley is yellow with black features", () => {
    const colors = new Set(make("smiley").frame(0).filter((color) => color !== undefined));

    expect(colors).toEqual(new Set(["yellow", "black"]));
  });

  test("the smiley is round: as wide in cells as 2.4 times its height", () => {
    const frame = make("smiley").frame(0);
    const rows = new Set(silhouette(make("smiley")).map((index) => Math.floor(index / COLUMNS)));
    const middle = frame.slice(8 * COLUMNS, 9 * COLUMNS).filter((color) => color !== undefined).length;

    expect(middle / rows.size).toBeGreaterThan(2);
    expect(middle / rows.size).toBeLessThan(2.8);
  });

  test("the smiley winks", () => {
    const picture = make("smiley");
    const black = (frame: number) => picture.frame(frame).filter((color) => color === "black").length;
    const counts = new Set(Array.from({ length: 40 }, (_, frame) => black(frame)));

    expect(counts.size).toBe(2);
  });

  describe("the eye", () => {
    const at = (frame: readonly (string | undefined)[], row: number, column: number) =>
      row < 0 || row >= ROWS || column < 0 || column >= COLUMNS ? undefined : frame[row * COLUMNS + column];
    const cells = (frame: readonly (string | undefined)[], wanted: (color: string | undefined) => boolean) =>
      frame.flatMap((color, index) => (wanted(color) ? [{ row: Math.floor(index / COLUMNS), column: index % COLUMNS }] : []));

    test.each([1, 2, 3, 99])("its white is held inside a black lid line (seed %i)", (seed) => {
      const frame = make("eye", seed).frame(0);
      const white = cells(frame, (color) => color === "white" || color === "light-cyan");

      expect(white.length).toBeGreaterThan(0);
      for (const { row, column } of white) {
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) expect(at(frame, row + dr, column + dc)).toBeDefined();
      }
      expect(cells(frame, (color) => color === "black").length).toBeGreaterThan(white.length * 0.15);
    });

    test.each([1, 2, 3, 99])("lashes rise above the top lid (seed %i)", (seed) => {
      const frame = make("eye", seed).frame(0);
      const firstWhite = (column: number) =>
        Math.min(...cells(frame, (color) => color === "white").filter((cell) => cell.column === column).map(({ row }) => row));
      // A lash is a black stroke one cell wide, above the white of its column.
      const lashes = cells(frame, (color) => color === "black").filter(
        ({ row, column }) =>
          at(frame, row, column - 1) === undefined && at(frame, row, column + 1) === undefined && row < firstWhite(column),
      );

      expect(new Set(lashes.map(({ column }) => column)).size).toBeGreaterThanOrEqual(4);
    });

    test("it tapers to points: its widest row is far wider than its end rows", () => {
      const frame = make("eye").frame(0);
      const widths = Array.from({ length: ROWS }, (_, row) => frame.slice(row * COLUMNS, (row + 1) * COLUMNS).filter((color) => color !== undefined && color !== "black").length);
      const inner = widths.filter((width) => width > 0);

      expect(Math.max(...inner)).toBeGreaterThan(inner[0] * 2.5);
      expect(Math.max(...inner)).toBeGreaterThan(inner.at(-1)! * 2.5);
    });
  });
});
