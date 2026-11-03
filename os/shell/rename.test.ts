import { describe, expect, test } from "vitest";

import { directory, NO_ATTRIBUTES, textFile } from "../fs/entries";
import { createFilesystem } from "../fs/seed";
import type { Attributes, Filesystem } from "../fs/types";
import { fromRoot, lines, NOW, onDisk, type Session } from "./testSession";

const WHEN = new Date(NOW);
const file = (name: string, attributes: Partial<Attributes> = {}) =>
  textFile(name, WHEN, name, { ...NO_ATTRIBUTES, ...attributes });

const disk = (...entries: Filesystem["root"]["entries"]): Filesystem => ({
  root: directory("", WHEN, entries),
});

const rootNames = ({ disk: { filesystem } }: Session) => filesystem.root.entries.map(({ name }) => name);

const DUPLICATE = "Duplicate file name or file not found";

describe("Renaming files", () => {
  test("Renaming keeps the place, contents, date, time and attributes", () => {
    const shipped = createFilesystem().root.entries;
    const renamed = fromRoot("ren readme.txt readme.old");
    const index = shipped.findIndex(({ name }) => name === "README.TXT");

    expect(lines(renamed)).toEqual([]);
    expect(renamed.disk.filesystem.root.entries[index]).toEqual({ ...shipped[index], name: "README.OLD" });
  });

  test("RENAME, in any case", () => {
    expect(rootNames(fromRoot("RENAME ReadMe.Txt notes.txt"))).toContain("NOTES.TXT");
  });

  test("Wildcards", () => {
    expect(rootNames(onDisk(disk(file("A.TXT"), file("B.TXT")), "ren *.txt *.bak"))).toEqual(["A.BAK", "B.BAK"]);
  });

  test("? takes the old name's character", () => {
    expect(rootNames(onDisk(disk(file("NOTE1.TXT"), file("NOTE2.TXT")), "ren note?.txt memo?.txt"))).toEqual([
      "MEMO1.TXT",
      "MEMO2.TXT",
    ]);
  });

  test("a file in another directory stays there", () => {
    const filesystem = disk(directory("SUB", WHEN, [file("X.TXT")]));
    const renamed = onDisk(filesystem, "ren sub\\x.txt y.txt");
    const [sub] = renamed.disk.filesystem.root.entries;

    expect(sub.kind === "directory" && sub.entries.map(({ name }) => name)).toEqual(["Y.TXT"]);
  });
});

describe("REN failures", () => {
  test.each([
    ["Name taken", "ren readme.txt config.sys", DUPLICATE],
    ["Missing file", "ren nothing.txt other.txt", DUPLICATE],
    ["No match", "ren *.xyz *.abc", DUPLICATE],
    ["A path in the new name", "ren readme.txt \\dos\\readme.txt", "Invalid filename or file not found"],
    ["A drive in the new name", "ren readme.txt c:readme.old", "Invalid parameter"],
    ["A directory", "ren oddware games", "Invalid path or file name"],
    ["One parameter", "ren readme.txt", "Required parameter missing"],
    ["No parameters", "ren", "Required parameter missing"],
    ["Three parameters", "ren a b c", "Too many parameters"],
    ["A switch", "ren /x a b", "Invalid switch"],
  ])("%s", (_, line, message) => {
    const tried = fromRoot(line);

    expect(lines(tried)).toEqual([message]);
    expect(tried.disk.filesystem).toEqual(createFilesystem());
  });

  test("hidden and system files count as not found", () => {
    const filesystem = disk(file("H.TXT", { hidden: true }), file("S.TXT", { system: true }));

    expect(lines(onDisk(filesystem, "ren h.txt x.txt"))).toEqual([DUPLICATE]);
    expect(lines(onDisk(filesystem, "ren ?.txt ?.bak"))).toEqual([DUPLICATE]);
  });

  test("a clash leaves that file alone while others are renamed", () => {
    const renamed = onDisk(disk(file("A.TXT"), file("B.TXT"), file("B.BAK")), "ren *.txt *.bak");

    expect(lines(renamed)).toEqual([DUPLICATE]);
    expect(rootNames(renamed)).toEqual(["A.BAK", "B.TXT", "B.BAK"]);
  });
});
