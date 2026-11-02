import { describe, expect, test } from "vitest";

import { ARCHIVE, directory, NO_ATTRIBUTES, opaqueFile, textFile } from "./entries";
import { findEntries, listDirectory, readFile, writeFile } from "./operations";
import { createTestFilesystem } from "./testTree";
import type { FileContent, Filesystem, FsError } from "./types";

const fs = createTestFilesystem();
const NOW = new Date(Date.UTC(1993, 10, 2, 14, 30));

const read = (path: string, filesystem = fs, cwd = "C:\\") => {
  const result = readFile(filesystem, cwd, path);
  return result.ok ? result.value : result.error;
};

const text = (path: string, filesystem = fs) => {
  const content = read(path, filesystem);
  return typeof content === "object" && content.kind === "text" ? content.text : content;
};

const list = (path: string, filesystem = fs) => {
  const result = listDirectory(filesystem, "C:\\", path);
  return result.ok ? result.value : result.error;
};

const names = (path: string, filesystem = fs) => {
  const entries = list(path, filesystem);
  return typeof entries === "string" ? entries : entries.map(({ name }) => name);
};

const write = (path: string, content: string, filesystem = fs, now = NOW) =>
  writeFile(filesystem, "C:\\", path, content, now);

const written = (path: string, content: string, filesystem = fs): Filesystem => {
  const result = write(path, content, filesystem);
  if (!result.ok) throw new Error(`write failed: ${result.error}`);
  return result.value;
};

const writeError = (path: string, filesystem = fs): FsError | "ok" => {
  const result = write(path, "x", filesystem);
  return result.ok ? "ok" : result.error;
};

describe("Reading a file", () => {
  test("Text file", () => {
    expect(read("C:\\CONFIG.SYS")).toEqual({ kind: "text", text: "FILES=30\r\n" });
  });

  test("Opaque file", () => {
    expect(read("C:\\COMMAND.COM")).toEqual({ kind: "opaque", size: 100 });
  });

  test("Directory", () => {
    expect(read("C:\\DOS")).toBe("IsADirectory");
    expect(read("C:\\")).toBe("IsADirectory");
  });

  test("Lower-case lookup", () => {
    expect(text("readme.txt")).toBe("hello");
  });

  test("Lookup with a long name", () => {
    expect(text("C:\\AUTOEXECUTE.BATCH")).toBe("PROMPT $P$G\r\n");
  });

  test("Missing components", () => {
    expect(read("C:\\DOS\\MISSING.TXT")).toBe("FileNotFound");
    expect(read("C:\\MISSING\\A.TXT")).toBe("PathNotFound");
    expect(read("C:\\README.TXT\\A.TXT")).toBe("PathNotFound");
    expect(read("C:\\README.TXT\\")).toBe("NotADirectory");
  });

  test("Invalid names and drives", () => {
    expect(read("*.TXT")).toBe("InvalidName");
    expect(read("con")).toBe("InvalidName");
    expect(read("A:\\README.TXT")).toBe("InvalidDrive");
  });

  test("relative to the working directory", () => {
    expect(read("himem.sys", fs, "C:\\DOS")).toEqual({ kind: "opaque", size: 200 });
  });
});

describe("Listing a directory", () => {
  test("Root listing", () => {
    expect(names("C:\\")).toEqual([
      "COMMAND.COM",
      "DOS",
      "CONFIG.SYS",
      "AUTOEXEC.BAT",
      "ODDWARE",
      "README.TXT",
    ]);
  });

  test("Text file size", () => {
    const entries = list("C:\\");
    const config = Array.isArray(entries) && entries.find(({ name }) => name === "CONFIG.SYS");

    expect(config && config.size).toBe("FILES=30\r\n".length);
  });

  test("Opaque file size, kinds and directories", () => {
    const entries = list("C:\\");

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "COMMAND.COM", kind: "file", size: 100 }),
        expect.objectContaining({ name: "DOS", kind: "directory", size: 0 }),
      ]),
    );
  });

  test("No dot entries", () => {
    expect(names("C:\\DOS")).toEqual(["HIMEM.SYS"]);
    expect(names("C:\\ODDWARE")).toEqual([]);
  });

  test("Listing a file", () => {
    expect(names("C:\\README.TXT")).toBe("NotADirectory");
  });

  test("an entry carries its time and attributes", () => {
    const entries = list("C:\\");

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "README.TXT",
          modified: new Date(Date.UTC(1993, 8, 14, 9, 31)),
          attributes: ARCHIVE,
        }),
      ]),
    );
  });

  test("a missing directory", () => {
    expect(names("C:\\NOWHERE")).toBe("FileNotFound");
    expect(names("C:\\NOWHERE\\")).toBe("PathNotFound");
  });
});

