import { describe, expect, test } from "vitest";

import { createDisk, type Disk } from "../fs/disk";
import { directory, NO_ATTRIBUTES, textFile } from "../fs/entries";
import { listDirectory } from "../fs/operations";
import { createFilesystem } from "../fs/seed";
import type { Filesystem } from "../fs/types";
import { DOS_NOW, fromRoot, lines, NOW, session } from "./testSession";

const names = (disk: Disk, path: string) => {
  const listed = listDirectory(disk.filesystem, disk.cwd, path);
  if (!listed.ok) throw new Error(listed.error);
  return listed.value.map(({ name }) => name);
};

const NOT_REMOVED = ["Invalid path, not directory,", "or directory not empty"];

describe("Making a directory", () => {
  test("New directory: added at the end, empty, dated by the DOS clock", () => {
    const made = fromRoot("md games");

    expect(made.result).toEqual({ type: "files", disk: made.disk, lines: [] });
    expect(names(made.disk, "\\").at(-1)).toBe("GAMES");
    expect(names(made.disk, "\\games")).toEqual([]);
    const games = made.disk.filesystem.root.entries.at(-1);
    expect(games).toEqual({ ...directory("GAMES", DOS_NOW, []), attributes: NO_ATTRIBUTES });
  });

  test("Either name, any case", () => {
    expect(names(fromRoot("MKDIR \\Notes").disk, "\\")).toContain("NOTES");
  });

  test("a relative path in the working directory", () => {
    const made = fromRoot("cd dos", "md new", "cd \\");

    expect(names(made.disk, "\\dos").at(-1)).toBe("NEW");
  });

  test("the earlier disk is unchanged", () => {
    const disk = createDisk();
    session(disk, "md games");

    expect(disk.filesystem).toEqual(createFilesystem());
  });
});

describe("Failing to make a directory", () => {
  test.each([
    ["Already there", "md dos", "Directory already exists"],
    ["A file of that name", "md readme.txt", "Unable to create directory"],
    ["Missing parent", "md \\nowhere\\games", "Unable to create directory"],
    ["An invalid name", "md a*b", "Unable to create directory"],
    ["A device name", "md nul", "Unable to create directory"],
    ["No path", "md", "Required parameter missing"],
    ["A second path", "md one two", "Too many parameters"],
    ["A switch", "md /x games", "Invalid switch"],
    ["Another drive", "md a:\\games", "Invalid drive specification"],
  ])("%s", (_, line, message) => {
    const tried = fromRoot(line);

    expect(lines(tried)).toEqual([message]);
    expect(tried.disk.filesystem).toEqual(createFilesystem());
  });

  test("a path from the root up to 63 characters, and no longer", () => {
    const levels = Array.from({ length: 7 }, (_, index) => `\\DIR${index}LONG`);
    const paths = levels.map((_, index) => levels.slice(0, index + 1).join(""));
    const made = fromRoot(...paths.map((path) => `md ${path}`));

    expect(paths.at(-1)).toHaveLength(63);
    expect(lines(made)).toEqual([]);
    expect(lines(session(made.disk, `md ${paths.at(-1)}\\X`))).toEqual(["Unable to create directory"]);
  });
});

describe("Removing a directory", () => {
  test("Empty directory", () => {
    const removed = fromRoot("md games", "rd games");

    expect(lines(removed)).toEqual([]);
    expect(removed.disk.filesystem).toEqual(createFilesystem());
  });

  test("RMDIR removes too", () => {
    expect(fromRoot("md games", "RMDIR \\GAMES").disk.filesystem).toEqual(createFilesystem());
  });

  test("Not empty", () => {
    const tried = fromRoot("rd dos");

    expect(lines(tried)).toEqual(NOT_REMOVED);
    expect(tried.disk.filesystem).toEqual(createFilesystem());
  });

  test("Hidden contents", () => {
    const hidden = textFile("SECRET.TXT", new Date(NOW), "x", { ...NO_ATTRIBUTES, hidden: true });
    const filesystem: Filesystem = {
      root: { ...createFilesystem().root, entries: [directory("VAULT", new Date(NOW), [hidden])] },
    };

    expect(lines(session({ filesystem, cwd: "C:\\" }, "rd vault"))).toEqual(NOT_REMOVED);
  });

  test("Current directory", () => {
    const tried = fromRoot("md games", "cd games", "rd \\games");

    expect(lines(tried)).toEqual(["Attempt to remove current directory - C:\\GAMES"]);
    expect(names(tried.disk, "\\")).toContain("GAMES");
  });

  test.each([
    ["A file", "rd readme.txt", NOT_REMOVED],
    ["A missing path", "rd nowhere", NOT_REMOVED],
    ["The root", "rd \\", NOT_REMOVED],
    ["No path", "rd", ["Required parameter missing"]],
  ])("%s", (_, line, expected) => {
    const tried = fromRoot(line);

    expect(lines(tried)).toEqual(expected);
    expect(tried.disk.filesystem).toEqual(createFilesystem());
  });
});
