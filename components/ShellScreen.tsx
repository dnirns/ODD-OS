import { useEffect, useReducer } from "react";

import { createClock } from "../os/shell/clock";
import { createShell, reduceShell } from "../os/shell/shell";
import { toShellKey } from "../os/shell/shellKeys";
import type { Screen } from "../os/terminal/screen";
import Terminal from "./Terminal";

type ShellScreenProps = {
  screen: Screen;
};

const startShell = (screen: Screen) =>
  createShell(screen, createClock(Date.now()));

const ShellScreen = ({ screen }: ShellScreenProps) => {
  const [state, dispatch] = useReducer(reduceShell, screen, startShell);

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
      dispatch({ key, now: Date.now() });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <Terminal screen={state.screen} />;
};

export default ShellScreen;