describe("Creating a file", () => {
  test("New file", () => {
    const after = written("C:\\NOTES.TXT", "hello");
    const entries = list("C:\\", after);

    expect(Array.isArray(entries) && entries.at(-1)).toEqual({
      name: "NOTES.TXT",
      kind: "file",
      size: 5,
      modified: NOW,
      attributes: { readOnly: false, hidden: false, system: false, archive: true },
    });
    expect(text("C:\\NOTES.TXT", after)).toBe("hello");
  });

  test("Earlier value unchanged", () => {
    written("C:\\NOTES.TXT", "hello");

    expect(names("C:\\")).not.toContain("NOTES.TXT");
    expect(read("C:\\NOTES.TXT")).toBe("FileNotFound");
  });

  test("Lower-case creation", () => {
    expect(names("C:\\", written("notes.txt", "x"))).toContain("NOTES.TXT");
  });

  test("Creation with a long name", () => {
    expect(names("C:\\", written("LONGFILENAME.TEXT", "x"))).toContain("LONGFILE.TEX");
  });

  test("creating inside a subdirectory", () => {
    const after = written("C:\\ODDWARE\\A.TXT", "x");

    expect(names("C:\\ODDWARE", after)).toEqual(["A.TXT"]);
    expect(names("C:\\", after)).toEqual(names("C:\\"));
  });

  test("creating from a working directory", () => {
    const result = writeFile(fs, "C:\\DOS", "NEW.TXT", "x", NOW);

    expect(result.ok && names("C:\\DOS", result.value)).toEqual(["HIMEM.SYS", "NEW.TXT"]);
  });

  test("the modification time is copied", () => {
    const now = new Date(NOW.getTime());
    const after = written("C:\\NOTES.TXT", "x");
    const result = writeFile(fs, "C:\\", "C:\\B.TXT", "x", now);

    now.setUTCFullYear(2000);

    expect(result.ok && list("C:\\", result.value)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "B.TXT", modified: NOW })]),
    );
    expect(after).not.toBe(fs);
  });
});

describe("Replacing a file", () => {
  test("Replacing text", () => {
    const after = written("C:\\README.TXT", "new text");

    expect(text("C:\\README.TXT", after)).toBe("new text");
    expect(names("C:\\", after)).toEqual(names("C:\\"));
  });

  test("Replacing an opaque file", () => {
    expect(text("C:\\COMMAND.COM", written("C:\\COMMAND.COM", "x"))).toBe("x");
  });

  test("sets the modification time and the archive attribute", () => {
    const hidden = {
      root: {
        ...fs.root,
        entries: [
          textFile("A.TXT", new Date(0), "a", {
            readOnly: false,
            hidden: true,
            system: true,
            archive: false,
          }),
        ],
      },
    };
    const entries = list("C:\\", written("A.TXT", "b", hidden));

    expect(Array.isArray(entries) && entries[0]).toEqual(
      expect.objectContaining({
        modified: NOW,
        attributes: { readOnly: false, hidden: true, system: true, archive: true },
      }),
    );
  });

  test("Appending", () => {
    const first = written("C:\\NOTES.TXT", "one");
    const before = text("C:\\NOTES.TXT", first);
    const second = written("C:\\NOTES.TXT", `${before} two`, first);

    expect(text("C:\\NOTES.TXT", second)).toBe("one two");
  });

  test("Replacing leaves other entries alone", () => {
    const after = written("C:\\DOS\\HIMEM.SYS", "x");

    expect(text("C:\\README.TXT", after)).toBe("hello");
    expect(read("C:\\COMMAND.COM", after)).toEqual(read("C:\\COMMAND.COM"));
  });

  test("Earlier value unchanged after replacing", () => {
    written("C:\\README.TXT", "new text");

    expect(text("C:\\README.TXT")).toBe("hello");
  });
});

