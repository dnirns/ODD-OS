import { describe, expect, test } from "vitest";

import { createDisk, type Disk } from "../fs/disk";
import { ARCHIVE, directory, opaqueFile, textFile } from "../fs/entries";
import { readFile } from "../fs/operations";
import { locate } from "../fs/path";
import type { Entry, FileEntry } from "../fs/types";
import { createClock } from "../shell/clock";
import type { Screen } from "../terminal/screen";
import { programmeFiles } from "./files";
import type { Exited, ProgrammeEvent, ProgrammeKey, Running } from "./types";
import { MOVE_MS, WORM } from "./worm";
import { createGame, type Direction, HEIGHT } from "./wormGame";
import { HI_PATH } from "./wormHighScore";
import { LOG_PATH } from "./wormLog";
import { drawGame, FIELD_LEFT, FIELD_TOP, FOOD, HEAD, KEYS_ROW, MESSAGE_ROW, MESSAGES } from "./wormScreen";

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
    expect(state.screen).toEqual(drawGame(createGame(42), 0));
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
    expect(playing().tickMs).toBe(MOVE_MS);
    expect(MOVE_MS).toBe(120);
  });

  test("Over", () => {
    const state = finished();

    expect(text(state.screen).join("\n")).toContain(MESSAGES.crashed);
    expect(state.tickMs).toBeUndefined();
  });

  test("Restart", () => {
    const again = step(finished(), press("enter"));

    expect(again.tickMs).toBeUndefined();
    expect(step(again, press("up")).tickMs).toBe(MOVE_MS);
  });
});

