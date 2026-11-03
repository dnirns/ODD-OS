import type { KeptRecord, StoreRead } from "./record";

// The only code that touches browser storage. Call it from client effects
// and event handlers, never during rendering.

const DATABASE = "odd-os";
const VERSION = 1;
const STORE = "disk";
const KEY = "C";

const UNAVAILABLE: StoreRead = { kind: "unavailable" };
const TIMED_OUT: StoreRead = { kind: "timeout" };

// Settles with `fallback` if `promise` has not settled within `ms`.
export const withDeadline = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const handle = setTimeout(() => resolve(fallback), ms);
    void promise.then((value) => {
      clearTimeout(handle);
      resolve(value);
    });
  });

const openDatabase = () =>
  new Promise<IDBDatabase | undefined>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(undefined);
      return;
    }
    try {
      const request = indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });

let opened: Promise<IDBDatabase | undefined> | undefined;

const database = () => {
  opened ??= openDatabase();
  return opened;
};

const readValue = async (): Promise<StoreRead> => {
  const db = await database();
  if (!db) return UNAVAILABLE;

  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve({ kind: "read", value: request.result });
      request.onerror = () => resolve(UNAVAILABLE);
    } catch {
      resolve(UNAVAILABLE);
    }
  });
};

export const readKept = (timeoutMs: number): Promise<StoreRead> =>
  withDeadline(readValue(), timeoutMs, TIMED_OUT);

// Saves are issued in order, and IndexedDB applies readwrite transactions on
// one store in the order they were created, so the latest record lands last.
// Every failure is ignored: the files simply last until the page is reloaded.
export const saveKept = (record: KeptRecord): void => {
  void database().then((db) => {
    if (!db) return;
    try {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.onerror = (event) => event.preventDefault();
      transaction.objectStore(STORE).put(record, KEY);
    } catch {
      // Storage refused the write; the visitor's files stay in memory only.
    }
  });
};
