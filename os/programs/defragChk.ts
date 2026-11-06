// The files DEFRAG.EXE writes for the lost clusters it assembles, named as
// CHKDSK named recovered clusters. Fictional ODD/OS behaviour.

import { findChild } from "../fs/entries";
import type { Filesystem } from "../fs/types";
import type { Color, Picture, PictureName } from "./defragPictures";

export const LAST_NUMBER = 9999;

export const chkName = (number: number) => `FILE${String(number).padStart(4, "0")}.CHK`;

export const chkPath = (number: number) => `C:\\${chkName(number)}`;

// The lowest number with no file in C:\, or undefined when all are taken.
export const nextChkNumber = (filesystem: Filesystem): number | undefined => {
  for (let number = 0; number <= LAST_NUMBER; number += 1) {
    if (findChild(filesystem.root, chkName(number)) === undefined) return number;
  }
  return undefined;
};

const BRIGHT = new Set<Color>(["white", "yellow", "light-green", "light-magenta", "light-red", "light-blue"]);
// Light cyan is the eye's iris, which must stand apart from its white.
const MIDDLE = new Set<Color>(["light-grey", "light-cyan", "cyan", "green", "magenta", "red"]);

const shade = (color: Color | undefined) => {
  if (color === undefined) return " ";
  if (BRIGHT.has(color)) return "\u2588";
  if (MIDDLE.has(color)) return "\u2593";
  if (color === "black") return "\u2591";
  return "\u2592";
};

const NOTES: Readonly<Record<PictureName, string>> = {
  smiley: "EVERYBODY IS ALREADY HERE.",
  alien: "CONTACT WAS MADE IN 1993. NOBODY WAS TOLD.",
  yinYang: "BOTH SIDES ARE STORED ON THIS DISK.",
  lavaLamp: "WARM UP FOR TEN MINUTES BEFORE USE.",
  peace: "THE OFFICE IS EMPTY. THE LIGHTS ARE ON.",
  eye: "IT HAS BEEN READING THE DIRECTORY.",
};

// The picture's first frame as shaded text art, then a blank line and one
// line of Ordinary Data Devices text, with CRLF line ends.
export const chkText = (picture: Picture, number: number): string => {
  const frame = picture.frame(0);
  const rows = Array.from({ length: picture.rows }, (_, row) =>
    frame.slice(row * picture.columns, (row + 1) * picture.columns).map(shade).join("").trimEnd(),
  );
  const drawn = rows.filter((row) => row !== "");
  const indent = Math.min(...drawn.map((row) => row.length - row.trimStart().length));
  const first = rows.findIndex((row) => row !== "");
  const last = rows.findLastIndex((row) => row !== "");
  const art = rows.slice(first, last + 1).map((row) => row.slice(indent));
  const note = `ORDINARY DATA DEVICES XRS ${String(number).padStart(4, "0")}: ${NOTES[picture.name]}`;

  return [...art, "", note, ""].join("\r\n");
};