describe("One move per tick", () => {
  test("every direction moves at the same interval", () => {
    const climbing = step(step(playing(), press("up")), TICK);

    expect(climbing.tickMs).toBe(MOVE_MS);
    expect(run(climbing, press("left"), TICK).tickMs).toBe(MOVE_MS);
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

// The disk without the two files the game may write: C:\WORM.LOG and C:\ODDWARE\WORM.HI.
const withoutGameFiles = (disk: Disk) => ({
  ...disk,
  filesystem: {
    root: {
      ...disk.filesystem.root,
      entries: disk.filesystem.root.entries
        .filter(({ name }) => name !== "WORM.LOG")
        .map((entry) =>
          entry.kind === "directory" && entry.name === "ODDWARE"
            ? { ...entry, entries: entry.entries.filter(({ name }) => name !== "WORM.HI") }
            : entry,
        ),
    },
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
    expect(exited.disk && withoutGameFiles(exited.disk)).toEqual(before);
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

// High score. A small bot steers the worm to the food so that games reach
// real scores; every figure is read back from the screen it produces.

const WHEN = new Date(Date.UTC(1993, 8, 20, 16, 48));

const header = (state: Running) => text(state.screen)[0];
const figure = (state: Running, label: string) => Number(new RegExp(`${label}: (\\d+)`).exec(header(state))?.[1]);
const scoreOf = (state: Running) => figure(state, "SCORE");
const hiOf = (state: Running) => figure(state, "HI");

const find = (state: Running, char: string) => {
  const rows = text(state.screen);
  for (let y = 0; y < HEIGHT; y += 1) {
    const x = rows[FIELD_TOP + y].indexOf(char, FIELD_LEFT) - FIELD_LEFT;
    if (x >= 0) return { x, y };
  }
  throw new Error(`no ${char} on the playfield`);
};

const OPPOSITE: Readonly<Record<Direction, Direction>> = { up: "down", down: "up", left: "right", right: "left" };

// Plays from the ready screen until the score is at least `target`.
const chase = (ready: Running, target: number): Running => {
  let heading: Direction = "right";
  let state = step(ready, press(heading));

  for (let count = 0; count < 5_000 && scoreOf(state) < target; count += 1) {
    if (state.tickMs === undefined) throw new Error("the worm crashed while chasing");

    const head = find(state, HEAD);
    const food = find(state, FOOD);
    const across: Direction | undefined = food.x > head.x ? "right" : food.x < head.x ? "left" : undefined;
    const along: Direction | undefined = food.y > head.y ? "down" : food.y < head.y ? "up" : undefined;
    let wanted: Direction = across ?? along ?? heading;

    if (wanted === OPPOSITE[heading]) {
      const vertical: boolean = heading === "up" || heading === "down";
      wanted = vertical ? (across ?? (head.x > 0 ? "left" : "right")) : (along ?? (head.y > 0 ? "up" : "down"));
    }

    heading = wanted;
    state = run(state, press(heading), TICK);
  }

  return state;
};

// Runs straight on until the game is over.
const crash = (state: Running) => {
  let next = state;
  for (let count = 0; count < 100 && next.tickMs !== undefined; count += 1) next = step(next, TICK);
  return next;
};

const diskWith = ({ hi, log }: { readonly hi?: Entry; readonly log?: Entry }): Disk => {
  const { root } = createDisk().filesystem;
  const entries = root.entries.map((entry) =>
    hi && entry.kind === "directory" && entry.name === "ODDWARE" ? { ...entry, entries: [...entry.entries, hi] } : entry,
  );

  return { filesystem: { root: { ...root, entries: log ? [...entries, log] : entries } }, cwd: "C:\\ODDWARE" };
};

const launchWith = (files: { readonly hi?: Entry; readonly log?: Entry }) =>
  WORM.start({ tail: "", params: [], switches: [] }, { ...context(1), disk: diskWith(files) });

const storedHi = (text: string, readOnly = false) => textFile("WORM.HI", WHEN, text, { ...ARCHIVE, readOnly });

const hiFile = (exited: Exited): FileEntry | undefined => {
  if (!exited.disk) return undefined;
  const located = locate(exited.disk.filesystem, "C:\\", HI_PATH);
  return located.kind === "found" && located.entry.kind === "file" ? located.entry : undefined;
};

const hiText = (exited: Exited) => {
  const content = hiFile(exited)?.content;
  return content?.kind === "text" ? content.text : undefined;
};

describe("Reading the record", () => {
  test("Missing", () => {
    expect(header(launch())).toContain("HI: 0");
  });

  test("A stored record", () => {
    expect(header(launchWith({ hi: storedHi("450\r\n") }))).toContain("HI: 450");
  });

  test.each([
    ["Not a number", storedHi("HELLO\r\n")],
    ["Name taken by a directory", directory("WORM.HI", WHEN)],
    ["Not a text file", opaqueFile("WORM.HI", WHEN, 2)],
  ] as const)("%s counts as 0, with no message", (_, entry) => {
    const ready = launchWith({ hi: entry });

    expect(header(ready)).toContain("HI: 0");
    expect(text(ready.screen).slice(FIELD_TOP, FIELD_TOP + HEIGHT).join("")).not.toMatch(/[A-Z]{2}/);
  });
});

describe("The record during play", () => {
  test("Passing the record", () => {
    const state = chase(launchWith({ hi: storedHi("20\r\n") }), 30);

    expect(scoreOf(state)).toBe(30);
    expect(hiOf(state)).toBe(30);
  });

  test("Below the record", () => {
    const state = chase(launchWith({ hi: storedHi("450\r\n") }), 30);

    expect(hiOf(state)).toBe(450);
  });

  test("After a restart", () => {
    const over = crash(chase(launch(), 80));
    const again = step(over, press("enter"));

    expect(scoreOf(again)).toBe(0);
    expect(hiOf(again)).toBe(scoreOf(over));
    expect(scoreOf(over)).toBeGreaterThanOrEqual(80);
  });

  test("Shown even when not saved", () => {
    const over = crash(chase(launchWith({ hi: storedHi("20\r\n", true) }), 50));
    const again = step(over, press("enter"));

    expect(hiOf(again)).toBe(scoreOf(over));
    expect(hiText(exitOf(again))).toBe("20\r\n");
  });
});

describe("Saving a record", () => {
  test("Created by the first record", () => {
    const over = crash(chase(launch(), 120));
    const exited = exitOf(over);

    expect(hiText(exited)).toBe(`${scoreOf(over)}\r\n`);
  });

  test("A score of nothing", () => {
    const over = finished();

    expect(scoreOf(over)).toBe(0);
    expect(hiFile(exitOf(over))).toBeUndefined();
  });

  test("Beaten by a crash", () => {
    const over = crash(chase(launchWith({ hi: storedHi("40\r\n") }), 60));

    expect(hiText(exitOf(over))).toBe(`${scoreOf(over)}\r\n`);
  });

  test("Beaten then quit", () => {
    const state = chase(launchWith({ hi: storedHi("40\r\n") }), 60);
    const exited = exitOf(state);

    expect(hiText(exited)).toBe(`${scoreOf(state)}\r\n`);
    expect(entries(logIn(exited))).toEqual(["SESSION 001"]);
  });

  test("Equalled", () => {
    const state = chase(launchWith({ hi: storedHi("40\r\n") }), 40);
    const exited = exitOf(state);

    expect(scoreOf(state)).toBe(40);
    expect(hiFile(exited)?.modified).toEqual(WHEN);
    expect(hiText(exited)).toBe("40\r\n");
  });

  test("Several games in one run", () => {
    const first = crash(chase(launch(), 30));
    const second = crash(chase(step(first, press("enter")), 10));
    const third = crash(chase(step(second, press("enter")), 50));
    const scores = [first, second, third].map(scoreOf);

    expect(hiText(exitOf(third))).toBe(`${Math.max(...scores)}\r\n`);
  });

  test("Nothing else is left behind", () => {
    const exited = exitOf(crash(chase(launch(), 30)));

    expect(hiFile(exited)).toBeDefined();
    expect(exited.disk && withoutGameFiles(exited.disk)).toEqual(context(0).disk);
  });

  test("Leaving without playing", () => {
    expect(hiFile(exitOf(launch()))).toBeUndefined();
    expect(hiText(exitOf(launchWith({ hi: storedHi("40\r\n") })))).toBeUndefined();
  });

  test("The log cannot be written", () => {
    const log = textFile("WORM.LOG", WHEN, "OLD\r\n", { ...ARCHIVE, readOnly: true });
    const state = chase(launchWith({ log }), 10);
    const exited = exitOf(state);

    expect(hiText(exited)).toBe(`${scoreOf(state)}\r\n`);
    expect(logIn(exited)).toBe("OLD\r\n");
  });

  test("the file takes the DOS time of the write", () => {
    const exited = exitOf(chase(launch(), 10), 123_000);

    expect(hiFile(exited)?.modified).toEqual(new Date(123_000 + createClock(0).offsetMs));
  });
});

describe("Record write failures", () => {
  test("Unusable file kept", () => {
    const exited = exitOf(crash(chase(launchWith({ hi: storedHi("HELLO\r\n") }), 30)));

    expect(hiText(exited)).toBe("HELLO\r\n");
    expect(hiFile(exited)?.modified).toEqual(WHEN);
    expect(entries(logIn(exited))).toEqual(["SESSION 001"]);
  });

  test("Read-only file", () => {
    const over = crash(chase(launchWith({ hi: storedHi("20\r\n", true) }), 50));

    expect(over.type).toBe("running");
    expect(hiText(exitOf(over))).toBe("20\r\n");
  });

  test("Directory in the way", () => {
    const hi = directory("WORM.HI", WHEN);
    const exited = exitOf(crash(chase(launchWith({ hi }), 30)));
    const located = exited.disk && locate(exited.disk.filesystem, "C:\\", HI_PATH);

    expect(located?.kind === "found" && located.entry).toEqual(hi);
  });
});

describe("New high score message", () => {
  const message = (state: Running) => text(state.screen)[MESSAGE_ROW + 1];

  test("A new record", () => {
    expect(message(crash(chase(launchWith({ hi: storedHi("40\r\n") }), 60)))).toContain(MESSAGES.record);
  });

  test("No record", () => {
    const over = crash(chase(launchWith({ hi: storedHi("99999\r\n") }), 40));

    expect(message(over)).not.toContain(MESSAGES.record);
  });

  test("Cleared on restart", () => {
    const again = step(crash(chase(launch(), 20)), press("enter"));

    expect(text(again.screen).join("")).not.toContain(MESSAGES.record);
  });
});
