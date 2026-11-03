import { describe, expect, test } from "vitest";

import { createDisk } from "../fs/disk";
import { ARCHIVE, directory, NO_ATTRIBUTES, opaqueFile, textFile } from "../fs/entries";
import { readFile } from "../fs/operations";
import { locate } from "../fs/path";
import { createFilesystem } from "../fs/seed";
import type { Attributes, Entry, FileContent, Filesystem } from "../fs/types";
import { parseCopy } from "./copy";
import { DOS_NOW, fromRoot, lines, onDisk, session, type Session } from "./testSession";

const WHEN = new Date(Date.UTC(1993, 5, 1, 9, 30));
const file = (name: string, text = name, attributes: Partial<Attributes> = {}) =>
  textFile(name, WHEN, text, { ...NO_ATTRIBUTES, ...attributes });

const disk = (...entries: readonly Entry[]): Filesystem => ({ root: directory("", WHEN, [...entries]) });

const count = (n: number) => `${String(n).padStart(9)} File(s) copied`;

const entryAt = ({ disk: { filesystem } }: Session, path: string) => {
  const found = locate(filesystem, "C:\\", path);
  return found.kind === "found" ? found.entry : undefined;
};

const contentAt = ({ disk: { filesystem } }: Session, path: string): FileContent | undefined => {
  const read = readFile(filesystem, "C:\\", path);
  return read.ok ? read.value : undefined;
};

const textAt = (copied: Session, path: string) => {
  const content = contentAt(copied, path);
  return content?.kind === "text" ? content.text : undefined;
};

const shipped = (path: string) => {
  const found = locate(createFilesystem(), "C:\\", path);
  if (found.kind !== "found") throw new Error(path);
  return found.entry;
};

const AB = disk(file("A.TXT", "one"), file("B.TXT", "two"), directory("ODDWARE", WHEN, []));

describe("parsing COPY's arguments", () => {
  test.each([
    ["a b", { sources: [{ name: "a", mode: undefined }], destination: { name: "b", mode: undefined }, replace: false }],
    ["a+b c", { sources: [{ name: "a", mode: undefined }, { name: "b", mode: undefined }], destination: { name: "c", mode: undefined }, replace: false }],
    ["a + b", { sources: [{ name: "a", mode: undefined }, { name: "b", mode: undefined }], destination: undefined, replace: false }],
    ["/b a+c d", { sources: [{ name: "a", mode: "B" }, { name: "c", mode: "B" }], destination: { name: "d", mode: "B" }, replace: false }],
    ["a /a b /b", { sources: [{ name: "a", mode: "A" }], destination: { name: "b", mode: "B" }, replace: false }],
    ["a/a b", { sources: [{ name: "a", mode: "A" }], destination: { name: "b", mode: "A" }, replace: false }],
    ["/y a b /-y", { sources: [{ name: "a", mode: undefined }], destination: { name: "b", mode: undefined }, replace: false }],
    ["/v /Y a b", { sources: [{ name: "a", mode: undefined }], destination: { name: "b", mode: undefined }, replace: true }],
  ])("%j", (tail, expected) => {
    expect(parseCopy(tail)).toEqual(expected);
  });

  test.each([
    ["", "Required parameter missing"],
    ["/v", "Required parameter missing"],
    ["a b c", "Too many parameters"],
    ["a /x b", "Invalid switch"],
  ])("%j fails", (tail, message) => {
    expect(parseCopy(tail)).toBe(message);
  });
});

