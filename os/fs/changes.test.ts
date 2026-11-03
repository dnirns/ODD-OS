import { describe, expect, test } from "vitest";

import { applyChanges, diskChanges } from "./changes";
import { ARCHIVE, directory, NO_ATTRIBUTES, textFile } from "./entries";
import { createDirectory, deleteFile, listDirectory, readFile, removeDirectory, renameFile, writeFile } from "./operations";
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

describe("diskChanges", () => {
  test("a fresh filesystem has no changes", () => {
    expect(diskChanges(createTestFilesystem(), createTestFilesystem())).toEqual({ removed: [], entries: [] });
  });

  test("a new file in the root is one change with everything it holds", () => {
    const current = write(createTestFilesystem(), "C:\\WORM.LOG", "LOG\r\n");

    expect(diskChanges(createTestFilesystem(), current)).toEqual({
      removed: [],
      entries: [{ directory: [], entry: textFile("WORM.LOG", NOW, "LOG\r\n", ARCHIVE) }],
    });
  });

  test("a file in a subdirectory carries its directory", () => {
    const current = write(createTestFilesystem(), "C:\\ODDWARE\\WORM.DAT", "1");

    expect(diskChanges(createTestFilesystem(), current).entries.map(({ directory }) => directory)).toEqual([
      ["ODDWARE"],
    ]);
  });

  test("a replaced shipped file is a change", () => {
    const current = write(createTestFilesystem(), "C:\\README.TXT", "changed");

    expect(diskChanges(createTestFilesystem(), current).entries.map(({ entry }) => entry.name)).toEqual([
      "README.TXT",
    ]);
  });

  test("a shipped file written back unchanged is not a change", () => {
    const current = write(createTestFilesystem(), "C:\\README.TXT", "hello", WHEN);

    expect(diskChanges(createTestFilesystem(), current)).toEqual({ removed: [], entries: [] });
  });

  test("a shipped file with only a new date is a change", () => {
    const current = write(createTestFilesystem(), "C:\\README.TXT", "hello", LATER);

    expect(diskChanges(createTestFilesystem(), current).entries).toHaveLength(1);
  });

  test("new files come out in the order they were written", () => {
    const first = write(createTestFilesystem(), "C:\\B.TXT", "b");
    const current = write(write(first, "C:\\A.TXT", "a"), "C:\\B.TXT", "b again");

    expect(diskChanges(createTestFilesystem(), current).entries.map(({ entry }) => entry.name)).toEqual([
      "B.TXT",
      "A.TXT",
    ]);
  });
});

