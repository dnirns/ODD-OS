import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import { NOISE_GLYPHS, opaqueNoise } from "./noise";

const FONT = fileURLToPath(new URL("../../app/fonts/MorePerfectDOSVGA.ttf", import.meta.url));

// The code points a TrueType font maps, read from its format 4 or format 12
// cmap subtable.
const mappedCodePoints = (path: string): ReadonlySet<number> => {
  const data = readFileSync(path);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tables = view.getUint16(4);
  const directory = Array.from({ length: tables }, (_, index) => 12 + index * 16).find(
    (offset) => data.toString("latin1", offset, offset + 4) === "cmap",
  );
  if (directory === undefined) throw new Error("no cmap table");

  const cmap = view.getUint32(directory + 8);
  const subtables = view.getUint16(cmap + 2);
  const found = new Set<number>();

  for (let index = 0; index < subtables; index += 1) {
    const start = cmap + view.getUint32(cmap + 4 + index * 8 + 4);
    const format = view.getUint16(start);

    if (format === 4) {
      const segments = view.getUint16(start + 6) / 2;
      const ends = start + 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const ranges = deltas + segments * 2;

      for (let segment = 0; segment < segments; segment += 1) {
        const last = view.getUint16(ends + segment * 2);
        const first = view.getUint16(starts + segment * 2);
        const offset = view.getUint16(ranges + segment * 2);

        for (let code = first; code <= last && code !== 0xffff; code += 1) {
          const glyph =
            offset === 0
              ? (code + view.getInt16(deltas + segment * 2)) & 0xffff
              : view.getUint16(ranges + segment * 2 + offset + (code - first) * 2);
          if (glyph !== 0) found.add(code);
        }
      }
    }

    if (format === 12) {
      const groups = view.getUint32(start + 12);
      for (let group = 0; group < groups; group += 1) {
        const at = start + 16 + group * 12;
        for (let code = view.getUint32(at); code <= view.getUint32(at + 4); code += 1) {
          found.add(code);
        }
      }
    }
  }

  return found;
};

const GLYPHS = new Set(NOISE_GLYPHS);

describe("Displaying an opaque file", () => {
  test("gives the same output every time", () => {
    expect(opaqueNoise("C:\\COMMAND.COM", 53_214)).toEqual(opaqueNoise("C:\\COMMAND.COM", 53_214));
  });

  test("gives different output for different files", () => {
    expect(opaqueNoise("C:\\COMMAND.COM", 53_214)).not.toEqual(
      opaqueNoise("C:\\DOS\\HIMEM.SYS", 29_104),
    );
  });

  test("depends on the size as well as the path", () => {
    expect(opaqueNoise("C:\\A.COM", 1000)).not.toEqual(opaqueNoise("C:\\A.COM", 1001));
  });

  test("ignores the letter case of the path", () => {
    expect(opaqueNoise("c:\\command.com", 53_214)).toEqual(opaqueNoise("C:\\COMMAND.COM", 53_214));
  });

  test("never calls Math.random", () => {
    const random = vi.spyOn(Math, "random");
    opaqueNoise("C:\\COMMAND.COM", 53_214);

    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  test("shows at most four rows of at most 80 characters", () => {
    const rows = opaqueNoise("C:\\COMMAND.COM", 53_214);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(4);
    rows.forEach((row) => {
      expect(row.length).toBeGreaterThan(0);
      expect(row.length).toBeLessThanOrEqual(80);
    });
  });

  test("never shows more characters than the file has", () => {
    expect(opaqueNoise("C:\\TINY.COM", 5).join("").length).toBe(5);
    expect(opaqueNoise("C:\\EMPTY.COM", 0)).toEqual([]);
  });

  test("breaks lines occasionally", () => {
    const rowLengths = Array.from({ length: 200 }, (_, index) =>
      opaqueNoise(`C:\\F${index}.COM`, 1000).map((row) => row.length),
    ).flat();

    expect(rowLengths.some((length) => length < 80)).toBe(true);
  });

  test("uses only printable ASCII and CP437 0x80 to 0xFE", () => {
    const characters = Array.from({ length: 200 }, (_, index) =>
      opaqueNoise(`C:\\F${index}.COM`, 5000).join(""),
    ).join("");

    expect(Array.from(characters).every((char) => GLYPHS.has(char))).toBe(true);
    expect(NOISE_GLYPHS).toHaveLength(95 + 127);
    expect(new Set(NOISE_GLYPHS).size).toBe(NOISE_GLYPHS.length);
    expect(NOISE_GLYPHS.every((char) => char >= " " && char !== "\u007f")).toBe(true);
  });

  test("uses the high glyphs as well as ASCII", () => {
    const characters = Array.from({ length: 50 }, (_, index) =>
      opaqueNoise(`C:\\F${index}.COM`, 5000).join(""),
    ).join("");

    expect(Array.from(characters).some((char) => char > "~")).toBe(true);
  });
});

describe("the noise glyph list", () => {
  const mapped = mappedCodePoints(FONT);

  test("reads the font's character map", () => {
    expect(mapped.has("A".codePointAt(0) ?? 0)).toBe(true);
    expect(mapped.size).toBeGreaterThan(200);
  });

  test("is drawn entirely by the bundled font", () => {
    const missing = NOISE_GLYPHS.filter((char) => !mapped.has(char.codePointAt(0) ?? 0));

    expect(missing).toEqual([]);
  });

  test("would catch a glyph the font lacks", () => {
    expect(mapped.has(0x1f600)).toBe(false);
  });
});