describe("Copying files", () => {
  test("One file", () => {
    const copied = fromRoot("copy readme.txt notes.txt");

    expect(lines(copied)).toEqual([count(1)]);
    expect(entryAt(copied, "\\NOTES.TXT")).toEqual({ ...shipped("\\README.TXT"), name: "NOTES.TXT", attributes: ARCHIVE });
  });

  test("Into a directory", () => {
    expect(entryAt(fromRoot("copy readme.txt oddware"), "\\ODDWARE\\README.TXT")).toBeDefined();
  });

  test("into a directory named with a trailing backslash", () => {
    expect(entryAt(fromRoot("copy readme.txt oddware\\"), "\\ODDWARE\\README.TXT")).toBeDefined();
  });

  test("To the working directory", () => {
    const copied = session({ ...createDisk(), cwd: "C:\\ODDWARE" }, "copy \\readme.txt");

    expect(lines(copied)).toEqual([count(1)]);
    expect(entryAt(copied, "\\ODDWARE\\README.TXT")).toBeDefined();
  });

  test("New names by wildcard", () => {
    const copied = onDisk(AB, "copy *.txt *.bak");

    expect(textAt(copied, "A.BAK")).toBe("one");
    expect(textAt(copied, "B.BAK")).toBe("two");
    expect(lines(copied)).toEqual(["A.TXT", "B.TXT", count(2)]);
  });

  test("a source naming a directory copies every file in it", () => {
    const filesystem = disk(directory("SRC", WHEN, [file("X.TXT"), file("Y.TXT")]), directory("DEST", WHEN, []));
    const copied = onDisk(filesystem, "copy src dest");

    expect(lines(copied)).toEqual(["src\\X.TXT", "src\\Y.TXT", count(2)]);
    expect(entryAt(copied, "\\DEST\\Y.TXT")).toBeDefined();
  });

  test("hidden and system files are not copied", () => {
    const filesystem = disk(file("H.TXT", "h", { hidden: true }), file("S.TXT", "s", { system: true }), directory("D", WHEN, []));

    expect(lines(onDisk(filesystem, "copy *.txt d"))).toEqual(["File not found - *.TXT", count(0)]);
  });

  test("the earlier disk is unchanged", () => {
    onDisk(AB, "copy a.txt c.txt");

    expect(AB.root.entries).toHaveLength(3);
  });
});

describe("Copied files", () => {
  test("A wildcard", () => {
    const copied = onDisk(AB, "copy ?.txt oddware");

    expect(lines(copied)).toEqual(["A.TXT", "B.TXT", count(2)]);
  });

  test("the listed names keep the directory as typed", () => {
    const filesystem = disk(directory("SUB", WHEN, [file("X.TXT")]), directory("D", WHEN, []));

    expect(lines(onDisk(filesystem, "copy sub\\*.txt d"))[0]).toBe("sub\\X.TXT");
  });

  test("a copy has only the archive attribute", () => {
    const filesystem = disk(file("A.TXT", "one", { readOnly: true }));

    expect(entryAt(onDisk(filesystem, "copy a.txt b.txt"), "B.TXT")?.attributes).toEqual(ARCHIVE);
  });

  test("An opaque file", () => {
    const copied = fromRoot("copy command.com oddware");

    expect(contentAt(copied, "\\ODDWARE\\COMMAND.COM")).toEqual(contentAt(copied, "\\COMMAND.COM"));
    expect(contentAt(copied, "\\COMMAND.COM")?.kind).toBe("opaque");
  });

  test("An empty file", () => {
    const copied = onDisk(disk(file("EMPTY.TXT", "")), "copy empty.txt e2.txt");

    expect(lines(copied)).toEqual([count(0)]);
    expect(entryAt(copied, "E2.TXT")).toBeUndefined();
  });
});

describe("COPY count and failures", () => {
  test("Nothing to copy", () => {
    expect(lines(fromRoot("copy *.xyz oddware"))).toEqual(["File not found - *.XYZ", count(0)]);
  });

  test("a missing file", () => {
    expect(lines(fromRoot("copy nothing.txt oddware"))).toEqual(["File not found - NOTHING.TXT", count(0)]);
  });

  test.each(["copy readme.txt \\nowhere\\", "copy readme.txt \\nowhere\\x.txt", "copy readme.txt \\nowhere\\*.bak"])(
    "Missing destination directory: %s",
    (line) => {
      const copied = fromRoot(line);

      expect(lines(copied)).toEqual(["Path not found", count(0)]);
      expect(copied.disk.filesystem).toEqual(createFilesystem());
    },
  );

  test.each([
    ["copy", "Required parameter missing"],
    ["copy /x readme.txt", "Invalid switch"],
    ["copy a b c", "Too many parameters"],
    ["copy a:\\x.txt", "Invalid drive specification"],
    ["copy readme.txt a:", "Invalid drive specification"],
  ])("%s", (line, message) => {
    expect(lines(fromRoot(line))).toEqual([message]);
  });
});

describe("Copying onto the same file", () => {
  test("No destination in the same directory", () => {
    expect(lines(fromRoot("copy readme.txt"))).toEqual(["File cannot be copied onto itself", count(0)]);
  });

  test("The same name", () => {
    expect(lines(fromRoot("copy readme.txt \\README.TXT"))).toEqual(["File cannot be copied onto itself", count(0)]);
  });

  test("copying stops at the first copy onto itself", () => {
    const filesystem = disk(file("A.TXT", "one"), file("B.TXT", "two"), file("A.BAK", "old"));
    const copied = onDisk(filesystem, "copy /y *.* *.bak");

    expect(lines(copied)).toEqual(["A.TXT", "B.TXT", "A.BAK", "File cannot be copied onto itself", count(2)]);
  });
});

