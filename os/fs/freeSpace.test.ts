import { describe, expect, test } from "vitest";

import { directory, NO_ATTRIBUTES, opaqueFile, textFile } from "./entries";
import { freeBytes } from "./freeSpace";
import { createDirectory, deleteFile, removeDirectory, writeFile } from "./operations";
import { createFilesystem } from "./seed";
import type { Filesystem } from "./types";

const MB = 340;
const CLUSTER = 8192;
const DATA_CLUSTERS = 43_496;
const NOW = new Date(Date.UTC(1993, 10, 2, 14, 30));
const seeded = createFilesystem();

const write = (fs: Filesystem, path: string, text: string) => {
  const result = writeFile(fs, "C:\\", path, text, NOW);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const done = (result: ReturnType<typeof writeFile>) => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("Free space", () => {
  test("a new directory uses one cluster, given back when it is removed", () => {
    const before = freeBytes(seeded, MB);
    const made = done(createDirectory(seeded, "C:\\", "GAMES", NOW));

    expect(before - freeBytes(made, MB)).toBe(CLUSTER);
    expect(freeBytes(done(removeDirectory(made, "C:\\", "GAMES")), MB)).toBe(before);
  });

  test("a deleted file gives its clusters back", () => {
    const before = freeBytes(seeded, MB);
    const withFile = write(seeded, "BIG.TXT", "x".repeat(8193));

    expect(freeBytes(done(deleteFile(withFile, "C:\\", "BIG.TXT")), MB)).toBe(before);
    expect(freeBytes(done(deleteFile(seeded, "C:\\", "README.TXT")), MB)).toBe(before + CLUSTER);
  });

  test("the seeded disk has the data area less 36 clusters", () => {
    expect(freeBytes(seeded, MB)).toBe((DATA_CLUSTERS - 36) * CLUSTER);
  });

  test("is a multiple of the cluster size", () => {
    expect(freeBytes(seeded, MB) % CLUSTER).toBe(0);
  });

  test("falls by whole clusters when a file is written", () => {
    const before = freeBytes(seeded, MB);

    expect(before - freeBytes(write(seeded, "A.TXT", "x"), MB)).toBe(CLUSTER);
    expect(before - freeBytes(write(seeded, "B.TXT", "x".repeat(8193)), MB)).toBe(2 * CLUSTER);
    expect(before - freeBytes(write(seeded, "C.TXT", "x".repeat(8192)), MB)).toBe(CLUSTER);
  });

  test("an empty file uses no clusters", () => {
    expect(freeBytes(write(seeded, "EMPTY.TXT", ""), MB)).toBe(freeBytes(seeded, MB));
  });

  test("replacing a file changes free space by the difference in clusters", () => {
    const small = write(seeded, "README.TXT", "x");
    const large = write(seeded, "README.TXT", "x".repeat(20_000));

    expect(freeBytes(small, MB) - freeBytes(large, MB)).toBe(2 * CLUSTER);
  });

  test("a larger disk has more free space", () => {
    expect(freeBytes(seeded, 340)).toBeGreaterThan(freeBytes(seeded, 300));
  });

  test("uses smaller clusters on smaller disks", () => {
    const one = write(seeded, "A.TXT", "x");

    expect(freeBytes(seeded, 200) - freeBytes(one, 200)).toBe(4096);
    expect(freeBytes(seeded, 600) - freeBytes(one, 600)).toBe(16_384);
  });

  test("hidden and system entries count", () => {
    const WHEN = new Date(Date.UTC(1993, 8, 14, 9, 12));
    const empty: Filesystem = { root: directory("", WHEN) };
    const hidden: Filesystem = {
      root: directory("", WHEN, [
        textFile("H.TXT", WHEN, "h", { ...NO_ATTRIBUTES, hidden: true }),
        opaqueFile("S.SYS", WHEN, 9000, { ...NO_ATTRIBUTES, system: true }),
      ]),
    };

    expect(freeBytes(empty, MB) - freeBytes(hidden, MB)).toBe(3 * CLUSTER);
  });

  test("the root directory uses no clusters but a subdirectory uses one", () => {
    const WHEN = new Date(Date.UTC(1993, 8, 14, 9, 12));
    const empty: Filesystem = { root: directory("", WHEN) };
    const withDirectory: Filesystem = { root: directory("", WHEN, [directory("D", WHEN)]) };

    expect(freeBytes(empty, MB)).toBe(DATA_CLUSTERS * CLUSTER);
    expect(freeBytes(empty, MB) - freeBytes(withDirectory, MB)).toBe(CLUSTER);
  });

  test("a large directory takes more than one cluster", () => {
    const WHEN = new Date(Date.UTC(1993, 8, 14, 9, 12));
    const files = Array.from({ length: 300 }, (_, index) => textFile(`F${index}.TXT`, WHEN, ""));
    const fs: Filesystem = { root: directory("", WHEN, [directory("D", WHEN, files)]) };

    expect(freeBytes({ root: directory("", WHEN) }, MB) - freeBytes(fs, MB)).toBe(2 * CLUSTER);
  });
});
