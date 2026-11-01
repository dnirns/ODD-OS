import { describe, expect, test } from "vitest";

import {
  addEntry,
  createHistory,
  type History,
  recallNewest,
  recallNext,
  recallOldest,
  recallPrevious,
} from "./history";

const withEntries = (...lines: readonly string[]) =>
  lines.reduce(addEntry, createHistory());

const shown = ({ entries, position }: History) =>
  position === null ? null : entries[position];

describe("history", () => {
  test("keeps entries in order, including repeats", () => {
    expect(withEntries("a", "b", "a", "a").entries).toEqual(["a", "b", "a", "a"]);
  });

  test("recalls nothing from an empty history", () => {
    const empty = createHistory();

    expect(recallPrevious(empty).position).toBeNull();
    expect(recallNext(empty).position).toBeNull();
    expect(recallOldest(empty).position).toBeNull();
    expect(recallNewest(empty).position).toBeNull();
  });

  test("steps back from the newest entry and stops at the oldest", () => {
    const one = recallPrevious(withEntries("a", "b"));
    const two = recallPrevious(one);
    const three = recallPrevious(two);

    expect([one, two, three].map(shown)).toEqual(["b", "a", "a"]);
  });

  test("steps forward and stops at the newest", () => {
    const oldest = recallOldest(withEntries("a", "b"));
    const next = recallNext(oldest);

    expect(shown(next)).toBe("b");
    expect(shown(recallNext(next))).toBe("b");
  });

  test("does not move forward when nothing is recalled", () => {
    expect(recallNext(withEntries("a")).position).toBeNull();
  });

  test("jumps to either end", () => {
    const history = withEntries("a", "b", "c");

    expect(shown(recallOldest(history))).toBe("a");
    expect(shown(recallNewest(recallOldest(history)))).toBe("c");
  });

  test("resets the position when an entry is added", () => {
    const recalled = recallPrevious(withEntries("a", "b"));

    expect(shown(recallPrevious(addEntry(recalled, "c")))).toBe("c");
  });

  test("drops the oldest entries past 512 bytes", () => {
    const line = (index: number) => `${index}`.padStart(99, "x");
    const history = withEntries(...Array.from({ length: 6 }, (_, index) => line(index)));

    expect(history.entries).toEqual([1, 2, 3, 4, 5].map(line));
  });

  test("keeps exactly 512 bytes", () => {
    const line = "x".repeat(255);

    expect(withEntries(line, line).entries).toHaveLength(2);
  });
});
