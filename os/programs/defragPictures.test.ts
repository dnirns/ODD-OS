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
});
