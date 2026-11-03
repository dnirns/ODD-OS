import { describe, expect, test } from "vitest";

import { directory, NO_ATTRIBUTES, textFile } from "../fs/entries";
import { listDirectory } from "../fs/operations";
import { createFilesystem } from "../fs/seed";
import type { Attributes, Filesystem } from "../fs/types";
import type { Session } from "./testSession";
import { fromRoot, lines, NOW, onDisk } from "./testSession";

const WHEN = new Date(NOW);
const file = (name: string, attributes: Partial<Attributes> = {}) =>
  textFile(name, WHEN, name, { ...NO_ATTRIBUTES, ...attributes });

const disk = (...entries: Filesystem["root"]["entries"]): Filesystem => ({
  root: directory("", WHEN, entries),
});

const THREE = disk(file("A.TXT"), file("B.TXT"), file("C.DOC"));

const names = ({ disk: { filesystem } }: Session, path = "\\") => {
  const listed = listDirectory(filesystem, "C:\\", path);
  if (!listed.ok) throw new Error(listed.error);
  return listed.value.map(({ name }) => name);
};

const ALL_FILES = ["All files in directory will be deleted!", "Are you sure (Y/N)?"];

describe("Deleting files", () => {
  test("One file", () => {
    const deleted = fromRoot("del readme.txt");

    expect(lines(deleted)).toEqual([]);
    expect(deleted.result?.type).toBe("files");
    expect(names(deleted)).not.toContain("README.TXT");
  });

  test("A pattern", () => {
    expect(names(onDisk(THREE, "erase *.txt"))).toEqual(["C.DOC"]);
  });

  test("a path in another directory", () => {
    const deleted = onDisk(disk(directory("SUB", WHEN, [file("X.TXT"), file("Y.TXT")])), "del \\sub\\x.txt");

    expect(names(deleted, "\\sub")).toEqual(["Y.TXT"]);
  });

  test("the earlier disk is unchanged", () => {
    onDisk(THREE, "del a.txt");

    expect(onDisk(THREE).disk.filesystem.root.entries).toHaveLength(3);
  });
});

describe("Files DEL leaves alone", () => {
  test("Read-only file", () => {
    const deleted = onDisk(disk(file("A.TXT", { readOnly: true }), file("B.TXT")), "del ?.txt");

    expect(lines(deleted)).toEqual(["Access denied"]);
    expect(names(deleted)).toEqual(["A.TXT"]);
  });

  test("hidden and system files are not matched", () => {
    const filesystem = disk(file("H.TXT", { hidden: true }), file("S.TXT", { system: true }));

    expect(lines(onDisk(filesystem, "del *.txt"))).toEqual(["File not found"]);
    expect(names(onDisk(filesystem, "del h.txt"))).toEqual(["H.TXT", "S.TXT"]);
  });

  test("Subdirectories are kept", () => {
    const filesystem = disk(directory("SUB", WHEN, [file("X.TXT"), directory("INNER", WHEN, [file("Y.TXT")])]));
    const deleted = onDisk(filesystem, "del sub", "y");

    expect(names(deleted, "\\sub")).toEqual(["INNER"]);
    expect(names(deleted, "\\sub\\inner")).toEqual(["Y.TXT"]);
  });
});

describe("DEL failures", () => {
  test.each([
    ["Nothing matches", "del *.xyz", "File not found"],
    ["A missing file", "del nothing.txt", "File not found"],
    ["Missing directory", "del \\nowhere\\a.txt", "Path not found"],
    ["No path", "del", "Required parameter missing"],
    ["A second path", "del a.txt b.txt", "Too many parameters"],
    ["A switch", "del /q a.txt", "Invalid switch"],
    ["Another drive", "del a:\\x.txt", "Invalid drive specification"],
  ])("%s", (_, line, message) => {
    const tried = fromRoot(line);

    expect(lines(tried)).toEqual([message]);
    expect(tried.disk.filesystem).toEqual(createFilesystem());
  });
});

describe("Confirming that every file will be deleted", () => {
  test.each(["*.*", "*", "????????.???", "\\"])("%s asks first", (pattern) => {
    const asked = onDisk(THREE, `del ${pattern}`);

    expect(asked.shown).toEqual(ALL_FILES);
    expect(asked.result?.type).toBe("question");
    expect(names(asked)).toHaveLength(3);
  });

  test("a pattern that matches only some names does not ask", () => {
    expect(onDisk(THREE, "del *.txt").result?.type).toBe("files");
  });

  test("Confirming", () => {
    const deleted = onDisk(THREE, "del *.*", "y");

    expect(names(deleted)).toEqual([]);
    expect(deleted.shown).toEqual(["All files in directory will be deleted!", "Are you sure (Y/N)?y"]);
  });

  test("an answer starting with Y", () => {
    expect(names(onDisk(THREE, "del *.*", "Yes please"))).toEqual([]);
  });

  test("Declining", () => {
    const filesystem = disk(directory("GAMES", WHEN, [file("A.TXT")]));
    const kept = onDisk(filesystem, "del \\games", "n");

    expect(lines(kept)).toEqual([]);
    expect(kept.result?.type).toBe("files");
    expect(names(kept, "\\games")).toEqual(["A.TXT"]);
  });

  test("Asking again", () => {
    const asked = onDisk(THREE, "del *.*", "", "maybe");

    expect(asked.shown).toEqual([...ALL_FILES, "Are you sure (Y/N)?maybe", "Are you sure (Y/N)?"]);
    expect(asked.result?.type).toBe("question");
    expect(names(asked)).toHaveLength(3);
  });
});

describe("Deleting with confirmation for each file", () => {
  test("Choosing files", () => {
    const filesystem = disk(file("A.TXT"), file("B.TXT"));
    const chosen = onDisk(filesystem, "del *.txt /p", "y", "n");

    expect(names(chosen)).toEqual(["B.TXT"]);
    expect(chosen.shown).toEqual(["C:\\A.TXT,    Delete (Y/N)?y", "C:\\B.TXT,    Delete (Y/N)?n"]);
    expect(chosen.result?.type).toBe("files");
  });

  test("the full path of a file in another directory", () => {
    const filesystem = disk(directory("SUB", WHEN, [file("X.TXT")]));

    expect(onDisk(filesystem, "del sub\\x.txt /p").shown).toEqual(["C:\\SUB\\X.TXT,    Delete (Y/N)?"]);
  });

  test("Other answers", () => {
    const asked = onDisk(disk(file("A.TXT")), "del a.txt /p", "x", "");

    expect(asked.shown).toEqual([
      "C:\\A.TXT,    Delete (Y/N)?x",
      "C:\\A.TXT,    Delete (Y/N)?",
      "C:\\A.TXT,    Delete (Y/N)?",
    ]);
    expect(names(asked)).toEqual(["A.TXT"]);
  });

  test("a pattern matching every name does not also ask Are you sure", () => {
    expect(onDisk(THREE, "del *.* /p").shown).toEqual(["C:\\A.TXT,    Delete (Y/N)?"]);
  });

  test("a read-only file reports Access denied before the next question", () => {
    const filesystem = disk(file("A.TXT", { readOnly: true }), file("B.TXT"));
    const asked = onDisk(filesystem, "del *.txt /p", "y");

    expect(asked.shown).toEqual(["C:\\A.TXT,    Delete (Y/N)?y", "Access denied", "C:\\B.TXT,    Delete (Y/N)?"]);
  });

  test("nothing matching prints File not found", () => {
    expect(lines(onDisk(THREE, "del *.xyz /p"))).toEqual(["File not found"]);
  });
});