describe("Overwriting on copy", () => {
  const NOTES = disk(file("README.TXT", "readme"), file("NOTES.TXT", "notes"));
  const QUESTION = "Overwrite C:\\NOTES.TXT (Yes/No/All)?";

  test("Replacing", () => {
    const copied = onDisk(NOTES, "copy readme.txt notes.txt", "y");

    expect(copied.shown).toEqual([`${QUESTION}y`, count(1)]);
    expect(textAt(copied, "NOTES.TXT")).toBe("readme");
  });

  test("Keeping", () => {
    const copied = onDisk(NOTES, "copy readme.txt notes.txt", "n");

    expect(copied.shown).toEqual([`${QUESTION}n`, count(0)]);
    expect(textAt(copied, "NOTES.TXT")).toBe("notes");
  });

  test("All", () => {
    const filesystem = disk(file("A.TXT", "one"), file("B.TXT", "two"), directory("ODDWARE", WHEN, [file("A.TXT", "x"), file("B.TXT", "y")]));
    const copied = onDisk(filesystem, "copy ?.txt oddware", "a");

    expect(copied.shown).toEqual(["A.TXT", "Overwrite C:\\ODDWARE\\A.TXT (Yes/No/All)?a", "B.TXT", count(2)]);
    expect(textAt(copied, "\\ODDWARE\\B.TXT")).toBe("two");
  });

  test("Asking again", () => {
    const copied = onDisk(NOTES, "copy readme.txt notes.txt", "", "maybe");

    expect(copied.shown).toEqual([QUESTION, `${QUESTION}maybe`, QUESTION]);
    expect(copied.result?.type).toBe("question");
  });

  test("Without asking", () => {
    const copied = onDisk(NOTES, "copy /y readme.txt notes.txt");

    expect(lines(copied)).toEqual([count(1)]);
    expect(textAt(copied, "NOTES.TXT")).toBe("readme");
  });

  test("/-Y asks", () => {
    expect(onDisk(NOTES, "copy /y readme.txt notes.txt /-y").result?.type).toBe("question");
  });

  test("No answers, then Yes, for each file", () => {
    const filesystem = disk(file("A.TXT", "one"), file("B.TXT", "two"), directory("D", WHEN, [file("A.TXT", "x"), file("B.TXT", "y")]));
    const copied = onDisk(filesystem, "copy ?.txt d", "n", "y");

    expect(copied.shown).toEqual([
      "A.TXT",
      "Overwrite C:\\D\\A.TXT (Yes/No/All)?n",
      "B.TXT",
      "Overwrite C:\\D\\B.TXT (Yes/No/All)?y",
      count(1),
    ]);
    expect(textAt(copied, "\\D\\A.TXT")).toBe("x");
    expect(textAt(copied, "\\D\\B.TXT")).toBe("two");
  });
});

describe("Read-only destinations", () => {
  test("Read-only destination", () => {
    const filesystem = disk(file("README.TXT", "readme"), file("NOTES.TXT", "notes", { readOnly: true }));
    const copied = onDisk(filesystem, "copy /y readme.txt notes.txt");

    expect(lines(copied)).toEqual(["Access denied", count(0)]);
    expect(textAt(copied, "NOTES.TXT")).toBe("notes");
  });

  test("other files are still copied", () => {
    const filesystem = disk(file("A.TXT", "one"), file("B.TXT", "two"), directory("D", WHEN, [file("A.TXT", "x", { readOnly: true })]));
    const copied = onDisk(filesystem, "copy /y ?.txt d");

    expect(lines(copied)).toEqual(["A.TXT", "Access denied", "B.TXT", count(1)]);
  });
});

