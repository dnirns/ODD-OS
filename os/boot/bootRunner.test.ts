import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createScreen, type Screen, writeText } from "../terminal/screen";
import { startBoot } from "./bootRunner";
import { applySteps, type BootStep, createBootScreen, createBootSteps } from "./bootSteps";

const letter = (char: string, delayMs: number): BootStep => ({
  delayMs,
  apply: (screen) => writeText(screen, 0, "abc".indexOf(char), char),
});

const steps = [letter("a", 100), letter("b", 200), letter("c", 300)];
const totalDelay = 600;

const start = (overrides: Partial<Parameters<typeof startBoot>[0]> = {}) => {
  const onScreen = vi.fn<(screen: Screen) => void>();
  const onComplete = vi.fn<(screen: Screen) => void>();
  const handle = startBoot({
    screen: createScreen(),
    steps,
    onScreen,
    onComplete,
    ...overrides,
  });

  return { handle, onScreen, onComplete };
};

const firstRow = (screen: Screen) =>
  screen.rows[0].map((cell) => cell.char).join("").trimEnd();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startBoot", () => {
  test("does not update the screen synchronously", () => {
    const { onScreen, onComplete } = start();

    expect(onScreen).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("delivers each step's screen after its delay, in order", () => {
    const { onScreen } = start();

    vi.advanceTimersByTime(99);
    expect(onScreen).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onScreen).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(totalDelay);
    expect(onScreen.mock.calls.map(([screen]) => firstRow(screen))).toEqual([
      "a",
      "ab",
      "abc",
    ]);
  });

  test("calls onComplete once, with no timers left", () => {
    const { onComplete } = start();

    vi.advanceTimersByTime(totalDelay * 2);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("runs one timer at a time while running", () => {
    start();

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("skip", () => {
  test("applies the remaining steps at once and completes", () => {
    const { handle, onScreen, onComplete } = start();

    vi.advanceTimersByTime(100);
    handle.skip();

    expect(onScreen).toHaveBeenCalledTimes(2);
    expect(firstRow(onScreen.mock.lastCall![0])).toBe("abc");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("gives the same final screen as running to completion", () => {
    const bootSteps = createBootSteps();
    const skipped = start({ screen: createBootScreen(), steps: bootSteps });
    vi.advanceTimersByTime(1000);
    skipped.handle.skip();

    const completed = start({ screen: createBootScreen(), steps: bootSteps });
    vi.advanceTimersByTime(
      bootSteps.reduce((total, { delayMs }) => total + delayMs, 0),
    );

    const expected = applySteps(createBootScreen(), bootSteps);
    expect(skipped.onScreen.mock.lastCall![0]).toEqual(expected);
    expect(completed.onScreen.mock.lastCall![0]).toEqual(expected);
    expect(skipped.onComplete).toHaveBeenCalledExactlyOnceWith(expected);
    expect(completed.onComplete).toHaveBeenCalledExactlyOnceWith(expected);
  });

  test("works before the first step has run", () => {
    const { handle, onScreen } = start();

    handle.skip();

    expect(firstRow(onScreen.mock.lastCall![0])).toBe("abc");
  });

  test("does nothing after the boot has finished", () => {
    const { handle, onScreen, onComplete } = start();
    vi.advanceTimersByTime(totalDelay);

    handle.skip();

    expect(onScreen).toHaveBeenCalledTimes(3);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("does nothing after being skipped", () => {
    const { handle, onScreen, onComplete } = start();
    handle.skip();

    handle.skip();
    vi.advanceTimersByTime(totalDelay);

    expect(onScreen).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("stop", () => {
  test("clears the timer and sends no further callbacks", () => {
    const { handle, onScreen, onComplete } = start();

    vi.advanceTimersByTime(100);
    handle.stop();
    vi.advanceTimersByTime(totalDelay);

    expect(onScreen).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("stops a boot that has not started any step", () => {
    const { handle, onScreen } = start();

    handle.stop();
    vi.advanceTimersByTime(totalDelay);

    expect(onScreen).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("prevents a later skip from doing anything", () => {
    const { handle, onScreen, onComplete } = start();

    handle.stop();
    handle.skip();

    expect(onScreen).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("does nothing after the boot has finished", () => {
    const { handle, onComplete } = start();
    vi.advanceTimersByTime(totalDelay);

    handle.stop();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