describe("applyChanges", () => {
  test("restoring the changes gives back the same disk", () => {
    const shipped = createTestFilesystem();
    const current = write(write(shipped, "C:\\WORM.LOG", "LOG\r\n"), "C:\\ODDWARE\\WORM.DAT", "1");

    expect(applyChanges(createTestFilesystem(), diskChanges(shipped, current))).toEqual(current);
  });

  test("a change to a shipped file replaces it in place", () => {
    const current = write(createTestFilesystem(), "C:\\CONFIG.SYS", "FILES=40\r\n");
    const restored = applyChanges(createTestFilesystem(), diskChanges(createTestFilesystem(), current));

    expect(names(restored)).toEqual(names(createTestFilesystem()));
    expect(text(restored, "C:\\CONFIG.SYS")).toBe("FILES=40\r\n");
  });

  test("new files follow the shipped entries, in order", () => {
    const current = write(write(createTestFilesystem(), "C:\\B.TXT", "b"), "C:\\A.TXT", "a");
    const changes = diskChanges(createTestFilesystem(), current);
    const release = {
      root: { ...createTestFilesystem().root, entries: [...createTestFilesystem().root.entries, textFile("NEWS.TXT", WHEN, "n")] },
    };

    expect(names(applyChanges(release, changes)).slice(-3)).toEqual(["NEWS.TXT", "B.TXT", "A.TXT"]);
  });

  test("Unchanged system files follow the release", () => {
    const current = write(createTestFilesystem(), "C:\\WORM.LOG", "LOG");
    const release = write(createTestFilesystem(), "C:\\README.TXT", "new readme", WHEN);

    const restored = applyChanges(release, diskChanges(createTestFilesystem(), current));

    expect(text(restored, "C:\\README.TXT")).toBe("new readme");
    expect(text(restored, "C:\\WORM.LOG")).toBe("LOG");
  });

  test("New system files arrive", () => {
    const current = write(createTestFilesystem(), "C:\\WORM.LOG", "LOG");
    const release = write(createTestFilesystem(), "C:\\ODDWARE\\PAINT.EXE", "", WHEN);

    const restored = applyChanges(release, diskChanges(createTestFilesystem(), current));

    expect(names(restored, "C:\\ODDWARE")).toContain("PAINT.EXE");
    expect(names(restored)).toContain("WORM.LOG");
  });

  test("The visitor's version wins", () => {
    const current = write(createTestFilesystem(), "C:\\README.TXT", "mine");
    const release = write(createTestFilesystem(), "C:\\README.TXT", "theirs", WHEN);

    expect(text(applyChanges(release, diskChanges(createTestFilesystem(), current)), "C:\\README.TXT")).toBe("mine");
  });

  test("Directory gone", () => {
    const current = write(write(createTestFilesystem(), "C:\\ODDWARE\\WORM.DAT", "1"), "C:\\WORM.LOG", "LOG");
    const release = {
      root: { ...createTestFilesystem().root, entries: createTestFilesystem().root.entries.filter(({ name }) => name !== "ODDWARE") },
    };

    const restored = applyChanges(release, diskChanges(createTestFilesystem(), current));

    expect(names(restored)).toEqual([...names(release), "WORM.LOG"]);
    expect(text(restored, "C:\\WORM.LOG")).toBe("LOG");
  });

  test("Name now a directory", () => {
    const current = write(createTestFilesystem(), "C:\\WORM.LOG", "LOG");
    const shipped = createTestFilesystem();
    const release = { root: { ...shipped.root, entries: [...shipped.root.entries, directory("WORM.LOG", WHEN)] } };

    const restored = applyChanges(release, diskChanges(createTestFilesystem(), current));

    expect(restored).toEqual(release);
  });

  test("the shipped tree passed in is unchanged", () => {
    const shipped = createTestFilesystem();
    const current = write(write(createTestFilesystem(), "C:\\README.TXT", "x"), "C:\\WORM.LOG", "LOG");

    applyChanges(shipped, diskChanges(createTestFilesystem(), current));

    expect(shipped).toEqual(createTestFilesystem());
  });
});

const done = (result: ReturnType<typeof writeFile>) => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const restore = (current: Filesystem, release = createTestFilesystem()) =>
  applyChanges(release, diskChanges(createTestFilesystem(), current));

