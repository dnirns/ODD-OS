import { useEffect, useState } from "react";

import { isSkipKey } from "../os/boot/bootKeys";
import { startBoot } from "../os/boot/bootRunner";
import { createBootScreen, createBootSteps } from "../os/boot/bootSteps";
import type { Screen } from "../os/terminal/screen";
import Terminal from "./Terminal";

type BootScreenProps = {
  onComplete: (screen: Screen, skipped: boolean) => void;
};

const BootScreen = ({ onComplete }: BootScreenProps) => {
  const [screen, setScreen] = useState(createBootScreen);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let skipped = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSkipKey(event.key)) return;
      skipped = true;
      boot.skip();
    };
    const removeListener = () =>
      window.removeEventListener("keydown", onKeyDown);

    const boot = startBoot({
      screen: createBootScreen(),
      steps: createBootSteps({ reducedMotion }),
      onScreen: setScreen,
      onComplete: (finalScreen) => {
        removeListener();
        onComplete(finalScreen, skipped);
      },
    });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      boot.stop();
      removeListener();
    };
  }, [onComplete]);

  return <Terminal screen={screen} />;
};

export default BootScreen;
