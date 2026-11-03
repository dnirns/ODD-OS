import { describe, expect, test } from "vitest";

import {
  appendEntry,
  countEntries,
  type Ending,
  formatEntry,
  HEADER,
  REPORTED_EXTRA,
  type Session,
  tierOf,
} from "./wormLog";

const session = (overrides: Partial<Session> = {}): Session => ({
  ending: "wall",
  score: 40,
  length: 7,
  food: 4,
  seconds: 83,
  ...overrides,
});

const lines = (text: string) => text.split("\r\n");

const entryLines = (number: number, overrides?: Partial<Session>) =>
  lines(formatEntry(number, session(overrides))).filter((line) => line !== "");

const logOf = (count: number) =>
  Array.from({ length: count }).reduce<string | undefined>(
    (text, _, index) => appendEntry(text, session({ seconds: index })),
    undefined,
  ) as string;

describe("Entry contents", () => {
  test("A crash into a wall", () => {
    expect(entryLines(1)).toEqual([
      "SESSION 001",
      "ENDED      STRUCK WALL",
      "SCORE 40   LENGTH 7   FOOD 4   TIME 1:23",
    ]);
  });

  test("Each ending", () => {
    const ended = (ending: Ending) => entryLines(1, { ending })[1];

    expect(ended("self")).toBe("ENDED      STRUCK ITSELF");
    expect(ended("full")).toBe("ENDED      FILLED THE FIELD");
    expect(ended("operator")).toBe("ENDED      STOPPED BY OPERATOR");
  });

  test("Food eaten", () => {
    expect(entryLines(2, { food: 4 })[2]).toContain("FOOD 4");
  });

  test("Long sessions", () => {
    expect(entryLines(1, { seconds: 754 })[2]).toContain("TIME 12:34");
  });

  test("times round down to whole seconds and start at 0:00", () => {
    expect(entryLines(1, { seconds: 0 })[2]).toContain("TIME 0:00");
    expect(entryLines(1, { seconds: 59.9 })[2]).toContain("TIME 0:59");
    expect(entryLines(1, { seconds: 60 })[2]).toContain("TIME 1:00");
  });

  test("session numbers have three digits or more", () => {
    expect(entryLines(7)[0]).toBe("SESSION 007");
    expect(entryLines(42)[0]).toBe("SESSION 042");
    expect(entryLines(1234)[0]).toBe("SESSION 1234");
  });
});

describe("Escalating entries", () => {
  test("tiers by session number", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 25].map(tierOf)).toEqual([
      "faithful",
      "faithful",
      "faithful",
      "observant",
      "observant",
      "observant",
      "contradicting",
      "contradicting",
      "contradicting",
    ]);
  });

  test("Faithful", () => {
    [1, 2, 3].forEach((number) => {
      const entry = entryLines(number);

      expect(entry).toHaveLength(3);
      expect(entry[2]).toBe("SCORE 40   LENGTH 7   FOOD 4   TIME 1:23");
    });
  });

  test("Observant", () => {
    const note = (number: number, ending: Ending) => entryLines(number, { ending })[3];

    expect(note(4, "wall")).toBe("NOTE       THE WALL WAS WHERE IT ALWAYS IS.");
    expect(note(5, "self")).toBe("NOTE       THE WORM REMEMBERED WHERE IT HAD BEEN.");
    expect(note(6, "full")).toBe("NOTE       THERE WAS NOWHERE LEFT TO GO.");
    expect(note(6, "operator")).toBe("NOTE       THE WORM WAS NOT CONSULTED.");
    [4, 5, 6].forEach((number) => {
      expect(entryLines(number)[2]).toBe("SCORE 40   LENGTH 7   FOOD 4   TIME 1:23");
    });
  });

  test("Contradicting", () => {
    expect(REPORTED_EXTRA).toBe(1);
    expect(entryLines(7, { seconds: 52 })).toEqual([
      "SESSION 007",
      "ENDED      STRUCK WALL",
      "SCORE 40   LENGTH 8   FOOD 5   TIME 0:52",
      "NOTE       DISPLAYED FIGURES WERE NOT ACCURATE.",
    ]);
  });

  test("Later sessions", () => {
    (["wall", "self", "full", "operator"] as const).forEach((ending) => {
      const entry = entryLines(25, { ending });

      expect(entry[2]).toBe("SCORE 40   LENGTH 8   FOOD 5   TIME 1:23");
      expect(entry[3]).toBe("NOTE       DISPLAYED FIGURES WERE NOT ACCURATE.");
    });
  });
});

describe("The log file", () => {
  test("First entry", () => {
    expect(lines(appendEntry(undefined, session()))).toEqual([
      HEADER,
      "",
      "SESSION 001",
      "ENDED      STRUCK WALL",
      "SCORE 40   LENGTH 7   FOOD 4   TIME 1:23",
      "",
      "",
    ]);
    expect(HEADER).toBe("WORM.EXE SESSION LOG");
  });

  test("every line ends in CRLF and every entry is followed by one empty line", () => {
    const text = logOf(8);

    expect(text.endsWith("\r\n\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(text).not.toMatch(/\r\n\r\n\r\n/);
  });

  test("uppercase text within 80 columns, even with the largest figures", () => {
    const largest = session({ ending: "operator", score: 16_350, length: 1_638, food: 1_635, seconds: 999 * 60 + 59 });
    const text = [1, 4, 7, 12_345].map((number) => formatEntry(number, largest)).join("") + logOf(10);

    lines(text).forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(80);
      expect(line).toBe(line.toUpperCase());
    });
  });

  test("No timestamps in the text", () => {
    lines(logOf(10)).forEach((line) => {
      expect(line).not.toMatch(/\d\d-\d\d-\d\d|\d{1,2}:\d\d ?[ap]\b/i);
    });
  });
});

describe("Session numbering", () => {
  test("Second session", () => {
    const first = appendEntry(undefined, session());
    const second = appendEntry(first, session({ ending: "self" }));

    expect(second.startsWith(first)).toBe(true);
    expect(lines(second.slice(first.length))[0]).toBe("SESSION 002");
  });

  test("Many sessions", () => {
    const numbers = lines(logOf(10)).filter((line) => line.startsWith("SESSION "));

    expect(numbers).toEqual(Array.from({ length: 10 }, (_, index) => `SESSION ${String(index + 1).padStart(3, "0")}`));
  });

  test("numbers are counted from the entries, not read from the last one", () => {
    const edited = `${HEADER}\r\n\r\n${formatEntry(41, session())}`;

    expect(countEntries(edited)).toBe(1);
    expect(appendEntry(edited, session())).toContain("SESSION 002");
  });

  test("other lines mentioning a session are not counted", () => {
    expect(countEntries("SESSION LOG\r\nSESSION 001 EXTRA\r\n SESSION 002\r\n")).toBe(0);
  });

  test("earlier entries never change", () => {
    let text = appendEntry(undefined, session());

    for (let count = 2; count <= 9; count += 1) {
      const next = appendEntry(text, session({ score: count }));
      expect(next.startsWith(text)).toBe(true);
      text = next;
    }
  });
});