describe("Directories and removals", () => {
  test("a new directory is kept before the files inside it", () => {
    const current = write(done(createDirectory(createTestFilesystem(), "C:\\", "GAMES", NOW)), "C:\\GAMES\\A.TXT", "a");

    expect(diskChanges(createTestFilesystem(), current).entries).toEqual([
      { directory: [], entry: { kind: "directory", name: "GAMES", modified: NOW, attributes: NO_ATTRIBUTES } },
      { directory: ["GAMES"], entry: textFile("A.TXT", NOW, "a", ARCHIVE) },
    ]);
    expect(restore(current)).toEqual(current);
  });

  test("nested new directories restore with their files", () => {
    const made = done(createDirectory(done(createDirectory(createTestFilesystem(), "C:\\", "A", NOW)), "C:\\", "A\\B", NOW));
    const current = write(made, "C:\\A\\B\\C.TXT", "c");

    expect(restore(current)).toEqual(current);
  });

  test("an empty new directory restores", () => {
    const current = done(createDirectory(createTestFilesystem(), "C:\\ODDWARE", "SAVES", NOW));

    expect(names(restore(current), "C:\\ODDWARE")).toEqual(["SAVES"]);
  });

  test("a deleted shipped file is a removal and stays removed", () => {
    const current = done(deleteFile(createTestFilesystem(), "C:\\", "README.TXT"));

    expect(diskChanges(createTestFilesystem(), current)).toEqual({ removed: [["README.TXT"]], entries: [] });
    expect(restore(current)).toEqual(current);
  });

  test("A removed file stays removed when the release changes it", () => {
    const current = done(deleteFile(createTestFilesystem(), "C:\\", "README.TXT"));
    const release = write(createTestFilesystem(), "C:\\README.TXT", "new readme", WHEN);

    expect(names(restore(current, release))).not.toContain("README.TXT");
  });

  test("a deleted file in a subdirectory carries its path", () => {
    const current = done(deleteFile(createTestFilesystem(), "C:\\", "DOS\\HIMEM.SYS"));

    expect(diskChanges(createTestFilesystem(), current).removed).toEqual([["DOS", "HIMEM.SYS"]]);
  });

  test("a renamed shipped file moves after the shipped entries", () => {
    const current = done(renameFile(createTestFilesystem(), "C:\\", "CONFIG.SYS", "CONFIG.OLD"));
    const restored = restore(current);

    expect(diskChanges(createTestFilesystem(), current).removed).toEqual([["CONFIG.SYS"]]);
    expect(names(restored)).toEqual(["COMMAND.COM", "DOS", "AUTOEXEC.BAT", "ODDWARE", "README.TXT", "CONFIG.OLD"]);
    expect(text(restored, "C:\\CONFIG.OLD")).toBe("FILES=30\r\n");
  });

  test("a removed shipped directory is one removal", () => {
    const current = done(removeDirectory(createTestFilesystem(), "C:\\", "ODDWARE"));

    expect(diskChanges(createTestFilesystem(), current).removed).toEqual([["ODDWARE"]]);
    expect(names(restore(current))).not.toContain("ODDWARE");
  });

  test("a directory removed and made again keeps the shipped place with its new time", () => {
    const current = done(createDirectory(done(removeDirectory(createTestFilesystem(), "C:\\", "ODDWARE")), "C:\\", "ODDWARE", LATER));
    const restored = restore(current);

    expect(names(restored)).toEqual(names(createTestFilesystem()));
    const listed = listDirectory(restored, "C:\\", "C:\\");
    expect(listed.ok && listed.value.find(({ name }) => name === "ODDWARE")?.modified).toEqual(LATER);
  });

  test("new entries keep their listing order, files and directories together", () => {
    const first = write(createTestFilesystem(), "C:\\B.TXT", "b");
    const current = write(done(createDirectory(first, "C:\\", "GAMES", NOW)), "C:\\A.TXT", "a");

    expect(names(restore(current)).slice(-3)).toEqual(["B.TXT", "GAMES", "A.TXT"]);
  });

  test("Removal of something no longer shipped", () => {
    const current = done(deleteFile(write(createTestFilesystem(), "C:\\X.TXT", "x"), "C:\\", "README.TXT"));
    const shipped = createTestFilesystem();
    const release = { root: { ...shipped.root, entries: shipped.root.entries.filter(({ name }) => name !== "README.TXT") } };

    const restored = restore(current, release);

    expect(names(restored)).toEqual([...names(release), "X.TXT"]);
  });

  test("a new directory whose parent is gone is dropped with its contents", () => {
    const made = done(createDirectory(createTestFilesystem(), "C:\\ODDWARE", "SAVES", NOW));
    const current = write(write(made, "C:\\ODDWARE\\SAVES\\A.TXT", "a"), "C:\\WORM.LOG", "LOG");
    const shipped = createTestFilesystem();
    const release = { root: { ...shipped.root, entries: shipped.root.entries.filter(({ name }) => name !== "ODDWARE") } };

    const restored = restore(current, release);

    expect(names(restored)).toEqual([...names(release), "WORM.LOG"]);
  });

  test("a new directory whose name is now a shipped file is dropped with its contents", () => {
    const current = write(done(createDirectory(createTestFilesystem(), "C:\\", "NEWS", NOW)), "C:\\NEWS\\A.TXT", "a");
    const release = write(createTestFilesystem(), "C:\\NEWS", "shipped", WHEN);

    const restored = restore(current, release);

    expect(text(restored, "C:\\NEWS")).toBe("shipped");
  });

  test("a release adding a file to a directory the visitor emptied keeps the new file", () => {
    const current = done(deleteFile(createTestFilesystem(), "C:\\", "DOS\\HIMEM.SYS"));
    const release = write(createTestFilesystem(), "C:\\DOS\\EDIT.COM", "", WHEN);

    expect(names(restore(current, release), "C:\\DOS")).toEqual(["EDIT.COM"]);
  });
});
