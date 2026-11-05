import { useEffect, useReducer } from "react";

import type { Disk } from "../os/fs/disk";
import type { Filesystem } from "../os/fs/types";
import { startTicker } from "../os/programs/ticker";
import type { Registry } from "../os/programs/types";
import { createClock } from "../os/shell/clock";
import {
  acceptsBreak,
  acceptsEndOfFile,
  batchDelay,
  createShell,
  reduceShell,
  type ShellAction,
  type ShellState,
  tickInterval,
  startup,
  tickShell,
} from "../os/shell/shell";
import { STARTING_ENVIRONMENT } from "../os/shell/environmentCommands";
import { toShellKey } from "../os/shell/shellKeys";
import type { Screen } from "../os/terminal/screen";
import Terminal from "./Terminal";

type ShellScreenProps = {
  screen: Screen;
  disk: Disk;
  onFilesChange?: (filesystem: Filesystem) => void;
  programmes?: Registry;
  // Runs `AUTOEXEC.BAT` as the computer starts, at the boot's pace or at once.
  startup?: "paced" | "instant";
};

type Action =
  | ({ readonly type: "key" } & ShellAction)
  | { readonly type: "tick"; readonly now: number };

const reduce = (state: ShellState, action: Action): ShellState =>
  action.type === "tick"
    ? tickShell(state, action.now)
    : reduceShell(state, action);

type StartProps = Pick<ShellScreenProps, "screen" | "disk" | "programmes" | "startup">;

const startShell = ({ screen, disk, programmes, startup: mode }: StartProps) => {
  const now = Date.now();
  if (mode === undefined) return createShell(screen, createClock(now), disk, programmes);

  const shell = createShell(screen, createClock(now), disk, programmes, STARTING_ENVIRONMENT);
  return startup(shell, now, mode === "instant");
};

const ShellScreen = ({ screen, disk, onFilesChange, programmes, startup: mode }: ShellScreenProps) => {
  const [state, dispatch] = useReducer(
    reduce,
    { screen, disk, programmes, startup: mode },
    startShell,
  );
  const tickMs = tickInterval(state);
  const endOfFile = acceptsEndOfFile(state);
  const breaks = acceptsBreak(state);
  const delay = batchDelay(state);
  const { filesystem } = state.disk;

  // Keeps browser storage in step with the files. Changing directory, the
  // clock or the history leaves `filesystem` as it is, so it saves nothing.
  useEffect(() => {
    if (onFilesChange && filesystem !== disk.filesystem) onFilesChange(filesystem);
  }, [filesystem, disk.filesystem, onFilesChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = toShellKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        altGraph: event.getModifierState("AltGraph"),
      }, endOfFile, breaks);
      if (!key) return;

      if (key.type !== "escape") event.preventDefault();
      dispatch({ type: "key", key, now: Date.now() });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [endOfFile, breaks]);

  // A batch file runs one line at a time, so the page stays responsive.
  useEffect(() => {
    if (delay === undefined) return undefined;

    const timer = setTimeout(() => dispatch({ type: "tick", now: Date.now() }), delay);
    return () => clearTimeout(timer);
  }, [state, delay]);

  useEffect(() => {
    if (tickMs === undefined) return undefined;

    return startTicker(tickMs, () => dispatch({ type: "tick", now: Date.now() }));
  }, [tickMs]);

  return <Terminal screen={state.screen} />;
};

export default ShellScreen;
