import { describe, expect, test } from "vitest";

import { createDisk, type Disk } from "../fs/disk";
import { findChild } from "../fs/entries";
import { readFile, writeFile } from "../fs/operations";
import { createClock } from "../shell/clock";
import { MACHINE } from "../machine";
import { chkPath } from "./defragChk";
import {
  advanceDefrag,
  ANALYSIS_TICKS,
  type DefragState,
  type Method,
  startDefrag,
  TICK_MS,
  wantsTicks,
} from "./defragRun";
import { programmeFiles } from "./files";
import type { ProgrammeKey } from "./types";

const NOW = Date.UTC(2026, 10, 1, 12, 0);
const files = programmeFiles("C:\\DOS", createClock(NOW));

const start = (disk: Disk = createDisk(), method?: Method, seed = 11) =>
  startDefrag({ disk, files, capacityMb: MACHINE.fixedDiskMb, moveHidden: false, method, chooseDrive: false, seed });

const press = (state: DefragState, ...keys: readonly ProgrammeKey["type"][]) =>
  keys.reduce(
    (current, type) => advanceDefrag(current, { type: "key", key: { type } as ProgrammeKey, now: NOW }),
    state,
  );

const ticks = (state: DefragState, count: number) =>
  Array.from({ length: count }).reduce<DefragState>((current) => advanceDefrag(current, { type: "tick", now: NOW }), state);

// Ticks until the phase is reached, failing after a long time.
const until = (state: DefragState, done: (state: DefragState) => boolean) => {
  let current = state;
  for (let count = 0; count < 20_000 && !done(current); count += 1) current = advanceDefrag(current, { type: "tick", now: NOW });
  if (!done(current)) throw new Error(`stuck in ${current.phase.kind}`);
  return current;
};

const analysed = (state = start()) => ticks(state, ANALYSIS_TICKS);
const kind = (state: DefragState) => state.phase.kind;
const stage = (state: DefragState) => (state.phase.kind === "optimizing" ? state.phase.stage : undefined);
const count = (state: DefragState, blockKind: string) => state.blocks.filter((block) => block.kind === blockKind).length;
const holding = (state = start()) => until(press(analysed(state), "enter"), (current) => kind(current) === "holding");
const chk = (disk: Disk, number = 0) => findChild(disk.filesystem.root, chkPath(number).slice(3));

describe("Analysis and recommendation", () => {
  test("reads the drive, then recommends Full Optimization", () => {
    const state = analysed();

    expect(kind(start())).toBe("analysing");
    expect(state.phase).toEqual({ kind: "recommend", button: 0, method: "full" });
  });

  test("Optimize starts a full optimization", () => {
    const state = press(analysed(), "enter");

    expect(kind(state)).toBe("optimizing");
    expect(state.method).toBe("full");
  });

  test("Configure opens the Optimize menu", () => {
    expect(press(analysed(), "right", "enter").phase).toEqual({ kind: "main", overlay: { kind: "menu", item: 0 } });
    expect(press(analysed(), "tab", "enter").phase).toEqual({ kind: "main", overlay: { kind: "menu", item: 0 } });
  });
});

