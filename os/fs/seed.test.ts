import { afterEach, describe, expect, test, vi } from "vitest";

import { fileSize } from "./entries";
import { normaliseName } from "./names";
import { listDirectory, readFile } from "./operations";
import { resolvePath } from "./path";
import { createFilesystem } from "./seed";
import type { Entry, FileEntry } from "./types";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const fs = createFilesystem();

const everyEntry = (entries: readonly Entry[]): readonly Entry[] =>
  entries.flatMap((entry) =>
    entry.kind === "directory" ? [entry, ...everyEntry(entry.entries)] : [entry],
  );

const all = everyEntry(fs.root.entries);

const names = (path: string) => {
  const result = listDirectory(fs, "C:\\", path);
  return result.ok ? result.value.map(({ name }) => name) : result.error;
};

const content = (path: string) => {
  const result = readFile(fs, "C:\\", path);
  return result.ok ? result.value : result.error;
};

const textOf = (path: string) => {
  const file = content(path);
  return typeof file === "object" && file.kind === "text" ? file.text : "";
};

describe("Contents of drive C", () => {
  test("Seeded tree", () => {
    expect(names("C:\\")).toEqual([
      "COMMAND.COM",
      "DOS",
      "CONFIG.SYS",
      "AUTOEXEC.BAT",
      "ODDWARE",
      "README.TXT",
      "CREDITS.TXT",
    ]);
    expect(names("C:\\DOS")).toEqual(["HIMEM.SYS", "MEM.EXE", "DOSKEY.COM", "HELP.COM"]);
    expect(names("C:\\ODDWARE")).toEqual(["WORM.EXE"]);
    expect(all).toHaveLength(12);
  });

  test("ODDWARE holds only the game", () => {
    expect(names("C:\\ODDWARE")).toEqual(["WORM.EXE"]);
  });

  test("the system and programme files are opaque, the others text", () => {
    [
      "C:\\COMMAND.COM",
      "C:\\DOS\\HIMEM.SYS",
      "C:\\DOS\\MEM.EXE",
      "C:\\DOS\\DOSKEY.COM",
      "C:\\DOS\\HELP.COM",
      "C:\\ODDWARE\\WORM.EXE",
    ].forEach((path) => {
      expect(content(path)).toMatchObject({ kind: "opaque" });
    });

    ["C:\\CONFIG.SYS", "C:\\AUTOEXEC.BAT", "C:\\README.TXT", "C:\\CREDITS.TXT"].forEach((path) => {
      expect(content(path)).toMatchObject({ kind: "text" });
    });
  });

  test("Programme files are opaque with a declared size", () => {
    expect(content("C:\\DOS\\MEM.EXE")).toEqual({ kind: "opaque", size: 32_502 });
    expect(content("C:\\DOS\\DOSKEY.COM")).toEqual({ kind: "opaque", size: 5_861 });
    expect(content("C:\\DOS\\HELP.COM")).toEqual({ kind: "opaque", size: 5_527 });
    expect(content("C:\\ODDWARE\\WORM.EXE")).toEqual({ kind: "opaque", size: 23_744 });
  });

  test("files have a size and the archive attribute only", () => {
    const files = all.filter((entry): entry is FileEntry => entry.kind === "file");

    files.forEach((file) => {
      expect(fileSize(file)).toBeGreaterThan(0);
      expect(file.attributes).toEqual({
        readOnly: false,
        hidden: false,
        system: false,
        archive: true,
      });
    });
  });

  test("Seeded names are valid", () => {
    all.forEach(({ name }) => {
      expect(normaliseName(name)).toEqual({ ok: true, value: name });
    });
  });

  test("Plain readme", () => {
    const readme = content("C:\\README.TXT");
    const text = typeof readme === "object" && readme.kind === "text" ? readme.text : "";

    expect(text).not.toBe("");
    expect(text).toMatch(/^[\x20-\x7e\r\n]*$/);
    text.split("\r\n").forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(80);
    });
  });

  test("Credits notice", () => {
    const text = textOf("C:\\CREDITS.TXT");
    const lines = text.split("\r\n");

    expect(text).toMatch(/^[\x20-\x7e\r\n]*$/);
    lines.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(80);
    });
    expect(text).toContain("Daniel Lowena-Irons");
    expect(lines).toContain("https://github.com/dnirns/ODD-OS");
  });

  test("The manual does not carry the credit", () => {
    const text = textOf("C:\\README.TXT");

    expect(text).not.toContain("Irons");
    expect(text).not.toContain("github.com");
  });

  test("DOS text files end each line with a carriage return and line feed", () => {
    ["C:\\CONFIG.SYS", "C:\\AUTOEXEC.BAT", "C:\\README.TXT", "C:\\CREDITS.TXT"].forEach((path) => {
      const file = content(path);
      const text = typeof file === "object" && file.kind === "text" ? file.text : "";

      expect(text.endsWith("\r\n")).toBe(true);
      expect(text.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
    });
  });
});

describe("Seeded timestamps", () => {
  test.each([
    ["C:\\", "1993-09-14T09:12:00.000Z"],
    ["C:\\COMMAND.COM", "1993-03-10T06:00:00.000Z"],
    ["C:\\DOS", "1993-09-14T09:12:00.000Z"],
    ["C:\\DOS\\HIMEM.SYS", "1993-03-10T06:00:00.000Z"],
    ["C:\\DOS\\MEM.EXE", "1993-03-10T06:00:00.000Z"],
    ["C:\\DOS\\DOSKEY.COM", "1993-03-10T06:00:00.000Z"],
    ["C:\\DOS\\HELP.COM", "1993-03-10T06:00:00.000Z"],
    ["C:\\CONFIG.SYS", "1993-09-14T09:31:00.000Z"],
    ["C:\\AUTOEXEC.BAT", "1993-09-14T09:31:00.000Z"],
    ["C:\\ODDWARE", "1993-09-20T16:48:00.000Z"],
    ["C:\\ODDWARE\\WORM.EXE", "1993-09-20T16:49:00.000Z"],
    ["C:\\README.TXT", "1993-09-20T16:52:00.000Z"],
    ["C:\\CREDITS.TXT", "1993-09-20T16:55:00.000Z"],
  ])("%s is modified at %s", (path, expected) => {
    const resolved = resolvePath(fs, "C:\\", path);

    expect(resolved.ok && resolved.value.entry.modified.toISOString()).toBe(expected);
  });

  test("Independent of the clock", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date(Date.UTC(2026, 10, 2, 9, 0)));
    const first = JSON.stringify(createFilesystem());

    vi.setSystemTime(new Date(Date.UTC(2031, 5, 30, 23, 59)));
    const second = JSON.stringify(createFilesystem());

    expect(second).toBe(first);
  });

  test.each(["UTC", "Pacific/Auckland", "America/Los_Angeles"])(
    "the same in %s, all in 1993",
    (zone) => {
      vi.stubEnv("TZ", zone);
      const created = everyEntry(createFilesystem().root.entries);

      expect(JSON.stringify(createFilesystem())).toBe(JSON.stringify(fs));
      created.forEach(({ modified }) => {
        expect(modified.getUTCFullYear()).toBe(1993);
      });
    },
  );

  test("each seeded file keeps its date, and none is in the future of the boot clock", () => {
    all.forEach(({ modified }) => {
      expect(modified.getTime()).toBeLessThan(Date.UTC(1993, 10, 1));
    });
  });
});
