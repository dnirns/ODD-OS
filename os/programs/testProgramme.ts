import { changeDirectory, createDisk, type Disk } from "../fs/disk";
import { writeFile } from "../fs/operations";
import { clearScreen, createScreen, setCursorVisible, writeText } from "../terminal/screen";
import { PROGRAMMES } from "./registry";
import type {
  FullscreenProgramme,
  ProgrammeFiles,
  ProgrammeKey,
  Registry,
  Running,
} from "./types";

// A fullscreen programme for tests. It is never in the production registry.
//   Escape  exits, returning any file it wrote
//   d       exits having changed the working directory to C:\DOS
//   w       writes C:\NEW.TXT through the runtime and keeps running
//   x       fails
// Any other key and every tick is counted on screen.

export const TEST_PROGRAMME_PATH = "C:\\ODDWARE\\TEST.EXE";

const name = (key: ProgrammeKey) => (key.type === "char" ? key.char : key.type);

const draw = (keys: number, last: string, ticks: number) =>
  setCursorVisible(
    [
      "TEST PROGRAMME",
      `KEYS: ${keys} LAST: ${last}`,
      `TICKS: ${ticks}`,
    ].reduce(
      (screen, text, row) => writeText(screen, row, 0, text),
      clearScreen(createScreen()),
    ),
    false,
  );

type TestState = {
  readonly disk: Disk;
  readonly files: ProgrammeFiles;
  readonly tickMs: number | undefined;
  readonly keys: number;
  readonly last: string;
  readonly ticks: number;
  readonly wrote: boolean;
};

const running = (state: TestState): Running => ({
  type: "running",
  screen: draw(state.keys, state.last, state.ticks),
  tickMs: state.tickMs,
  step: (event) => {
    if (event.type === "tick") return running({ ...state, ticks: state.ticks + 1 });

    const { key } = event;
    if (key.type === "escape") return state.wrote ? { type: "exit", disk: state.disk } : { type: "exit" };
    if (key.type === "char" && key.char === "x") throw new Error("test programme failed");
    if (key.type === "char" && key.char === "d") {
      const changed = changeDirectory(state.disk, "\\DOS");
      return changed.ok ? { type: "exit", disk: changed.value } : { type: "exit" };
    }
    if (key.type === "char" && key.char === "w") {
      const written = state.files.write(state.disk, "C:\\NEW.TXT", "new", event.now);
      if (written.ok) return running({ ...state, disk: written.value, wrote: true, keys: state.keys + 1, last: "w" });
    }

    return running({ ...state, keys: state.keys + 1, last: name(key) });
  },
});

export const createTestProgramme = (tickMs?: number): FullscreenProgramme => ({
  kind: "fullscreen",
  start: (_args, { disk, files }) =>
    running({ disk, files, tickMs, keys: 0, last: "-", ticks: 0, wrote: false }),
});

// The seeded disk with a runnable `C:\ODDWARE\TEST.EXE`, and a registry for it.
export const withTestProgramme = (
  tickMs?: number,
): { readonly disk: Disk; readonly programmes: Registry } => {
  const disk = createDisk();
  const written = writeFile(
    disk.filesystem,
    "C:\\",
    TEST_PROGRAMME_PATH,
    "test",
    new Date(Date.UTC(1993, 8, 20, 17, 0)),
  );
  if (!written.ok) throw new Error(written.error);

  return {
    disk: { ...disk, filesystem: written.value },
    programmes: { ...PROGRAMMES, [TEST_PROGRAMME_PATH]: createTestProgramme(tickMs) },
  };
};
