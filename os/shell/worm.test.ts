import { describe, expect, test } from "vitest";

import { createDisk } from "../fs/disk";
import { readFile } from "../fs/operations";
import { MOVE_MS } from "../programs/worm";
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
    expect(tickInterval(press(inGame(), key("right")))).toBe(MOVE_MS);
  });

  test("vertical moves tick at the same interval as horizontal ones", () => {
    expect(tickInterval(tick(press(inGame(), key("up")), 1))).toBe(MOVE_MS);
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
    const others = (disk: ShellState["disk"]) => ({
      ...disk,
      filesystem: { root: { ...disk.filesystem.root, entries: disk.filesystem.root.entries.filter(({ name }) => name !== "WORM.LOG") } },
    });

    expect(shell.disk.cwd).toBe("C:\\ODDWARE");
    expect(others(shell.disk)).toEqual(before.disk);
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

describe("WORM.LOG through the shell", () => {
  const playOnce = (state: ShellState) => press(tick(press(run(state, "worm"), key("right")), 60), escape);

  const sessions = (count: number, state = shellIn("C:\\ODDWARE")) =>
    Array.from({ length: count }).reduce<ShellState>((current) => playOnce(current), state);

  const logText = (state: ShellState) => {
    const read = readFile(state.disk.filesystem, "C:\\", "C:\\WORM.LOG");
    return read.ok && read.value.kind === "text" ? read.value.text : undefined;
  };

  const screenText = (state: ShellState) => allRows(state.screen).join("\n");

  const logSize = (state: ShellState) => {
    const row = allRows(run(state, "dir \\worm.log").screen).find((text) => text.startsWith("WORM     LOG"));
    return Number(row?.slice(12, 26).replace(/[ ,]/g, ""));
  };

  test("Listed by DIR", () => {
    const rows = allRows(run(sessions(1), "dir \\").screen);
    const credits = rows.findIndex((text) => text.startsWith("CREDITS  TXT"));

    expect(rows[credits + 1]).toMatch(/^WORM {5}LOG +\d+ 11-02-93 {3}3:45p$/);
    expect(rows.some((text) => /^ +6 file\(s\)/.test(text))).toBe(true);
  });

  test("Shown by TYPE", () => {
    const text = screenText(run(sessions(1), "type \\worm.log"));

    expect(text).toContain("WORM.EXE SESSION LOG");
    expect(text).toContain("SESSION 001");
    expect(text).toContain("ENDED      STRUCK WALL");
  });

  test("No game played leaves no log", () => {
    const shell = press(run(shellIn("C:\\ODDWARE"), "worm"), escape);

    expect(logText(shell)).toBeUndefined();
    expect(screenText(run(shell, "dir \\worm.log"))).toContain("File not found");
  });

  test("Second session in a later run, and a growing file", () => {
    const once = sessions(1);
    const twice = playOnce(once);

    expect(logText(twice)?.startsWith(logText(once) ?? "?")).toBe(true);
    expect(logText(twice)).toContain("SESSION 002");
    expect(logSize(twice)).toBeGreaterThan(logSize(once));
  });

  test("Several games in one run", () => {
    const again = (state: ShellState) => tick(press(state, enter, key("right")), 60);
    const shell = press(again(again(tick(press(run(shellIn("C:\\ODDWARE"), "worm"), key("right")), 60))), escape);

    expect(logText(shell)?.match(/^SESSION \d+$/gm)).toEqual(["SESSION 001", "SESSION 002", "SESSION 003"]);
  });

  test("the seventh session contradicts the game, which stays true", () => {
    const six = sessions(6);
    const over = tick(press(run(six, "worm"), key("right")), 60);
    const header = allRows(over.screen)[0];
    const length = Number(/LENGTH: (\d+)/.exec(header)?.[1]);
    const shell = press(over, escape);
    const seventh = logText(shell)?.split("SESSION 007")[1] ?? "";

    expect(length).toBe(3 + Number(/SCORE: (\d+)/.exec(header)?.[1]) / 10);
    expect(seventh).toContain(`LENGTH ${length + 1}`);
    expect(seventh).toContain("NOTE       DISPLAYED FIGURES WERE NOT ACCURATE.");
  });

  test("ordinary commands behave as before", () => {
    const shell = sessions(2);

    expect(screenText(run(shell, "ver"))).toContain("ODD/OS Version 3.14");
    expect(run(shell, "cd \\dos").disk.cwd).toBe("C:\\DOS");
    expect(screenText(run(shell, "dir \\dos"))).toContain("MEM      EXE");
    expect(shell.disk.cwd).toBe("C:\\ODDWARE");
  });
});

describe("WORM.HI through the shell", () => {
  type Way = "up" | "down" | "left" | "right";
  const OPPOSITE: Readonly<Record<Way, Way>> = { up: "down", down: "up", left: "right", right: "left" };

  const find = (screen: Screen, char: string) => {
    for (let row = 2; row <= 22; row += 1) {
      const column = rowText(screen, row).indexOf(char, 1);
      if (column >= 1) return { x: column - 1, y: row - 2 };
    }
    throw new Error(`no ${char} on the playfield`);
  };

  const scoreOf = (state: ShellState) => Number(/SCORE: (\d+)/.exec(rowText(state.screen, 0))?.[1]);

  // Steers to the food until the score reaches `target`, then runs into a wall.
  const record = (state: ShellState, target: number) => {
    let heading: Way = "right";
    let shell = press(run(state, "worm"), key(heading));

    for (let count = 0; count < 5_000 && scoreOf(shell) < target; count += 1) {
      const head = find(shell.screen, "@");
      const food = find(shell.screen, "*");
      const across: Way | undefined = food.x > head.x ? "right" : food.x < head.x ? "left" : undefined;
      const along: Way | undefined = food.y > head.y ? "down" : food.y < head.y ? "up" : undefined;
      let wanted: Way = across ?? along ?? heading;

      if (wanted === OPPOSITE[heading]) {
        const vertical: boolean = heading === "up" || heading === "down";
        wanted = vertical ? (across ?? (head.x > 0 ? "left" : "right")) : (along ?? (head.y > 0 ? "up" : "down"));
      }

      heading = wanted;
      shell = tick(press(shell, key(heading)));
    }

    const over = tick(shell, 100);
    return { score: scoreOf(over), shell: press(over, escape) };
  };

  const screenText = (state: ShellState) => allRows(state.screen).join("\n");

  test("Not there at first", () => {
    const rows = allRows(run(shellIn("C:\\"), "dir \\oddware").screen);

    expect(rows.some((text) => text.startsWith("WORM     EXE"))).toBe(true);
    expect(rows.some((text) => text.startsWith("WORM     HI"))).toBe(false);
    expect(rows.some((text) => /^ +1 file\(s\)/.test(text))).toBe(true);
  });

  test("Created by the first record and listed by DIR", () => {
    const { score, shell } = record(shellIn("C:\\ODDWARE"), 120);
    const rows = allRows(run(shell, "dir \\oddware").screen);
    const exe = rows.findIndex((text) => text.startsWith("WORM     EXE"));
    const hi = rows.findIndex((text) => text.startsWith("WORM     HI"));

    expect(score).toBeGreaterThanOrEqual(120);
    expect(hi).toBe(exe + 1);
    expect(Number(rows[hi].slice(12, 26).replace(/[ ,]/g, ""))).toBe(`${score}\r\n`.length);
    expect(rows[hi]).toMatch(/11-02-93 +3:45p$/);
  });

  test("Shown by TYPE", () => {
    const { score, shell } = record(shellIn("C:\\ODDWARE"), 30);

    expect(screenText(run(shell, "type \\oddware\\worm.hi"))).toContain(`C:\\ODDWARE>type \\oddware\\worm.hi\n${score}\n`);
  });

  test("The next launch shows the record", () => {
    const { score, shell } = record(shellIn("C:\\ODDWARE"), 30);

    expect(rowText(run(shell, "worm").screen, 0)).toContain(`HI: ${score}`);
  });

  test("Nothing else is left behind", () => {
    const before = shellIn("C:\\ODDWARE");
    const { shell } = record(before, 30);
    const others = (disk: ShellState["disk"]) => ({
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

    expect(shell.disk.cwd).toBe("C:\\ODDWARE");
    expect(others(shell.disk)).toEqual(before.disk);
  });
});
