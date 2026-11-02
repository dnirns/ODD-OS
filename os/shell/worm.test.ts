import { describe, expect, test } from "vitest";

import { createDisk } from "../fs/disk";
import { HORIZONTAL_TICK_MS, VERTICAL_TICK_MS } from "../programs/worm";
import { createScreen, moveCursor, type Screen, writeText } from "../terminal/screen";
import { createShell, reduceShell, type ShellState, tickInterval, tickShell } from "./shell";
import type { ShellKey } from "./shellKeys";

const NOW = Date.UTC(2026, 10, 2, 12, 0);
const CLOCK = { offsetMs: Date.UTC(1993, 10, 2, 15, 45, 12, 340) - NOW };

const key = (type: Exclude<ShellKey["type"], "char">): ShellKey => ({ type });
const type = (text: string): ShellKey[] => Array.from(text, (char) => ({ type: "char", char }));
const enter = key("enter");
const escape = key("escape");

const press = (state: ShellState, ...keys: readonly ShellKey[]) =>
  keys.reduce((current, item) => reduceShell(current, { key: item, now: NOW }), state);

const run = (state: ShellState, line: string) => press(state, ...type(line), enter);

const tick = (state: ShellState, count = 1) =>
  Array.from({ length: count }).reduce<ShellState>((current) => tickShell(current, NOW), state);

const rowText = (screen: Screen, row: number) => screen.rows[row].map(({ char }) => char).join("").trimEnd();

const allRows = (screen: Screen) => screen.rows.map((_, row) => rowText(screen, row));

const headAt = (screen: Screen) => {
  const row = screen.rows.findIndex((cells) => cells.some(({ char }) => char === "@"));
  return { row, column: screen.rows[row].findIndex(({ char }) => char === "@") };
};

const shellIn = (cwd: string) => {
  const prompt = `${cwd}>`;
  const screen = moveCursor(
    writeText(writeText(createScreen(), 0, 0, "earlier output"), 2, 0, prompt),
    2,
    prompt.length,
  );

  return createShell(screen, CLOCK, { ...createDisk(), cwd });
};

const inGame = () => run(shellIn("C:\\ODDWARE"), "worm");

const isGame = (state: ShellState) => allRows(state.screen)[0].includes("WORM") && state.running !== undefined;

describe("Launching WORM.EXE", () => {
  test("From its own directory", () => {
    const shell = inGame();

    expect(isGame(shell)).toBe(true);
    expect(allRows(shell.screen).join("\n")).not.toContain("C:\\ODDWARE>");
    expect(allRows(shell.screen)[24]).toContain("Press an arrow key to start");
  });

  test("From the root", () => {
    expect(isGame(run(shellIn("C:\\"), "oddware\\worm"))).toBe(true);
  });

  test.each(["C:\\", "C:\\DOS", "C:\\ODDWARE"])("Full path and extension from %s", (cwd) => {
    expect(isGame(run(shellIn(cwd), "c:\\oddware\\worm.exe"))).toBe(true);
  });

  test("any letter case", () => {
    expect(isGame(run(shellIn("C:\\ODDWARE"), "WoRm"))).toBe(true);
  });

  test("Outside the search path", () => {
    const shell = run(shellIn("C:\\"), "worm");

    expect(shell.running).toBeUndefined();
    expect(rowText(shell.screen, 3)).toBe("Bad command or file name");
  });

  test("Arguments", () => {
    expect(isGame(run(shellIn("C:\\ODDWARE"), "worm /x foo"))).toBe(true);
  });

  test("the launching line is in the history", () => {
    expect(inGame().history.entries).toEqual(["worm"]);
  });
});

describe("Playing through the shell", () => {
  test("no timer while ready", () => {
    expect(tickInterval(inGame())).toBeUndefined();
  });

  test("ticks while ready change nothing", () => {
    const shell = inGame();

    expect(tick(shell, 5).screen).toBe(shell.screen);
  });

  test("an arrow key starts play", () => {
    expect(tickInterval(press(inGame(), key("right")))).toBe(HORIZONTAL_TICK_MS);
  });

  test("vertical moves tick more slowly than horizontal ones", () => {
    const climbing = tick(press(inGame(), key("up")), 1);

    expect(tickInterval(climbing)).toBe(VERTICAL_TICK_MS);
    expect(tickInterval(tick(press(climbing, key("left")), 1))).toBe(HORIZONTAL_TICK_MS);
  });

  test("ticks move the worm", () => {
    const start = press(inGame(), key("right"));
    const moved = tick(start, 3);

    expect(headAt(moved.screen)).toEqual({ row: headAt(start.screen).row, column: headAt(start.screen).column + 3 });
  });

  test("a wall ends the game, stops the timer, and Enter restarts", () => {
    const over = tick(press(inGame(), key("right")), 60);

    expect(allRows(over.screen).join("\n")).toContain("GAME OVER");
    expect(tickInterval(over)).toBeUndefined();

    const again = press(over, enter);

    expect(allRows(again.screen).join("\n")).not.toContain("GAME OVER");
    expect(allRows(again.screen)[0]).toContain("SCORE: 0");
    expect(tickInterval(again)).toBeUndefined();
    expect(again.running).toBeDefined();
  });

  test("Enter while playing starts no command and does not restart", () => {
    const moving = press(inGame(), key("up"));

    expect(press(moving, ...type("ver"), enter).screen).toBe(moving.screen);
  });
});

describe("Leaving with Escape", () => {
  const states: readonly [string, () => ShellState][] = [
    ["ready", inGame],
    ["playing", () => tick(press(inGame(), key("down")), 2)],
    ["over", () => tick(press(inGame(), key("right")), 60)],
  ];

  test.each(states)("From each state: %s", (_, state) => {
    const shell = press(state(), escape);

    expect(shell.running).toBeUndefined();
    expect(allRows(shell.screen).slice(0, 6)).toEqual([
      "earlier output",
      "",
      "C:\\ODDWARE>worm",
      "",
      "C:\\ODDWARE>",
      "",
    ]);
    expect(shell.screen.cursor).toMatchObject({ row: 4, column: "C:\\ODDWARE>".length, visible: true });
    expect(tickInterval(shell)).toBeUndefined();
  });

  test.each(states)("Nothing left behind: %s", (_, state) => {
    const before = shellIn("C:\\ODDWARE");
    const shell = press(state(), escape);

    expect(shell.disk).toEqual(before.disk);
    expect(shell.history.entries).toEqual(["worm"]);
  });

  test("Back at the prompt", () => {
    const shell = press(inGame(), key("up"), escape, ...type("ver"));

    expect(shell.line).toBe("ver");
    expect(rowText(shell.screen, shell.screen.cursor.row)).toBe("C:\\ODDWARE>ver");
  });

  test("Up after leaving recalls the launching line", () => {
    expect(press(inGame(), escape, key("up")).line).toBe("worm");
  });

  test("a tick after leaving changes nothing", () => {
    const shell = press(press(inGame(), key("right")), escape);

    expect(tickShell(shell, NOW)).toBe(shell);
  });

  test("Every launch is a new game", () => {
    const left = press(tick(press(inGame(), key("right")), 60), escape);
    const again = run(left, "worm");

    expect(allRows(again.screen)[0]).toContain("SCORE: 0");
    expect(allRows(again.screen)[0]).toContain("LENGTH: 3");
    expect(allRows(again.screen)[24]).toContain("Press an arrow key to start");
  });
});