describe("The Optimize menu", () => {
  const menu = () => press(analysed(), "escape", "f10");

  test("F10 opens it with Begin Optimization highlighted", () => {
    expect(menu().phase).toEqual({ kind: "main", overlay: { kind: "menu", item: 0 } });
  });

  test("Up and Down move the highlight round the items", () => {
    expect(press(menu(), "down", "down").phase).toEqual({ kind: "main", overlay: { kind: "menu", item: 2 } });
    expect(press(menu(), "up").phase).toEqual({ kind: "main", overlay: { kind: "menu", item: 4 } });
  });

  test("choosing the method changes it", () => {
    const state = press(menu(), "down", "down", "enter", "down", "enter");

    expect(state.method).toBe("unfragment");
    expect(state.phase).toEqual({ kind: "main", overlay: { kind: "none" } });
  });

  test("Tab reaches OK and Cancel in the method dialog", () => {
    const dialog = () => press(menu(), "down", "down", "enter", "down");

    expect(press(dialog(), "tab").phase).toEqual({ kind: "main", overlay: { kind: "method", choice: 1, focus: "ok" } });
    expect(press(dialog(), "tab", "right").phase).toEqual({
      kind: "main",
      overlay: { kind: "method", choice: 1, focus: "cancel" },
    });
    expect(press(dialog(), "tab", "tab", "tab").phase).toEqual({
      kind: "main",
      overlay: { kind: "method", choice: 1, focus: "list" },
    });
    expect(press(dialog(), "tab", "enter").method).toBe("unfragment");
    expect(press(dialog(), "tab", "tab", "enter").method).toBe("full");
    expect(press(dialog(), "tab", "tab", "enter").phase).toEqual({ kind: "main", overlay: { kind: "none" } });
  });

  test("Up and Down leave the choice alone while a button has the focus", () => {
    expect(press(menu(), "down", "down", "enter", "tab", "down").phase).toEqual({
      kind: "main",
      overlay: { kind: "method", choice: 0, focus: "ok" },
    });
  });

  test("Cancel in the drive dialog closes it without reading the drive", () => {
    const drive = () => press(menu(), "down", "enter");

    expect(press(drive(), "tab", "right", "enter").phase).toEqual({ kind: "main", overlay: { kind: "none" } });
    expect(kind(press(drive(), "tab", "enter"))).toBe("analysing");
    expect(press(drive(), "tab", "right", "left").phase).toEqual({ kind: "main", overlay: { kind: "drive", focus: "ok" } });
    expect(press(drive(), "right").phase).toEqual({ kind: "main", overlay: { kind: "drive", focus: "list" } });
    expect(press(drive(), "left").phase).toEqual({ kind: "main", overlay: { kind: "drive", focus: "list" } });
  });

  test("Begin Optimization reads the drive and starts", () => {
    const state = analysed(press(menu(), "enter"));

    expect(kind(state)).toBe("optimizing");
  });

  test("About and Drive open dialogs", () => {
    expect(press(menu(), "down", "down", "down", "enter").phase).toEqual({ kind: "main", overlay: { kind: "about" } });
    expect(press(menu(), "down", "enter").phase).toEqual({ kind: "main", overlay: { kind: "drive", focus: "list" } });
    expect(kind(press(menu(), "down", "enter", "enter"))).toBe("analysing");
  });

  test("Exit leaves", () => {
    expect(kind(press(menu(), "up", "enter"))).toBe("exit");
  });
});

describe("Ordinary optimization", () => {
  const unfragment = () => press(analysed(), "escape", "f10", "down", "down", "enter", "down", "enter", "f10", "enter");

  test("gathers the files into one run and leaves the lost clusters", () => {
    const before = analysed();
    const state = until(analysed(unfragment()), (current) => kind(current) === "finished");
    const used = state.blocks.flatMap((block, index) => (block.kind === "used" ? [index] : []));

    expect(used).toEqual(Array.from({ length: before.map.movable }, (_, block) => before.map.fixed + block));
    expect(count(state, "lost")).toBe(state.map.blocks.filter((block) => block.kind === "lost").length);
    expect(chk(state.disk)).toBeUndefined();
  });

  test("shows reading and writing while it moves blocks", () => {
    const states = Array.from({ length: 120 }).reduce<DefragState[]>(
      (all) => [...all, advanceDefrag(all.at(-1)!, { type: "tick", now: NOW })],
      [press(analysed(), "enter")],
    );

    expect(states.some((state) => state.reading.length > 0)).toBe(true);
    expect(states.some((state) => state.writing.length > 0)).toBe(true);
  });

  test("/U runs it at once and leaves after Finished condensing", () => {
    const state = until(start(createDisk(), "unfragment"), (current) => kind(current) === "finished");

    expect(chk(state.disk)).toBeUndefined();
    expect(kind(press(state, "enter"))).toBe("exit");
  });

  test("the last cluster written stays shown when the run is over", () => {
    const state = until(start(createDisk(), "unfragment"), (current) => kind(current) === "finished");

    expect(state.cluster).toBeGreaterThan(0);
    expect(state.percent).toBe(100);
  });
});

