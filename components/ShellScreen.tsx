import { useEffect, useReducer } from "react";

import { startTicker } from "../os/programs/ticker";
import type { Registry } from "../os/programs/types";
import { createClock } from "../os/shell/clock";
import {
  createShell,
  reduceShell,
  type ShellAction,
  type ShellState,
  tickInterval,
  tickShell,
} from "../os/shell/shell";
import { toShellKey } from "../os/shell/shellKeys";
import type { Screen } from "../os/terminal/screen";
import Terminal from "./Terminal";

type ShellScreenProps = {
  screen: Screen;
  programmes?: Registry;
};

type Action =
  | ({ readonly type: "key" } & ShellAction)
  | { readonly type: "tick"; readonly now: number };

const reduce = (state: ShellState, action: Action): ShellState =>
  action.type === "tick"
    ? tickShell(state, action.now)
    : reduceShell(state, action);

const startShell = ({ screen, programmes }: ShellScreenProps) =>
  createShell(screen, createClock(Date.now()), undefined, programmes);

const ShellScreen = ({ screen, programmes }: ShellScreenProps) => {
  const [state, dispatch] = useReducer(reduce, { screen, programmes }, startShell);
  const tickMs = tickInterval(state);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = toShellKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        altGraph: event.getModifierState("AltGraph"),
      });
      if (!key) return;

      if (key.type !== "escape") event.preventDefault();
      dispatch({ type: "key", key, now: Date.now() });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (tickMs === undefined) return undefined;

    return startTicker(tickMs, () => dispatch({ type: "tick", now: Date.now() }));
  }, [tickMs]);

  return <Terminal screen={state.screen} />;
};

export default ShellScreen;
