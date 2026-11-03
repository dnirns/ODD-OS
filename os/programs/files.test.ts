import { describe, expect, test } from "vitest";

import type { Disk } from "../fs/disk";
import { ARCHIVE, directory, textFile } from "../fs/entries";
import { readFile } from "../fs/operations";
import { resolvePath } from "../fs/path";
import { programmeFiles } from "./files";

const WHEN = new Date(Date.UTC(1993, 8, 20, 16, 48));
const NOW = Date.UTC(2026, 10, 3, 12, 0);
const CLOCK = { offsetMs: Date.UTC(1993, 10, 3, 16, 52) - NOW };

const disk = (cwd = "C:\\"): Disk => ({
  filesystem: {
    root: directory("", WHEN, [
      directory("DOS", WHEN),
      directory("ODDWARE", WHEN, [directory("SUB", WHEN)]),
      directory("TAKEN.LOG", WHEN),
      textFile("LOCKED.LOG", WHEN, "old", { ...ARCHIVE, readOnly: true }),
    ]),
  },
  cwd,
});

const files = programmeFiles("C:\\ODDWARE", CLOCK);

const write = (path: string, cwd?: string) => files.write(disk(cwd), path, "text", NOW);

const textAt = (result: ReturnType<typeof write>, path: string) => {
  if (!result.ok) return result.error;
  const read = readFile(result.value.filesystem, "C:\\", path);
  return read.ok && read.value.kind === "text" ? read.value.text : read;
};

describe("Programmes write files through the runtime", () => {
  test("Root of the drive", () => {
    expect(textAt(write("C:\\WORM.LOG"), "C:\\WORM.LOG")).toBe("text");
  });

  test("Own directory", () => {
    expect(textAt(write("C:\\ODDWARE\\WORM.DAT"), "C:\\ODDWARE\\WORM.DAT")).toBe("text");
  });

  test("Another directory", () => {
    const original = disk();
    const result = files.write(original, "C:\\DOS\\WORM.LOG", "text", NOW);

    expect(result).toEqual({ ok: false, error: "AccessDenied" });
  });

  test("Below its own directory", () => {
    expect(write("C:\\ODDWARE\\SUB\\X.TXT")).toEqual({ ok: false, error: "AccessDenied" });
  });

  test("Relative paths", () => {
    expect(textAt(write("..\\WORM.LOG", "C:\\ODDWARE"), "C:\\WORM.LOG")).toBe("text");
    expect(textAt(write("\\worm.log", "C:\\ODDWARE"), "C:\\WORM.LOG")).toBe("text");
    expect(textAt(write("x.txt", "C:\\ODDWARE"), "C:\\ODDWARE\\X.TXT")).toBe("text");
    expect(write("x.txt", "C:\\DOS")).toEqual({ ok: false, error: "AccessDenied" });
  });

  test("Ordinary filesystem errors", () => {
    expect(write("C:\\TAKEN.LOG")).toEqual({ ok: false, error: "IsADirectory" });
    expect(write("C:\\LOCKED.LOG")).toEqual({ ok: false, error: "AccessDenied" });
    expect(write("C:\\MISSING\\A.TXT")).toEqual({ ok: false, error: "PathNotFound" });
    expect(write("")).toMatchObject({ ok: false });
  });

  test("The same rule for every programme", () => {
    const dos = programmeFiles("C:\\DOS", CLOCK);

    expect(dos.write(disk(), "C:\\ODDWARE\\X.TXT", "text", NOW)).toEqual({ ok: false, error: "AccessDenied" });
    expect(dos.write(disk(), "C:\\DOS\\X.TXT", "text", NOW).ok).toBe(true);
  });

  test("replacing a permitted file keeps the working directory", () => {
    const first = write("C:\\WORM.LOG", "C:\\ODDWARE");
    if (!first.ok) throw new Error(first.error);
    const second = files.write(first.value, "C:\\WORM.LOG", "more", NOW);

    expect(second.ok && second.value.cwd).toBe("C:\\ODDWARE");
    expect(textAt(second, "C:\\WORM.LOG")).toBe("more");
  });
});

describe("Written files carry the DOS time", () => {
  test("the modification time is the DOS clock at the write", () => {
    const result = write("C:\\WORM.LOG");
    if (!result.ok) throw new Error(result.error);
    const resolved = resolvePath(result.value.filesystem, "C:\\", "C:\\WORM.LOG");

    expect(resolved.ok && resolved.value.entry.modified.toISOString()).toBe("1993-11-03T16:52:00.000Z");
  });
});