describe("The full optimization goes wrong", () => {
  test("a full run on the seeded disk takes about a minute", () => {
    const optimizing = press(analysed(), "enter");
    let current = optimizing;
    let count = ANALYSIS_TICKS;
    while (kind(current) !== "holding") {
      current = advanceDefrag(current, { type: "tick", now: NOW });
      count += 1;
    }
    const seconds = (count * TICK_MS) / 1000;

    expect(seconds).toBeGreaterThan(50);
    expect(seconds).toBeLessThan(80);
  });

  test("the picture does not fill from the top down", () => {
    const state = until(press(analysed(), "enter"), (current) => stage(current) === "assembling");
    const firstRows = state.phase.kind === "optimizing" ? state.phase.moves.slice(0, 40).map(({ to }) => Math.floor(to / 78)) : [];

    expect(new Set(firstRows).size).toBeGreaterThan(5);
  });

  test("counts past the last cluster before the lost clusters move", () => {
    const state = until(press(analysed(), "enter"), (current) => stage(current) === "overrun");
    const later = ticks(state, 10);

    expect(later.cluster).toBeGreaterThan(later.map.totalClusters);
  });

  test("the lost clusters form the picture", () => {
    const state = holding();

    expect(count(state, "lost")).toBe(0);
    expect(count(state, "picture")).toBe(state.map.targets.length);
    expect(state.map.targets.length).toBeGreaterThan(200);
  });

  test("the picture is held and animates until a key", () => {
    const frames = Array.from({ length: 200 }).reduce<DefragState[]>(
      (all) => [...all, advanceDefrag(all.at(-1)!, { type: "tick", now: NOW })],
      [holding()],
    );
    const later = frames.at(-1)!;

    expect(kind(later)).toBe("holding");
    expect(new Set(frames.map((state) => JSON.stringify(state.blocks))).size).toBeGreaterThan(1);
    expect(wantsTicks(later)).toBe(true);
  });

  test("a key writes FILE0000.CHK and shows Finished condensing", () => {
    const state = press(holding(), "enter");
    const text = readFile(state.disk.filesystem, "C:\\", chkPath(0));

    expect(kind(state)).toBe("finished");
    expect(text.ok && text.value.kind === "text" && text.value.text).toMatch(/ORDINARY DATA DEVICES XRS 0000: /);
    expect(count(state, "picture")).toBe(0);
    expect(count(state, "lost")).toBe(0);
  });

  test("the first picture is the smiley and the next the alien", () => {
    const first = press(holding(), "enter");
    const second = holding(start(first.disk));

    expect(holding().picture.name).toBe("smiley");
    expect(second.picture.name).toBe("alien");
    expect(chk(press(second, "enter").disk, 1)).toBeDefined();
  });

  test("Escape stops the run and writes nothing", () => {
    const forming = until(press(analysed(), "enter"), (current) => stage(current) === "assembling");
    const stopped = press(ticks(forming, 20), "escape");

    expect(stopped.phase).toEqual({ kind: "ended", button: 0 });
    expect(stopped.disk).toBe(forming.disk);
  });

  test("/F leaves after Finished condensing is acknowledged", () => {
    const state = press(until(start(createDisk(), "full"), (current) => kind(current) === "holding"), "enter");

    expect(chk(state.disk)).toBeDefined();
    expect(kind(press(state, "enter"))).toBe("exit");
  });

  test("a full disk writes no file", () => {
    const state = startDefrag({ disk: createDisk(), files, capacityMb: 0, moveHidden: false, method: "full", chooseDrive: false, seed: 3 });
    const done = until(state, (current) => kind(current) === "holding" || kind(current) === "finished");

    expect(chk(press(done, "enter").disk)).toBeUndefined();
  });

  test("a deleted FILE0000.CHK is written again", () => {
    const written = writeFile(createDisk().filesystem, "C:\\", chkPath(1), "x", new Date(NOW));
    if (!written.ok) throw new Error(written.error);

    expect(holding(start({ filesystem: written.value, cwd: "C:\\" })).number).toBe(0);
  });
});

