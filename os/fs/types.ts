export type FsError =
  | "InvalidDrive"
  | "InvalidName"
  | "PathNotFound"
  | "FileNotFound"
  | "NotADirectory"
  | "IsADirectory"
  | "AccessDenied";

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FsError };

export type Attributes = {
  readonly readOnly: boolean;
  readonly hidden: boolean;
  readonly system: boolean;
  readonly archive: boolean;
};

export type FileContent =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "opaque"; readonly size: number };

export type FileEntry = {
  readonly kind: "file";
  readonly name: string;
  readonly modified: Date;
  readonly attributes: Attributes;
  readonly content: FileContent;
};

export type DirectoryEntry = {
  readonly kind: "directory";
  readonly name: string;
  readonly modified: Date;
  readonly attributes: Attributes;
  readonly entries: readonly Entry[];
};

export type Entry = FileEntry | DirectoryEntry;

export type Filesystem = {
  readonly root: DirectoryEntry;
};

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = (error: FsError): Result<never> => ({ ok: false, error });