describe("Write failures", () => {
  const readOnly: Filesystem = {
    root: directory("", NOW, [
      textFile("LOCKED.TXT", NOW, "keep", { readOnly: true, hidden: false, system: false, archive: true }),
      opaqueFile("LOCKED.COM", NOW, 5, { readOnly: true, hidden: false, system: false, archive: true }),
    ]),
  };

  test("Read-only file", () => {
    expect(writeError("LOCKED.TXT", readOnly)).toBe("AccessDenied");
    expect(writeError("LOCKED.COM", readOnly)).toBe("AccessDenied");
  });

  test("a refused write leaves the filesystem unchanged", () => {
    const before = JSON.stringify(readOnly);
    writeError("LOCKED.TXT", readOnly);

    expect(JSON.stringify(readOnly)).toBe(before);
  });

  test("Directory name", () => {
    expect(writeError("C:\\DOS")).toBe("IsADirectory");
    expect(writeError("C:\\")).toBe("IsADirectory");
    expect(writeError("C:\\DOS\\")).toBe("IsADirectory");
    expect(writeError("C:\\DOS\\..")).toBe("IsADirectory");
  });

  test("Missing parent", () => {
    expect(writeError("C:\\MISSING\\A.TXT")).toBe("PathNotFound");
    expect(writeError("C:\\NEWDIR\\")).toBe("PathNotFound");
  });

  test("a file used as a directory", () => {
    expect(writeError("C:\\README.TXT\\A.TXT")).toBe("PathNotFound");
    expect(writeError("C:\\README.TXT\\")).toBe("NotADirectory");
  });

  test("Invalid character, wildcard, two dots, extension only, non-ASCII", () => {
    ["A+B.TXT", "*.TXT", "A.B.C", ".TXT", "CAFÉ.TXT"].forEach((name) => {
      expect(writeError(name)).toBe("InvalidName");
    });
  });

  test("Device name", () => {
    ["con", "LPT1.TXT", "CLOCK$.DAT"].forEach((name) => {
      expect(writeError(name)).toBe("InvalidName");
    });
  });

  test("another drive", () => {
    expect(writeError("A:\\X.TXT")).toBe("InvalidDrive");
  });

  test("three dots", () => {
    expect(writeError("...")).toBe("FileNotFound");
  });
});

describe("Failures are reported as codes", () => {
  test("Failure leaves the filesystem unchanged", () => {
    const before = JSON.stringify(fs);
    const result = write("C:\\NOWHERE\\A.TXT", "x");

    expect(result).toEqual({ ok: false, error: "PathNotFound" });
    expect(JSON.stringify(fs)).toBe(before);
  });

  test("Bad input does not throw", () => {
    const paths = ["", "\\", "\\\\", "///", ":", "C:\\:", "\0", "...", "A:", "*", "C:\\DOS\\\0\\X"];

    paths.forEach((path) => {
      expect(() => readFile(fs, "C:\\", path)).not.toThrow();
      expect(() => listDirectory(fs, "C:\\", path)).not.toThrow();
      expect(() => writeFile(fs, "C:\\", path, "x", NOW)).not.toThrow();
    });
  });

  test("an empty path, only separators and invalid characters give codes", () => {
    expect(read("")).toBe("FileNotFound");
    expect(read("\\")).toBe("IsADirectory");
    expect(read("\\\\")).toBe("PathNotFound");
    expect(read("***")).toBe("InvalidName");
    expect(writeError("")).toBe("FileNotFound");
    expect(writeError("\\\\")).toBe("PathNotFound");
  });

  test("a broken working directory gives a code", () => {
    expect(readFile(fs, "C:\\NOWHERE", "A.TXT")).toEqual({ ok: false, error: "PathNotFound" });
    expect(readFile(fs, "C:\\README.TXT", "A.TXT")).toEqual({ ok: false, error: "NotADirectory" });
    expect(readFile(fs, "A:\\", "A.TXT")).toEqual({ ok: false, error: "InvalidDrive" });
    expect(readFile(fs, "", "A.TXT")).toEqual({ ok: false, error: "FileNotFound" });
  });
});

describe("Invalid names", () => {
  test("Invalid character", () => {
    expect(writeError("A+B.TXT")).toBe("InvalidName");
  });

  test("Two dots", () => {
    expect(writeError("A.B.C")).toBe("InvalidName");
  });

  test("Extension only", () => {
    expect(writeError(".TXT")).toBe("InvalidName");
  });

  test("Non-ASCII character", () => {
    expect(writeError("CAFÉ.TXT")).toBe("InvalidName");
  });
});

describe("Device names", () => {
  test("Device name with an extension", () => {
    expect(writeError("LPT1.TXT")).toBe("InvalidName");
    expect(writeError("CLOCK$.DAT")).toBe("InvalidName");
  });
});

test("read content is the declared shape", () => {
  const content: FileContent | FsError = read("C:\\COMMAND.COM");

  expect(content).toEqual({ kind: "opaque", size: 100 });
});

