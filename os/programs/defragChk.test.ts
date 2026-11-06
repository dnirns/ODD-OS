import { describe, expect, test } from "vitest";

import { deleteFile, writeFile } from "../fs/operations";
import { createFilesystem } from "../fs/seed";
import type { Filesystem } from "../fs/types";
import { chkName, chkPath, chkText, nextChkNumber } from "./defragChk";
import { createPicture, PICTURE_NAMES } from "./defragPictures";
import { randomStream } from "./random";

const NOW = new Date(Date.UTC(1993, 10, 2, 14, 30));

const write = (filesystem: Filesystem, path: string) => {
  const written = writeFile(filesystem, "C:\\", path, "x", NOW);
  if (!written.ok) throw new Error(written.error);
  return written.value;
};

describe("Recovered file names", () => {
  test("are numbered from FILE0000.CHK in C:\\", () => {
    expect(chkName(0)).toBe("FILE0000.CHK");
    expect(chkPath(12)).toBe("C:\\FILE0012.CHK");
  });

  test("the first is FILE0000.CHK and the next the lowest free number", () => {
    const one = write(createFilesystem(), chkPath(0));
    const two = write(one, chkPath(1));

    expect(nextChkNumber(createFilesystem())).toBe(0);
    expect(nextChkNumber(one)).toBe(1);
    expect(nextChkNumber(two)).toBe(2);
  });

  test("a deleted number is used again", () => {
    const two = write(write(createFilesystem(), chkPath(0)), chkPath(1));
    const deleted = deleteFile(two, "C:\\", chkName(0));
    if (!deleted.ok) throw new Error(deleted.error);

    expect(nextChkNumber(deleted.value)).toBe(0);
  });

  test("none is free when all are taken", () => {
    const root = createFilesystem().root;
    const full = {
      root: {
        ...root,
        entries: [
          ...root.entries,
          ...Array.from({ length: 10_000 }, (_, number) => ({ ...root.entries[5], name: chkName(number) })),
        ],
      },
    };

    expect(nextChkNumber(full)).toBeUndefined();
  });
});

describe("Recovered file text", () => {
  test.each(PICTURE_NAMES)("%s is text art no wider than 78 columns with an ODD line", (name) => {
    const picture = createPicture(name, randomStream(4), 78, 17);
    const lines = chkText(picture, 3).split("\r\n");

    expect(lines.every((line) => line.length <= 78)).toBe(true);
    expect(lines.at(-1)).toBe("");
    expect(lines.at(-3)).toBe("");
    expect(lines.at(-2)).toMatch(/^ORDINARY DATA DEVICES XRS 0003: /);
    expect(lines.slice(0, -3).join("")).toMatch(/[█▓▒░]/);
    expect(lines[0].startsWith(" ") && lines.every((line) => line === "" || line.startsWith(" "))).toBe(false);
  });

  test("the smiley is drawn in solid blocks with shaded features", () => {
    const text = chkText(createPicture("smiley", randomStream(4), 78, 17), 0);

    expect(text).toContain("█");
    expect(text).toContain("░");
  });

  test("the eye's white, iris and pupil each have their own shade", () => {
    const text = chkText(createPicture("eye", randomStream(4), 78, 17), 0);

    expect(text).toContain("█");
    expect(text).toContain("▓");
    expect(text).toContain("░");
  });
});
