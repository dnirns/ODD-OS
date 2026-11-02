import { describe, expect, test } from "vitest";

import { createDisk } from "../fs/disk";
import { createClock } from "../shell/clock";
import type { Screen } from "../terminal/screen";
import type { Exited, ProgrammeEvent, ProgrammeKey, Running } from "./types";
import { HORIZONTAL_TICK_MS, VERTICAL_TICK_MS, WORM } from "./worm";
import { createGame } from "./wormGame";
import { drawGame, KEYS_ROW, MESSAGES } from "./wormScreen";

const context = (now: number) => ({
  disk: createDisk(),
  clock: createClock(0),
  now,
  history: [],
  commands: [],
});

const launch = (now = 1) => WORM.start({ tail: "", params: [], switches: [] }, context(now));

const key = (pressed: ProgrammeKey): ProgrammeEvent => ({ type: "key", key: pressed, now: 0 });
const press = (type: Exclude<ProgrammeKey["type"], "char">) => key({ type } as ProgrammeKey);
const typed = (char: string) => key({ type: "char", char });
const TICK: ProgrammeEvent = { type: "tick", now: 0 };

const step = (state: Running, event: ProgrammeEvent): Running => {
  const next = state.step(event);
  if (next.type !== "running") throw new Error("the game exited");
  return next;
};

const run = (state: Running, ...events: readonly ProgrammeEvent[]) => events.reduce(step, state);

const ticks = (count: number) => Array.from({ length: count }, () => TICK);

const text = (screen: Screen) => screen.rows.map((cells) => cells.map(({ char }) => char).join(""));

const playing = () => step(launch(), press("right"));

const finished = () => {
  let state = playing();
  for (let count = 0; count < 100 && state.tickMs !== undefined; count += 1) state = step(state, TICK);
  return state;
};

describe("Launching", () => {
  test("opens ready, seeded from the launch time", () => {
    const state = launch(42);

    expect(state.type).toBe("running");
    expect(state.screen).toEqual(drawGame(createGame(42)));
    expect(text(state.screen)[KEYS_ROW]).toContain("Press an arrow key to start");
  });

  test("launches at different times give different food", () => {
    const screens = new Set(Array.from({ length: 20 }, (_, now) => JSON.stringify(launch(now * 1_000).screen)));

    expect(screens.size).toBeGreaterThan(15);
  });

  test("arguments are ignored", () => {
    const withArguments = WORM.start({ tail: " /x foo", params: ["foo"], switches: ["/X"] }, context(7));

    expect(withArguments.screen).toEqual(launch(7).screen);
  });
});

describe("No timer outside play", () => {
  test("Ready", () => {
    expect(launch().tickMs).toBeUndefined();
  });

  test("Playing", () => {
    expect(playing().tickMs).toBe(HORIZONTAL_TICK_MS);
    expect(HORIZONTAL_TICK_MS).toBe(120);
  });

  test("Over", () => {
    const state = finished();

    expect(text(state.screen).join("\n")).toContain(MESSAGES.crashed);
    expect(state.tickMs).toBeUndefined();
  });

  test("Restart", () => {
    const again = step(finished(), press("enter"));

    expect(again.tickMs).toBeUndefined();
    expect(step(again, press("up")).tickMs).toBe(HORIZONTAL_TICK_MS);
  });
});

describe("Even speed on screen", () => {
  test("a vertical move takes 16/9 as long as a horizontal one", () => {
    expect(VERTICAL_TICK_MS).toBe(213);
    expect(VERTICAL_TICK_MS / HORIZONTAL_TICK_MS).toBeCloseTo(16 / 9, 2);
  });

  test("the interval follows the last move made, not the key pressed", () => {
    const turned = step(playing(), press("up"));

    expect(turned.tickMs).toBe(HORIZONTAL_TICK_MS);
    expect(step(turned, TICK).tickMs).toBe(VERTICAL_TICK_MS);
    expect(run(turned, TICK, press("left"), TICK).tickMs).toBe(HORIZONTAL_TICK_MS);
  });

  test("a turn waiting for its move keeps the interval", () => {
    const moving = playing();

    expect(run(moving, press("up"), press("down"), press("up")).tickMs).toBe(moving.tickMs);
  });
});

describe("Playing through events", () => {
  test("ticks move the worm", () => {
    const start = playing();
    const moved = step(start, TICK);

    expect(moved).not.toBe(start);
    expect(moved.screen).not.toEqual(start.screen);
  });

  test("Left does not start", () => {
    const ready = launch();

    expect(step(ready, press("left"))).toBe(ready);
  });

  test("each of Up, Down and Right starts play", () => {
    (["up", "down", "right"] as const).forEach((direction) => {
      expect(step(launch(), press(direction)).tickMs).toBeDefined();
    });
  });

  test("Restart shows the opening screen again", () => {
    const again = step(finished(), press("enter"));

    expect(text(again.screen)[0]).toContain("SCORE: 0");
    expect(text(again.screen)[0]).toContain("LENGTH: 3");
    expect(text(again.screen)[KEYS_ROW]).toContain("Press an arrow key to start");
  });

  test("Still: ticks and arrows after the end change nothing", () => {
    const over = finished();

    expect(run(over, TICK, TICK, press("up"), press("left"))).toBe(over);
  });

  test("Enter does nothing earlier", () => {
    const ready = launch();
    const moving = playing();

    expect(step(ready, press("enter"))).toBe(ready);
    expect(step(moving, press("enter"))).toBe(moving);
  });

  test("Ticks while not playing", () => {
    const ready = launch();

    expect(run(ready, ...ticks(5))).toBe(ready);
  });
});

describe("Other keys", () => {
  const ignored: readonly ProgrammeEvent[] = [
    typed("x"),
    typed(" "),
    typed("7"),
    press("backspace"),
    press("delete"),
    press("home"),
    press("end"),
    press("insert"),
    press("pageUp"),
    press("pageDown"),
    press("ignore"),
  ];

  test.each([
    ["ready", launch],
    ["playing", playing],
    ["over", finished],
  ] as const)("Letters and Space change nothing while %s", (_, state) => {
    const before = state();

    ignored.forEach((event) => expect(step(before, event)).toBe(before));
  });
});

describe("Leaving with Escape", () => {
  test.each([
    ["ready", launch],
    ["playing", playing],
    ["over", finished],
  ] as const)("From each state: %s", (_, state) => {
    const exited = state().step(press("escape"));

    expect(exited).toEqual<Exited>({ type: "exit" });
    expect(exited).not.toHaveProperty("disk");
  });

  test("Escape mid-game, after some moves", () => {
    expect(run(playing(), ...ticks(3)).step(press("escape"))).toEqual({ type: "exit" });
  });
});
