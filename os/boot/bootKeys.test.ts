import { expect, test } from "vitest";

import { isSkipKey } from "./bootKeys";

test("accepts Escape as the skip key", () => {
  expect(isSkipKey("Escape")).toBe(true);
});

test("rejects every other key", () => {
  for (const key of ["Enter", " ", "a", "F5", "Delete", "Tab", "ArrowUp"]) {
    expect(isSkipKey(key)).toBe(false);
  }
});
