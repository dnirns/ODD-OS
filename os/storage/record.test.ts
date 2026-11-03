import { describe, expect, test } from "vitest";

import { diskChanges } from "../fs/changes";
import { createDisk } from "../fs/disk";
import { ARCHIVE, NO_ATTRIBUTES, textFile } from "../fs/entries";
import { createDirectory, deleteFile, readFile, writeFile } from "../fs/operations";
import { createFilesystem } from "../fs/seed";
import { FORMAT, readRecord, startingDisk, toRecord } from "./record";

const NOW = new Date(Date.UTC(1993, 10, 2, 14, 30));

const withLog = () => {
  const written = writeFile(createFilesystem(), "C:\\", "C:\\WORM.LOG", "WORM.EXE SESSION LOG\r\n", NOW);
  if (!written.ok) throw new Error(written.error);
  return written.value;
};

const record = () => toRecord(diskChanges(createFilesystem(), withLog()));

const recordWith = (entry: Record<string, unknown>, directory: unknown = []) => ({
  format: FORMAT,
  removed: [],
  entries: [{ directory, entry: { ...textFile("WORM.LOG", NOW, "x", ARCHIVE), ...entry } }],
});

const GAMES = { kind: "directory", name: "GAMES", modified: NOW, attributes: NO_ATTRIBUTES };

describe("readRecord", () => {
  test("a record built by toRecord reads back as the same changes", () => {
    const { removed, entries } = record();
    expect(readRecord(record())).toEqual({ kind: "changes", changes: { removed, entries } });
  });

  test("an empty record has no changes", () => {
    expect(readRecord({ format: 2, removed: [], entries: [] })).toEqual({ kind: "changes", changes: { removed: [], entries: [] } });
  });

  test("directories and removals read back", () => {
    const value = { format: 2, removed: [["README.TXT"], ["DOS", "MEM.EXE"]], entries: [{ directory: [], entry: GAMES }] };

    expect(readRecord(value)).toEqual({ kind: "changes", changes: { removed: value.removed, entries: value.entries } });
  });

  test.each([
    ["null", null],
    ["a string", "garbage"],
    ["no format", { files: [] }],
    ["a fractional format", { format: 1.5, files: [] }],
    ["a string format", { format: "1", files: [] }],
    ["format 0", { format: 0, files: [] }],
    ["files not an array", { format: 1, files: {} }],
    ["a file that is not an object", { format: 1, files: [1] }],
    ["format 2 without removals", { format: 2, entries: [] }],
    ["format 2 without entries", { format: 2, removed: [] }],
    ["an entry that is not an object", { format: 2, removed: [], entries: [1] }],
    ["an empty removal path", { format: 2, removed: [[]], entries: [] }],
    ["an invalid removal name", { format: 2, removed: [["READ ME"]], entries: [] }],
    ["a removal that is not a list", { format: 2, removed: ["README.TXT"], entries: [] }],
    ["a format 1 record holding a directory", { format: 1, files: [{ directory: [], file: GAMES }] }],
  ])("%s is invalid", (_, value) => {
    expect(readRecord(value)).toEqual({ kind: "invalid" });
  });

  test.each([
    ["an invalid name", recordWith({ name: "WORM?.LOG" })],
    ["a lower-case name", recordWith({ name: "worm.log" })],
    ["a name too long", recordWith({ name: "WORMSESSION.LOG" })],
    ["a device name", recordWith({ name: "CON" })],
    ["an invalid directory name", recordWith({}, ["ODD WARE"])],
    ["a directory that is not a list", recordWith({}, "ODDWARE")],
    ["a bad date", recordWith({ modified: new Date(Number.NaN) })],
    ["a date as a string", recordWith({ modified: "1993-11-02" })],
    ["a non-boolean attribute", recordWith({ attributes: { ...ARCHIVE, hidden: 1 } })],
    ["missing attributes", recordWith({ attributes: undefined })],
    ["unknown content", recordWith({ content: { kind: "html", text: "<b>" } })],
    ["text that is not a string", recordWith({ content: { kind: "text", text: 4 } })],
    ["a negative size", recordWith({ content: { kind: "opaque", size: -1 } })],
    ["a fractional size", recordWith({ content: { kind: "opaque", size: 1.5 } })],
    ["a directory with a bad name", recordWith({ ...GAMES, name: "GA ME" })],
    ["a directory with a bad date", recordWith({ ...GAMES, modified: "today" })],
    ["a directory with bad attributes", recordWith({ ...GAMES, attributes: {} })],
    ["an entry of another kind", recordWith({ kind: "link" })],
  ])("%s makes the record invalid", (_, value) => {
    expect(readRecord(value)).toEqual({ kind: "invalid" });
  });

  test("an opaque file is accepted", () => {
    expect(readRecord(recordWith({ content: { kind: "opaque", size: 12 } })).kind).toBe("changes");
  });

  test("a directory entry is accepted", () => {
    expect(readRecord(recordWith(GAMES)).kind).toBe("changes");
  });

  test("a newer format is recognised", () => {
    expect(readRecord({ format: 3, files: "anything" })).toEqual({ kind: "newer" });
  });

  test("a format 1 record from Slice 11 reads as files with no removals", () => {
    const stored = {
      format: 1,
      files: [{ directory: [], file: textFile("WORM.LOG", NOW, "WORM.EXE SESSION LOG\r\n", ARCHIVE) }],
    };

    expect(readRecord(stored)).toEqual({
      kind: "changes",
      changes: { removed: [], entries: [{ directory: [], entry: stored.files[0].file }] },
    });
  });

  test("restored values are copies, not the stored objects", () => {
    const stored = record();
    const read = readRecord(stored);

    if (read.kind !== "changes") throw new Error(read.kind);
    expect(read.changes.entries[0].entry.modified).not.toBe(stored.entries[0].entry.modified);
  });
});