describe("findEntries", () => {
  const WHEN = new Date(Date.UTC(1993, 8, 14, 9, 12));
  const tree: Filesystem = {
    root: directory("", WHEN, [
      textFile("A.TXT", WHEN, "a"),
      textFile("HIDDEN.TXT", WHEN, "h", { ...ARCHIVE, hidden: true }),
      textFile("SYS.DAT", WHEN, "s", { ...NO_ATTRIBUTES, system: true }),
      directory("SUB", new Date(Date.UTC(1993, 9, 1, 8, 5)), [textFile("B.TXT", WHEN, "bb")]),
    ]),
  };

  const find = (spec: string, cwd = "C:\\") => {
    const result = findEntries(tree, cwd, spec);
    return result.ok
      ? { path: result.value.path, names: result.value.entries.map(({ name }) => name) }
      : result.error;
  };

  test("lists a directory for an empty spec", () => {
    expect(find("")).toEqual({
      path: "C:\\",
      names: ["A.TXT", "HIDDEN.TXT", "SYS.DAT", "SUB"],
    });
  });

  test("starts a subdirectory with its dot entries, dated as the directory", () => {
    const result = findEntries(tree, "C:\\", "sub");
    const dates = result.ok ? result.value.entries.map(({ modified }) => modified) : [];

    expect(find("sub")).toEqual({ path: "C:\\SUB", names: [".", "..", "B.TXT"] });
    expect(dates[0]).toEqual(new Date(Date.UTC(1993, 9, 1, 8, 5)));
    expect(dates[1]).toEqual(dates[0]);
  });

  test("includes the dot entries only when they match the pattern", () => {
    expect(find("*", "C:\\SUB")).toEqual({ path: "C:\\SUB", names: [".", "..", "B.TXT"] });
    expect(find("*.*", "C:\\SUB")).toEqual({ path: "C:\\SUB", names: [".", "..", "B.TXT"] });
    expect(find("*.txt", "C:\\SUB")).toEqual({ path: "C:\\SUB", names: ["B.TXT"] });
    expect(find("b.txt", "C:\\SUB")).toEqual({ path: "C:\\SUB", names: ["B.TXT"] });
  });

  test("the root has no dot entries", () => {
    expect(find("*.*")).toMatchObject({ names: ["A.TXT", "HIDDEN.TXT", "SYS.DAT", "SUB"] });
  });

  test("includes hidden and system entries", () => {
    expect(find("*")).toMatchObject({ names: ["A.TXT", "HIDDEN.TXT", "SYS.DAT", "SUB"] });
  });

  test("lists a directory named by the spec", () => {
    expect(find("sub")).toEqual({ path: "C:\\SUB", names: [".", "..", "B.TXT"] });
    expect(find("sub\\")).toEqual({ path: "C:\\SUB", names: [".", "..", "B.TXT"] });
    expect(find("c:\\sub")).toEqual({ path: "C:\\SUB", names: [".", "..", "B.TXT"] });
  });

  test("lists the working directory for a bare drive or a dot", () => {
    expect(find("c:", "C:\\SUB")).toEqual({ path: "C:\\SUB", names: [".", "..", "B.TXT"] });
    expect(find(".", "C:\\SUB")).toEqual({ path: "C:\\SUB", names: [".", "..", "B.TXT"] });
    expect(find("..", "C:\\SUB")).toMatchObject({ path: "C:\\" });
  });

  test("returns one file under its directory", () => {
    expect(find("a.txt")).toEqual({ path: "C:\\", names: ["A.TXT"] });
    expect(find("sub\\b.txt")).toEqual({ path: "C:\\SUB", names: ["B.TXT"] });
  });

  test("matches a pattern in a directory", () => {
    expect(find("*.txt")).toEqual({ path: "C:\\", names: ["A.TXT", "HIDDEN.TXT"] });
    expect(find("\\sub\\?.t*", "C:\\SUB")).toEqual({ path: "C:\\SUB", names: ["B.TXT"] });
  });

  test("gives no entries when nothing matches", () => {
    expect(find("*.zzz")).toEqual({ path: "C:\\", names: [] });
    expect(find("missing.txt")).toEqual({ path: "C:\\", names: [] });
  });

  test("reports the directory's own details", () => {
    const result = findEntries(tree, "C:\\", "sub");

    expect(result.ok && result.value.modified).toEqual(new Date(Date.UTC(1993, 9, 1, 8, 5)));
    expect(result.ok && result.value.isRoot).toBe(false);
    expect(findEntries(tree, "C:\\", "")).toMatchObject({ ok: true, value: { isRoot: true } });
  });

  test.each([
    ["\\nowhere\\*.txt", "PathNotFound"],
    ["nowhere\\a.txt", "PathNotFound"],
    ["a.txt\\*.txt", "PathNotFound"],
    ["a.txt\\", "PathNotFound"],
    ["s*\\*.txt", "PathNotFound"],
    ["d:*.txt", "InvalidDrive"],
    ["d:", "InvalidDrive"],
    ["a+b", "InvalidName"],
    ["a.b.c*", "InvalidName"],
    ["..\\x", "PathNotFound"],
  ])("fails for %j with %s", (spec, error) => {
    expect(find(spec)).toBe(error);
  });
});
