import type {
  Attributes,
  DirectoryEntry,
  Entry,
  FileEntry,
} from "./types";

export const NO_ATTRIBUTES: Attributes = {
  readOnly: false,
  hidden: false,
  system: false,
  archive: false,
};

export const ARCHIVE: Attributes = { ...NO_ATTRIBUTES, archive: true };

export const textFile = (
  name: string,
  modified: Date,
  text: string,
  attributes: Attributes = ARCHIVE,
): FileEntry => ({
  kind: "file",
  name,
  modified,
  attributes,
  content: { kind: "text", text },
});

export const opaqueFile = (
  name: string,
  modified: Date,
  size: number,
  attributes: Attributes = ARCHIVE,
): FileEntry => ({
  kind: "file",
  name,
  modified,
  attributes,
  content: { kind: "opaque", size },
});

export const directory = (
  name: string,
  modified: Date,
  entries: readonly Entry[] = [],
  attributes: Attributes = NO_ATTRIBUTES,
): DirectoryEntry => ({ kind: "directory", name, modified, attributes, entries });

export const fileSize = ({ content }: FileEntry) =>
  content.kind === "text" ? content.text.length : content.size;

export const findChild = (parent: DirectoryEntry, name: string) =>
  parent.entries.find((entry) => entry.name === name);
