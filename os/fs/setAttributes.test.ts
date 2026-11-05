import { describe, expect, test } from "vitest";

import { NO_ATTRIBUTES } from "./entries";
import { readFile, setAttributes } from "./operations";
import { resolvePath } from "./path";
import { createFilesystem } from "./seed";
import type { Filesystem } from "./types";

const HIDDEN_READ_ONLY = { ...NO_ATTRIBUTES, hidden: true, readOnly: true };

const entryAt = (fs: Filesystem, path: string) => {
  const found = resolvePath(fs, "C:\\", path);
  if (!found.ok) throw new Error(found.error);
  return found.value.entry;
};

const changed = (path: string, cwd = "C:\\") => {
  const result = setAttributes(createFilesystem(), cwd, path, HIDDEN_READ_ONLY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("setAttributes", () => {
  test("replaces a file's attributes and keeps everything else", () => {
    const before = entryAt(createFilesystem(), "README.TXT");
    const after = entryAt(changed("readme.txt"), "README.TXT");

    expect(after.attributes).toEqual(HIDDEN_READ_ONLY);
    expect(after.name).toBe(before.name);
    expect(after.modified).toEqual(before.modified);
    expect(readFile(changed("readme.txt"), "C:\\", "README.TXT")).toEqual(
      readFile(createFilesystem(), "C:\\", "README.TXT"),
    );
  });

  test("keeps the entry's place in its directory", () => {
    const names = changed("readme.txt").root.entries.map(({ name }) => name);

    expect(names).toEqual(createFilesystem().root.entries.map(({ name }) => name));
  });

  test("changes a directory", () => {
    expect(entryAt(changed("oddware"), "ODDWARE").attributes).toEqual(HIDDEN_READ_ONLY);
    expect(entryAt(changed("oddware"), "ODDWARE\\WORM.EXE").attributes.hidden).toBe(false);
  });

  test("works with relative paths and on read-only files", () => {
    expect(entryAt(changed("..\\io.sys", "C:\\DOS"), "IO.SYS").attributes).toEqual(HIDDEN_READ_ONLY);
    expect(entryAt(changed("dos\\attrib.exe"), "DOS\\ATTRIB.EXE").attributes).toEqual(HIDDEN_READ_ONLY);
  });

  test("fails with the usual codes", () => {
    const fs = createFilesystem();

    expect(setAttributes(fs, "C:\\", "nothing.txt", NO_ATTRIBUTES)).toEqual({ ok: false, error: "FileNotFound" });
    expect(setAttributes(fs, "C:\\", "\\nowhere\\x.txt", NO_ATTRIBUTES)).toEqual({
      ok: false,
      error: "PathNotFound",
    });
    expect(setAttributes(fs, "C:\\", "d:x.txt", NO_ATTRIBUTES)).toEqual({ ok: false, error: "InvalidDrive" });
    expect(setAttributes(fs, "C:\\", "\\", NO_ATTRIBUTES)).toEqual({ ok: false, error: "AccessDenied" });
  });
});
