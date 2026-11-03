import { afterEach, describe, expect, test, vi } from "vitest";

import { readKept, saveKept, withDeadline } from "./diskStore";
import { toRecord } from "./record";

afterEach(() => {
  vi.useRealTimers();
});

describe("withDeadline", () => {
  test("settles with the value when it comes first", async () => {
    vi.useFakeTimers();
    let release: (value: string) => void = () => undefined;
    const result = withDeadline(new Promise<string>((resolve) => (release = resolve)), 3000, "late");

    await vi.advanceTimersByTimeAsync(2999);
    release("value");

    await expect(result).resolves.toBe("value");
  });

  test("settles with the fallback after the deadline", async () => {
    vi.useFakeTimers();
    const result = withDeadline(new Promise<string>(() => undefined), 3000, "late");

    await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBe("late");
  });

  test("a value after the deadline changes nothing", async () => {
    vi.useFakeTimers();
    let release: (value: string) => void = () => undefined;
    const result = withDeadline(new Promise<string>((resolve) => (release = resolve)), 3000, "late");

    await vi.advanceTimersByTimeAsync(3000);
    release("value");

    await expect(result).resolves.toBe("late");
  });

  test("no timer is left running once settled", async () => {
    vi.useFakeTimers();

    await withDeadline(Promise.resolve("value"), 3000, "late");

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("without browser storage", () => {
  test("reading reports storage as unavailable", async () => {
    expect(typeof indexedDB).toBe("undefined");
    await expect(readKept(3000)).resolves.toEqual({ kind: "unavailable" });
  });

  test("saving does nothing and does not throw", async () => {
    expect(() => saveKept(toRecord([]))).not.toThrow();
    await expect(readKept(3000)).resolves.toEqual({ kind: "unavailable" });
  });
});
