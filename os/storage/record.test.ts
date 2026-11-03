import { describe, expect, test } from "vitest";

import { fileChanges } from "../fs/changes";
import { createDisk } from "../fs/disk";
import { ARCHIVE, textFile } from "../fs/entries";
import { writeFile } from "../fs/operations";
import { createFilesystem } from "../fs/seed";
import { FORMAT, readRecord, startingDisk, toRecord } from "./record";

const NOW = new Date(Date.UTC(1993, 10, 2, 14, 30));

const withLog = () => {
  const written = writeFile(createFilesystem(), "C:\\", "C:\\WORM.LOG", "WORM.EXE SESSION LOG\r\n", NOW);
  if (!written.ok) throw new Error(written.error);
  return written.value;
};

const record = () => toRecord(fileChanges(createFilesystem(), withLog()));

const recordWith = (file: Record<string, unknown>, directory: unknown = []) => ({
  format: FORMAT,
  files: [{ directory, file: { ...textFile("WORM.LOG", NOW, "x", ARCHIVE), ...file } }],
});

describe("readRecord", () => {
  test("a record built by toRecord reads back as the same changes", () => {
    expect(readRecord(record())).toEqual({ kind: "changes", changes: record().files });
  });

  test("an empty record has no changes", () => {
    expect(readRecord({ format: 1, files: [] })).toEqual({ kind: "changes", changes: [] });
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
    ["a directory entry", recordWith({ kind: "directory" })],
  ])("%s makes the record invalid", (_, value) => {
    expect(readRecord(value)).toEqual({ kind: "invalid" });
  });

  test("an opaque file is accepted", () => {
    expect(readRecord(recordWith({ content: { kind: "opaque", size: 12 } })).kind).toBe("changes");
  });

  test("a newer format is recognised", () => {
    expect(readRecord({ format: 2, files: "anything" })).toEqual({ kind: "newer" });
  });

  test("restored values are copies, not the stored objects", () => {
    const stored = record();
    const read = readRecord(stored);

    if (read.kind !== "changes") throw new Error(read.kind);
    expect(read.changes[0].file.modified).not.toBe(stored.files[0].file.modified);
  });
});

describe("startingDisk", () => {
  const shipped = createDisk();

  test("nothing stored gives the shipped disk, saving", () => {
    expect(startingDisk({ kind: "read", value: undefined })).toEqual({ disk: shipped, saving: true });
  });

  test("an invalid record gives the shipped disk, saving", () => {
    expect(startingDisk({ kind: "read", value: "garbage" })).toEqual({ disk: shipped, saving: true });
  });

  test.each([
    ["a newer record", { kind: "read", value: { format: 2 } }],
    ["unavailable storage", { kind: "unavailable" }],
    ["a read that timed out", { kind: "timeout" }],
  ] as const)("%s gives the shipped disk, not saving", (_, read) => {
    expect(startingDisk(read)).toEqual({ disk: shipped, saving: false });
  });

  test("valid changes are laid over the shipped disk, saving", () => {
    expect(startingDisk({ kind: "read", value: record() })).toEqual({
      disk: { filesystem: withLog(), cwd: "C:\\" },
      saving: true,
    });
  });
});
