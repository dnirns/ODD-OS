import { describe, expect, test } from "vitest";

import { applyChanges, fileChanges } from "./changes";
import { ARCHIVE, directory, textFile } from "./entries";
import { listDirectory, readFile, writeFile } from "./operations";
import { createTestFilesystem } from "./testTree";
import type { Filesystem } from "./types";

const NOW = new Date(Date.UTC(1993, 10, 2, 14, 30));
const LATER = new Date(Date.UTC(1993, 10, 3, 9, 5));
const WHEN = new Date(Date.UTC(1993, 8, 14, 9, 31));

const write = (fs: Filesystem, path: string, text: string, when = NOW) => {
  const result = writeFile(fs, "C:\\", path, text, when);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const names = (fs: Filesystem, path = "C:\\") => {
  const result = listDirectory(fs, "C:\\", path);
  if (!result.ok) throw new Error(result.error);
  return result.value.map(({ name }) => name);
};

const text = (fs: Filesystem, path: string) => {
  const result = readFile(fs, "C:\\", path);
  return result.ok && result.value.kind === "text" ? result.value.text : result;
};

describe("fileChanges", () => {
  test("a fresh filesystem has no changes", () => {
    expect(fileChanges(createTestFilesystem(), createTestFilesystem())).toEqual([]);
  });

  test("a new file in the root is one change with everything it holds", () => {
    const current = write(createTestFilesystem(), "C:\\WORM.LOG", "LOG\r\n");

    expect(fileChanges(createTestFilesystem(), current)).toEqual([
      { directory: [], file: textFile("WORM.LOG", NOW, "LOG\r\n", ARCHIVE) },
    ]);
  });

  test("a file in a subdirectory carries its directory", () => {
    const current = write(createTestFilesystem(), "C:\\ODDWARE\\WORM.DAT", "1");

    expect(fileChanges(createTestFilesystem(), current).map(({ directory }) => directory)).toEqual([
      ["ODDWARE"],
    ]);
  });

  test("a replaced shipped file is a change", () => {
    const current = write(createTestFilesystem(), "C:\\README.TXT", "changed");

    expect(fileChanges(createTestFilesystem(), current).map(({ file }) => file.name)).toEqual([
      "README.TXT",
    ]);
  });

  test("a shipped file written back unchanged is not a change", () => {
    const current = write(createTestFilesystem(), "C:\\README.TXT", "hello", WHEN);

    expect(fileChanges(createTestFilesystem(), current)).toEqual([]);
  });

  test("a shipped file with only a new date is a change", () => {
    const current = write(createTestFilesystem(), "C:\\README.TXT", "hello", LATER);

    expect(fileChanges(createTestFilesystem(), current)).toHaveLength(1);
  });

  test("new files come out in the order they were written", () => {
    const first = write(createTestFilesystem(), "C:\\B.TXT", "b");
    const current = write(write(first, "C:\\A.TXT", "a"), "C:\\B.TXT", "b again");

    expect(fileChanges(createTestFilesystem(), current).map(({ file }) => file.name)).toEqual([
      "B.TXT",
      "A.TXT",
    ]);
  });
});

describe("applyChanges", () => {
  test("restoring the changes gives back the same disk", () => {
    const shipped = createTestFilesystem();
    const current = write(write(shipped, "C:\\WORM.LOG", "LOG\r\n"), "C:\\ODDWARE\\WORM.DAT", "1");

    expect(applyChanges(createTestFilesystem(), fileChanges(shipped, current))).toEqual(current);
  });

  test("a change to a shipped file replaces it in place", () => {
    const current = write(createTestFilesystem(), "C:\\CONFIG.SYS", "FILES=40\r\n");
    const restored = applyChanges(createTestFilesystem(), fileChanges(createTestFilesystem(), current));

    expect(names(restored)).toEqual(names(createTestFilesystem()));
    expect(text(restored, "C:\\CONFIG.SYS")).toBe("FILES=40\r\n");
  });

  test("new files follow the shipped entries, in order", () => {
    const current = write(write(createTestFilesystem(), "C:\\B.TXT", "b"), "C:\\A.TXT", "a");
    const changes = fileChanges(createTestFilesystem(), current);
    const release = {
      root: { ...createTestFilesystem().root, entries: [...createTestFilesystem().root.entries, textFile("NEWS.TXT", WHEN, "n")] },
    };

    expect(names(applyChanges(release, changes)).slice(-3)).toEqual(["NEWS.TXT", "B.TXT", "A.TXT"]);
  });

  test("Unchanged system files follow the release", () => {
    const current = write(createTestFilesystem(), "C:\\WORM.LOG", "LOG");
    const release = write(createTestFilesystem(), "C:\\README.TXT", "new readme", WHEN);

    const restored = applyChanges(release, fileChanges(createTestFilesystem(), current));

    expect(text(restored, "C:\\README.TXT")).toBe("new readme");
    expect(text(restored, "C:\\WORM.LOG")).toBe("LOG");
  });

  test("New system files arrive", () => {
    const current = write(createTestFilesystem(), "C:\\WORM.LOG", "LOG");
    const release = write(createTestFilesystem(), "C:\\ODDWARE\\PAINT.EXE", "", WHEN);

    const restored = applyChanges(release, fileChanges(createTestFilesystem(), current));

    expect(names(restored, "C:\\ODDWARE")).toContain("PAINT.EXE");
    expect(names(restored)).toContain("WORM.LOG");
  });

  test("The visitor's version wins", () => {
    const current = write(createTestFilesystem(), "C:\\README.TXT", "mine");
    const release = write(createTestFilesystem(), "C:\\README.TXT", "theirs", WHEN);

    expect(text(applyChanges(release, fileChanges(createTestFilesystem(), current)), "C:\\README.TXT")).toBe("mine");
  });

  test("Directory gone", () => {
    const current = write(write(createTestFilesystem(), "C:\\ODDWARE\\WORM.DAT", "1"), "C:\\WORM.LOG", "LOG");
    const release = {
      root: { ...createTestFilesystem().root, entries: createTestFilesystem().root.entries.filter(({ name }) => name !== "ODDWARE") },
    };

    const restored = applyChanges(release, fileChanges(createTestFilesystem(), current));

    expect(names(restored)).toEqual([...names(release), "WORM.LOG"]);
    expect(text(restored, "C:\\WORM.LOG")).toBe("LOG");
  });

  test("Name now a directory", () => {
    const current = write(createTestFilesystem(), "C:\\WORM.LOG", "LOG");
    const shipped = createTestFilesystem();
    const release = { root: { ...shipped.root, entries: [...shipped.root.entries, directory("WORM.LOG", WHEN)] } };

    const restored = applyChanges(release, fileChanges(createTestFilesystem(), current));

    expect(restored).toEqual(release);
  });

  test("the shipped tree passed in is unchanged", () => {
    const shipped = createTestFilesystem();
    const current = write(write(createTestFilesystem(), "C:\\README.TXT", "x"), "C:\\WORM.LOG", "LOG");

    applyChanges(shipped, fileChanges(createTestFilesystem(), current));

    expect(shipped).toEqual(createTestFilesystem());
  });
});
