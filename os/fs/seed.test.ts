import { afterEach, describe, expect, test, vi } from "vitest";

import { fileSize } from "./entries";
import { normaliseName } from "./names";
import { listDirectory, readFile } from "./operations";
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

describe("Contents of drive C", () => {
  test("Seeded tree", () => {
    expect(names("C:\\")).toEqual([
      "COMMAND.COM",
      "DOS",
      "CONFIG.SYS",
      "AUTOEXEC.BAT",
      "ODDWARE",
      "README.TXT",
    ]);
    expect(names("C:\\DOS")).toEqual(["HIMEM.SYS"]);
    expect(names("C:\\ODDWARE")).toEqual([]);
    expect(all).toHaveLength(7);
  });

  test("ODDWARE starts empty", () => {
    expect(names("C:\\ODDWARE")).toEqual([]);
  });

  test("COMMAND.COM and HIMEM.SYS are opaque, the others text", () => {
    expect(content("C:\\COMMAND.COM")).toMatchObject({ kind: "opaque" });
    expect(content("C:\\DOS\\HIMEM.SYS")).toMatchObject({ kind: "opaque" });

    ["C:\\CONFIG.SYS", "C:\\AUTOEXEC.BAT", "C:\\README.TXT"].forEach((path) => {
      expect(content(path)).toMatchObject({ kind: "text" });
    });
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

  test("DOS text files end each line with a carriage return and line feed", () => {
    ["C:\\CONFIG.SYS", "C:\\AUTOEXEC.BAT", "C:\\README.TXT"].forEach((path) => {
      const file = content(path);
      const text = typeof file === "object" && file.kind === "text" ? file.text : "";

      expect(text.endsWith("\r\n")).toBe(true);
      expect(text.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
    });
  });
});

describe("Seeded timestamps", () => {
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
