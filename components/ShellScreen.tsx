import { useEffect, useReducer } from "react";

import { createShell, reduceShell } from "../os/shell/shell";
import { toShellKey } from "../os/shell/shellKeys";
import type { Screen } from "../os/terminal/screen";
import Terminal from "./Terminal";

type ShellScreenProps = {
  screen: Screen;
};

const ShellScreen = ({ screen }: ShellScreenProps) => {
  const [state, dispatch] = useReducer(reduceShell, screen, createShell);

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
      dispatch(key);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <Terminal screen={state.screen} />;
};

export default ShellScreen;