describe("startingDisk", () => {
  const shipped = createDisk();

  test("a high score WORM.EXE wrote is kept beside it", () => {
    const written = writeFile(createFilesystem(), "C:\\", "C:\\ODDWARE\\WORM.HI", "120\r\n", NOW);
    if (!written.ok) throw new Error(written.error);

    const stored = structuredClone(toRecord(diskChanges(createFilesystem(), written.value)));
    const { disk } = startingDisk({ kind: "read", value: stored });
    const read = readFile(disk.filesystem, "C:\\", "C:\\ODDWARE\\WORM.HI");
    const oddware = disk.filesystem.root.entries.find(({ name }) => name === "ODDWARE");

    expect(read.ok && read.value).toEqual({ kind: "text", text: "120\r\n" });
    expect(oddware?.kind === "directory" && oddware.entries.map(({ name }) => name)).toEqual(["WORM.EXE", "WORM.HI"]);
  });

  test("nothing stored gives the shipped disk, saving", () => {
    expect(startingDisk({ kind: "read", value: undefined })).toEqual({ disk: shipped, saving: true });
  });

  test("an invalid record gives the shipped disk, saving", () => {
    expect(startingDisk({ kind: "read", value: "garbage" })).toEqual({ disk: shipped, saving: true });
  });

  test.each([
    ["a newer record", { kind: "read", value: { format: 3 } }],
    ["unavailable storage", { kind: "unavailable" }],
    ["a read that timed out", { kind: "timeout" }],
  ] as const)("%s gives the shipped disk, not saving", (_, read) => {
    expect(startingDisk(read)).toEqual({ disk: shipped, saving: false });
  });

  test("Returning visitor: a format 1 record restores its files", () => {
    const stored = { format: 1, files: [{ directory: [], file: textFile("WORM.LOG", NOW, "WORM.EXE SESSION LOG\r\n", ARCHIVE) }] };

    expect(startingDisk({ kind: "read", value: stored })).toEqual({ disk: { filesystem: withLog(), cwd: "C:\\" }, saving: true });
  });

  test("a deleted file and a new directory survive storage", () => {
    const made = createDirectory(createFilesystem(), "C:\\", "GAMES", NOW);
    if (!made.ok) throw new Error(made.error);
    const deleted = deleteFile(made.value, "C:\\", "README.TXT");
    if (!deleted.ok) throw new Error(deleted.error);

    const stored = structuredClone(toRecord(diskChanges(createFilesystem(), deleted.value)));

    expect(startingDisk({ kind: "read", value: stored }).disk.filesystem).toEqual(deleted.value);
  });

  test("valid changes are laid over the shipped disk, saving", () => {
    expect(startingDisk({ kind: "read", value: record() })).toEqual({
      disk: { filesystem: withLog(), cwd: "C:\\" },
      saving: true,
    });
  });
});
