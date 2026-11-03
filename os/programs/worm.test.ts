import { describe, expect, test } from "vitest";

import { createDisk, type Disk } from "../fs/disk";
import { ARCHIVE, directory, opaqueFile, textFile } from "../fs/entries";
import { readFile } from "../fs/operations";
import type { Entry } from "../fs/types";
import { createClock } from "../shell/clock";
import type { Screen } from "../terminal/screen";
import { programmeFiles } from "./files";
import type { Exited, ProgrammeEvent, ProgrammeKey, Running } from "./types";
import { HORIZONTAL_TICK_MS, VERTICAL_TICK_MS, WORM } from "./worm";
import { createGame } from "./wormGame";
import { LOG_PATH } from "./wormLog";
import { drawGame, KEYS_ROW, MESSAGES } from "./wormScreen";

const context = (now: number) => ({
  disk: { ...createDisk(), cwd: "C:\\ODDWARE" },
  clock: createClock(0),
  now,
  history: [],
  commands: [],
  files: programmeFiles("C:\\ODDWARE", createClock(0)),
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

const exitOf = (state: Running, now = 0): Exited => {
  const exited = state.step({ type: "key", key: { type: "escape" }, now });
  if (exited.type !== "exit") throw new Error("the game did not exit");
  return exited;
};

const logIn = (exited: Exited) => {
  if (!exited.disk) return undefined;
  const read = readFile(exited.disk.filesystem, "C:\\", LOG_PATH);
  return read.ok && read.value.kind === "text" ? read.value.text : undefined;
};

const entries = (log: string | undefined) => (log ?? "").split("\r\n").filter((line) => line.startsWith("SESSION "));

const withoutLog = (disk: Disk) => ({
  ...disk,
  filesystem: {
    root: { ...disk.filesystem.root, entries: disk.filesystem.root.entries.filter(({ name }) => name !== "WORM.LOG") },
  },
});

describe("Leaving with Escape", () => {
  test.each([
    ["ready", launch],
    ["playing", playing],
    ["over", finished],
  ] as const)("From each state: %s", (_, state) => {
    expect(exitOf(state()).type).toBe("exit");
  });

  test.each([
    ["playing", playing],
    ["over", finished],
  ] as const)("Nothing left behind: %s", (_, state) => {
    const exited = exitOf(state());
    const before = context(0).disk;

    expect(exited.disk?.cwd).toBe(before.cwd);
    expect(exited.disk && withoutLog(exited.disk)).toEqual(before);
  });

  test("Escape from ready leaves the disk value untouched", () => {
    const exited = exitOf(launch());

    expect(exited).toEqual<Exited>({ type: "exit" });
    expect(exited).not.toHaveProperty("disk");
  });
});

describe("Sessions", () => {
  test("A game that ends", () => {
    const over = finished();
    const log = logIn(exitOf(over));
    const header = text(over.screen)[0];

    expect(entries(log)).toEqual(["SESSION 001"]);
    expect(log).toContain("ENDED      STRUCK WALL");
    expect(log).toContain(`LENGTH ${/LENGTH: (\d+)/.exec(header)?.[1]}`);
    expect(log).toContain(`SCORE ${/SCORE: (\d+)/.exec(header)?.[1]}`);
  });

  test("Quitting mid-game", () => {
    const log = logIn(exitOf(run(playing(), ...ticks(3))));

    expect(entries(log)).toEqual(["SESSION 001"]);
    expect(log).toContain("ENDED      STOPPED BY OPERATOR");
  });

  test("Several games in one run", () => {
    const again = (state: Running) => {
      let next = step(step(state, press("enter")), press("right"));
      for (let count = 0; count < 100 && next.tickMs !== undefined; count += 1) next = step(next, TICK);
      return next;
    };
    const log = logIn(exitOf(again(again(finished()))));

    expect(entries(log)).toEqual(["SESSION 001", "SESSION 002", "SESSION 003"]);
  });

  test("No game played", () => {
    expect(logIn(exitOf(launch()))).toBeUndefined();
  });

  test("Restart without playing", () => {
    expect(entries(logIn(exitOf(step(finished(), press("enter")))))).toEqual(["SESSION 001"]);
  });

  test("the session lasts from the starting key to the end", () => {
    const at = (now: number): ProgrammeEvent => ({ type: "tick", now });
    let state = step(launch(), { type: "key", key: { type: "right" }, now: 10_000 });
    state = run(state, at(20_000), at(40_000));

    expect(logIn(exitOf(state, 93_999))).toContain("TIME 1:23");
  });

  test("food eaten is the growth of the worm", () => {
    const seed = Array.from({ length: 5_000 }, (_, now) => now).find((now) => {
      const { food } = createGame(now);
      return food !== undefined && food.y === 10 && food.x > 40 && food.x < 70;
    });
    if (seed === undefined) throw new Error("no seed puts food ahead of the worm");

    let state = step(launch(seed), press("right"));
    for (let count = 0; count < 35 && !text(state.screen)[0].includes("LENGTH: 4"); count += 1) state = step(state, TICK);

    const log = logIn(exitOf(state));
    expect(log).toContain("SCORE 10   LENGTH 4   FOOD 1");
  });
});

describe("Log write failures", () => {
  const WHEN = new Date(Date.UTC(1993, 8, 20, 16, 48));

  const launchOn = (entry: Entry) =>
    WORM.start(
      { tail: "", params: [], switches: [] },
      {
        ...context(1),
        disk: { filesystem: { root: { ...createDisk().filesystem.root, entries: [...createDisk().filesystem.root.entries, entry] } }, cwd: "C:\\ODDWARE" },
      },
    );

  const playedOn = (entry: Entry) => {
    let state = step(launchOn(entry), press("right"));
    for (let count = 0; count < 100 && state.tickMs !== undefined; count += 1) state = step(state, TICK);
    return state;
  };

  test.each([
    ["Name taken by a directory", directory("WORM.LOG", WHEN)],
    ["Read-only file", textFile("WORM.LOG", WHEN, "OLD\r\n", { ...ARCHIVE, readOnly: true })],
    ["Not a text file", opaqueFile("WORM.LOG", WHEN, 500)],
  ] as const)("%s", (_, entry) => {
    const over = playedOn(entry);

    expect(over.type).toBe("running");
    expect(text(over.screen).join("\n")).toContain(MESSAGES.crashed);
    expect(exitOf(over)).toEqual<Exited>({ type: "exit" });
  });
});
