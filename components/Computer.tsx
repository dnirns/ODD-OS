"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";

import { diskChanges } from "../os/fs/changes";
import { createFilesystem } from "../os/fs/seed";
import type { Filesystem } from "../os/fs/types";
import { readKept, saveKept } from "../os/storage/diskStore";
import { type StartingDisk, startingDisk, toRecord } from "../os/storage/record";
import type { Screen } from "../os/terminal/screen";
import BootScreen from "./BootScreen";
import styles from "./Computer.module.css";
import Keyboard from "./Keyboard";
import ShellScreen from "./ShellScreen";
import Terminal from "./Terminal";
import { useMediaQuery } from "./useMediaQuery";

// Reading the kept files gives up this long after the computer mounts.
const READ_DEADLINE_MS = 3000;

const saveFiles = (filesystem: Filesystem) =>
  saveKept(toRecord(diskChanges(createFilesystem(), filesystem)));

type Boot = { readonly screen: Screen; readonly skipped: boolean };

const renderScreen = (
  boot: Boot | undefined,
  start: StartingDisk | undefined,
  finishBoot: (screen: Screen, skipped: boolean) => void,
): ReactNode => {
  if (!boot) return <BootScreen onComplete={finishBoot} />;

  // The boot has finished but the kept files have not been read: the last
  // boot screen stays, and nothing listens for keys.
  if (!start) return <Terminal screen={boot.screen} />;

  return (
    <ShellScreen
      screen={boot.screen}
      disk={start.disk}
      startup={boot.skipped ? "instant" : "paced"}
      onFilesChange={start.saving ? saveFiles : undefined}
    />
  );
};

const Computer = () => {
  const [boot, setBoot] = useState<Boot>();
  const [start, setStart] = useState<StartingDisk>();
  const finishBoot = useCallback(
    (screen: Screen, skipped: boolean) => setBoot({ screen, skipped }),
    [],
  );

  useEffect(() => {
    let current = true;
    void readKept(READ_DEADLINE_MS).then((read) => {
      if (current) setStart(startingDisk(read));
    });
    return () => {
      current = false;
    };
  }, []);

  const touch = useMediaQuery("(pointer: coarse)");
  const landscape = useMediaQuery("(orientation: landscape)");
  // The visitor's own choice, which outlasts rotating the device.
  const [chosen, setChosen] = useState<boolean>();
  // A physical key was pressed; the next touch brings the keyboard back.
  const [physical, setPhysical] = useState(false);
  const shown = !physical && (chosen ?? !landscape);

  const toggleKeyboard = useCallback(() => {
    setPhysical(false);
    setChosen(!shown);
  }, [shown]);

  useEffect(() => {
    if (!touch) return undefined;

    // The on-screen keyboard's own keystrokes are untrusted, so only a
    // physical key hides it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isTrusted) setPhysical(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") setPhysical(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [touch]);

  return (
    <div className={styles.computer}>
      <div className={styles.stage}>{renderScreen(boot, start, finishBoot)}</div>
      {touch && <Keyboard shown={shown} onToggle={toggleKeyboard} />}
    </div>
  );
};

export default Computer;