describe("Combining files", () => {
  test("Two files into a third", () => {
    const copied = onDisk(AB, "copy a.txt+b.txt c.txt");

    expect(lines(copied)).toEqual(["A.TXT", "B.TXT", count(1)]);
    expect(textAt(copied, "C.TXT")).toBe("onetwo\x1A");
    expect(entryAt(copied, "C.TXT")?.modified).toEqual(DOS_NOW);
  });

  test("Wildcard into one file", () => {
    const copied = onDisk(disk(file("A.TXT", "one"), file("B.TXT", "two"), file("C.DOC", "x")), "copy *.txt all.txt");

    expect(textAt(copied, "ALL.TXT")).toBe("onetwo\x1A");
    expect(lines(copied)).toEqual(["A.TXT", "B.TXT", count(1)]);
  });

  test("a file missing from a + list is skipped", () => {
    expect(textAt(onDisk(AB, "copy a.txt+nothing.txt+b.txt c.txt"), "C.TXT")).toBe("onetwo\x1A");
  });

  test("a combined destination that exists is asked about", () => {
    const copied = onDisk(disk(file("A.TXT", "one"), file("B.TXT", "two"), file("C.TXT", "old")), "copy a.txt+b.txt c.txt", "y");

    expect(copied.shown).toEqual(["A.TXT", "B.TXT", "Overwrite C:\\C.TXT (Yes/No/All)?y", count(1)]);
  });
});

describe("Combining into a source", () => {
  test("Adding to the first file", () => {
    const copied = onDisk(AB, "copy a.txt+b.txt");

    expect(textAt(copied, "A.TXT")).toBe("onetwo\x1A");
    expect(copied.result?.type).toBe("files");
  });

  test("Destination among the sources", () => {
    const copied = onDisk(AB, "copy a.txt+b.txt b.txt", "y");

    expect(copied.shown[0]).toBe("Content of destination lost before copy");
    expect(textAt(copied, "B.TXT")).toBe("one\x1A");
  });
});

describe("Text and binary copies", () => {
  const CTRL_Z = disk(file("A.TXT", "ab\x1Acd"), file("C.TXT", "ef"));

  test("A plain copy keeps Ctrl+Z", () => {
    expect(textAt(onDisk(CTRL_Z, "copy a.txt b.txt"), "B.TXT")).toHaveLength(5);
  });

  test("Text source", () => {
    expect(textAt(onDisk(CTRL_Z, "copy a.txt /a b.txt /b"), "B.TXT")).toBe("ab");
  });

  test("a text destination adds one Ctrl+Z", () => {
    expect(textAt(onDisk(CTRL_Z, "copy a.txt /a b.txt"), "B.TXT")).toBe("ab\x1A");
  });

  test("Combining adds Ctrl+Z", () => {
    expect(textAt(onDisk(CTRL_Z, "copy c.txt+c.txt d.txt"), "D.TXT")).toBe("efef\x1A");
  });

  test("Binary combination", () => {
    expect(textAt(onDisk(CTRL_Z, "copy /b a.txt+c.txt d.txt"), "D.TXT")).toBe("ab\x1Acdef");
  });
});

describe("Opaque files and other COPY switches", () => {
  test("Verify", () => {
    expect(fromRoot("copy /v readme.txt notes.txt")).toEqual(fromRoot("copy readme.txt notes.txt"));
  });

  test("an opaque source is read whole as text", () => {
    const filesystem = disk(opaqueFile("A.EXE", WHEN, 100, NO_ATTRIBUTES), file("B.TXT", "two"));

    expect(contentAt(onDisk(filesystem, "copy /a a.exe+b.txt c.exe /b"), "C.EXE")).toEqual({ kind: "opaque", size: 103 });
  });
});

describe("Devices in a copy", () => {
  test("To the screen", () => {
    const copied = onDisk(disk(file("README.TXT", "line one\r\nline two\r\n")), "copy readme.txt con");

    expect(lines(copied)).toEqual(["line one", "line two", count(1)]);
    expect(copied.disk.filesystem.root.entries).toHaveLength(1);
  });

  test.each(["nul", "NUL.TXT", "nul:", "prn", "lpt1", "com2", "aux"])("To nothing: %s", (device) => {
    const copied = fromRoot(`copy readme.txt ${device}`);

    expect(lines(copied)).toEqual([count(1)]);
    expect(copied.disk.filesystem).toEqual(createFilesystem());
  });

  test("from NUL is an empty source", () => {
    const copied = fromRoot("copy nul empty.txt");

    expect(lines(copied)).toEqual([count(0)]);
    expect(entryAt(copied, "EMPTY.TXT")).toBeUndefined();
  });

  test("a wildcard to the screen shows each file", () => {
    expect(lines(onDisk(AB, "copy ?.txt con"))).toEqual(["A.TXT", "one", "B.TXT", "two", count(2)]);
  });
});