describe("Where the picture forms", () => {
  // A disk on which the next recovered file is FILE000n.CHK, so picture n is drawn.
  const diskFor = (pictures: number, extra = "") => {
    let filesystem = createDisk().filesystem;
    for (let number = 0; number < pictures; number += 1) {
      const written = writeFile(filesystem, "C:\\", chkPath(number), "x", new Date(NOW));
      if (!written.ok) throw new Error(written.error);
      filesystem = written.value;
    }
    if (extra !== "") {
      const written = writeFile(filesystem, "C:\\", "C:\\BIG.DAT", extra, new Date(NOW));
      if (!written.ok) throw new Error(written.error);
      filesystem = written.value;
    }
    return { filesystem, cwd: "C:\\" };
  };

  const rows = (state: DefragState, wanted: (kind: string) => boolean) =>
    state.blocks.flatMap((block, index) => (wanted(block.kind) ? [Math.floor(index / 78)] : []));

  test.each([0, 1, 2, 3, 4, 5])("picture %i leaves a blank row below the files", (pictures) => {
    const held = holding(start(diskFor(pictures)));
    const lastFileRow = Math.max(...rows(held, (blockKind) => blockKind === "used" || blockKind === "unmovable"));

    expect(Math.min(...rows(held, (blockKind) => blockKind === "picture"))).toBeGreaterThan(lastFileRow + 1);
  });

  test("a disk with more files moves the picture further down", () => {
    const held = holding(start(diskFor(0, "x".repeat(20_000_000))));
    const lastFileRow = Math.max(...rows(held, (blockKind) => blockKind === "used" || blockKind === "unmovable"));

    expect(lastFileRow).toBeGreaterThan(0);
    expect(Math.min(...rows(held, (blockKind) => blockKind === "picture"))).toBeGreaterThan(lastFileRow + 1);
  });
});

describe("The end of a run and leaving", () => {
  const ended = () => press(press(holding(), "enter"), "enter");

  test("the end dialog offers Another Drive, Configure and Exit DEFRAG", () => {
    expect(ended().phase).toEqual({ kind: "ended", button: 0 });
    expect(press(ended(), "enter").phase).toEqual({ kind: "main", overlay: { kind: "drive", focus: "list" } });
    expect(press(ended(), "right", "enter").phase).toEqual({ kind: "main", overlay: { kind: "menu", item: 0 } });
    expect(kind(press(ended(), "left", "enter"))).toBe("exit");
  });

  test("Another Drive reads the drive again and finds lost clusters again", () => {
    const again = analysed(press(ended(), "enter", "enter"));

    expect(kind(again)).toBe("recommend");
    expect(count(again, "lost")).toBeGreaterThan(0);
  });

  test("Escape on the main screen leaves", () => {
    expect(kind(press(analysed(), "escape", "escape"))).toBe("exit");
  });

  test.each([
    ["analysing", () => start()],
    ["recommend", () => analysed()],
    ["menu", () => press(analysed(), "escape", "f10")],
    ["method dialog", () => press(analysed(), "escape", "f10", "down", "down", "enter")],
    ["about", () => press(analysed(), "escape", "f10", "down", "down", "down", "enter")],
    ["optimizing", () => ticks(press(analysed(), "enter"), 5)],
    ["holding", () => holding()],
    ["finished", () => press(holding(), "enter")],
    ["ended", () => ended()],
  ])("repeated Escape from %s reaches the prompt", (_, make) => {
    const state = press(make(), "escape", "escape", "escape", "escape", "escape");

    expect(kind(state)).toBe("exit");
  });
});
