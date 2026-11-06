// What DEFRAG.EXE is doing: the phases of a session and how keys and ticks
// move between them. Pure apart from the disk writes it makes through
// ProgrammeFiles.

import type { Disk } from "../fs/disk";
import { clusterCount } from "../fs/freeSpace";
import type { ProgrammeFiles, ProgrammeKey } from "./types";
import { chkPath, chkText, nextChkNumber } from "./defragChk";
import {
  type AnalysedMap,
  analyseDrive,
  applyMove,
  assemblyMoves,
  type Block,
  gatherMoves,
  MAP_BLOCKS,
  MAP_COLUMNS,
  MAP_ROWS,
  type Move,
  notFragmented,
  UNMOVABLE,
  UNUSED,
  USED,
} from "./defragMap";
import { createPicture, type Picture, pictureFor } from "./defragPictures";
import { nextRandom, randomStream } from "./random";

export const TICK_MS = 40;
export const ANALYSIS_TICKS = 38;
export const GATHER_INTERVAL = 5;
export const GATHER_BATCHES = 40;
export const OVERRUN_TICKS = 60;
export const ASSEMBLY_INTERVAL = 2;
export const ASSEMBLY_RAMP = 10;
export const ASSEMBLY_MOST = 6;
export const FRAME_TICKS = 4;

export type Method = "full" | "unfragment";

export const METHOD_NAMES: Readonly<Record<Method, string>> = {
  full: "Full Optimization",
  unfragment: "Unfragment Files Only",
};

export const MENU_ITEMS = [
  "Begin Optimization",
  "Drive...",
  "Optimization Method...",
  "About Defrag...",
  "Exit",
] as const;

export const MENU_HINTS: readonly string[] = [
  "Begin optimization of the selected drive",
  "Select a new drive",
  "Select an optimization method",
  "Show information about Defrag",
  "Exit Defrag",
];

export const RECOMMEND_BUTTONS = ["Optimize", "Configure"] as const;
export const END_BUTTONS = ["Another Drive", "Configure", "Exit DEFRAG"] as const;
export const METHODS: readonly Method[] = ["full", "unfragment"];

// Where Tab has put the focus in a dialog with a list: the list, OK or Cancel.
export type DialogFocus = "list" | "ok" | "cancel";

export const DIALOG_FOCUS: readonly DialogFocus[] = ["list", "ok", "cancel"];

export type Overlay =
  | { readonly kind: "none" }
  | { readonly kind: "menu"; readonly item: number }
  | { readonly kind: "method"; readonly choice: number; readonly focus: DialogFocus }
  | { readonly kind: "drive"; readonly focus: DialogFocus }
  | { readonly kind: "about" };

type Stage = "gathering" | "overrun" | "assembling";

export type Phase =
  // Started with no drive: the drive list, before the drive is read.
  | { readonly kind: "choosing"; readonly focus: DialogFocus }
  // `then` is the method to start once the drive has been read.
  | { readonly kind: "analysing"; readonly tick: number; readonly then?: Method }
  | { readonly kind: "recommend"; readonly button: number; readonly method: Method }
  | { readonly kind: "main"; readonly overlay: Overlay }
  | {
      readonly kind: "optimizing";
      readonly stage: Stage;
      readonly moves: readonly Move[];
      readonly done: number;
      readonly pending: readonly Move[];
      readonly batches: number;
      readonly tick: number;
    }
  | { readonly kind: "holding"; readonly tick: number }
  | { readonly kind: "finished" }
  | { readonly kind: "ended"; readonly button: number }
  | { readonly kind: "exit" };

export type DefragState = {
  readonly disk: Disk;
  readonly launchDisk: Disk;
  readonly files: ProgrammeFiles;
  readonly capacityMb: number;
  readonly moveHidden: boolean;
  readonly method: Method;
  // Started with /F or /U: optimize at once and leave when done.
  readonly autoStart: boolean;
  readonly seed: number;
  readonly map: AnalysedMap;
  readonly picture: Picture;
  readonly number: number | undefined;
  readonly blocks: readonly Block[];
  readonly reading: readonly number[];
  readonly writing: readonly number[];
  readonly cluster: number;
  readonly percent: number;
  readonly elapsedTicks: number;
  readonly phase: Phase;
};

export type DefragEvent =
  | { readonly type: "key"; readonly key: ProgrammeKey; readonly now: number }
  | { readonly type: "tick"; readonly now: number };

export type StartOptions = {
  readonly disk: Disk;
  readonly files: ProgrammeFiles;
  readonly capacityMb: number;
  readonly moveHidden: boolean;
  readonly method: Method | undefined;
  // Started with no drive, so the drive list comes first.
  readonly chooseDrive: boolean;
  readonly seed: number;
};

// A fresh look at the drive: the next picture and lost clusters to suit it.
const analysed = (state: Omit<DefragState, "map" | "picture" | "number">) => {
  const number = nextChkNumber(state.disk.filesystem);
  const random = randomStream(state.seed);
  const picture = createPicture(pictureFor(number ?? 0), random, MAP_COLUMNS, MAP_ROWS);
  const silhouette = picture.frame(0).flatMap((color, index) => (color === undefined ? [] : [index]));
  const map = analyseDrive({
    filesystem: state.disk.filesystem,
    capacityMb: state.capacityMb,
    moveHidden: state.moveHidden,
    picture: silhouette,
    random,
  });

  return {
    ...state,
    seed: nextRandom(state.seed).seed,
    map,
    picture,
    number,
    blocks: map.blocks,
    reading: [],
    writing: [],
    cluster: 0,
    percent: 0,
    elapsedTicks: 0,
    phase: { kind: "analysing", tick: 0 } as const,
  };
};

export const startDefrag = ({ disk, files, capacityMb, moveHidden, method, chooseDrive, seed }: StartOptions): DefragState => {
  const state = analysed({
    disk,
    launchDisk: disk,
    files,
    capacityMb,
    moveHidden,
    method: method ?? "full",
    autoStart: method !== undefined,
    seed,
    blocks: [],
    reading: [],
    writing: [],
    cluster: 0,
    percent: 0,
    elapsedTicks: 0,
    phase: { kind: "analysing", tick: 0 },
  });
  return chooseDrive ? { ...state, phase: { kind: "choosing", focus: "list" } } : state;
};

const reanalyse = (state: DefragState, then?: Method): DefragState => {
  const fresh = analysed(state);
  return then === undefined ? fresh : { ...fresh, phase: { kind: "analysing", tick: 0, then } };
};

export const recommendedMethod = ({ map }: DefragState): Method =>
  map.targets.length > 0 || gatherMoves(map).length > 0 ? "full" : "unfragment";

export const notFragmentedPercent = (state: DefragState) => notFragmented(state.map);

const withPhase = (state: DefragState, phase: Phase): DefragState => ({ ...state, phase });

const main = (state: DefragState, overlay: Overlay = { kind: "none" }) => withPhase(state, { kind: "main", overlay });

const exit = (state: DefragState) => withPhase(state, { kind: "exit" });

const startOptimizing = (state: DefragState, method: Method): DefragState => ({
  ...state,
  method,
  blocks: state.map.blocks,
  reading: [],
  writing: [],
  cluster: 0,
  percent: 0,
  elapsedTicks: 0,
  phase: {
    kind: "optimizing",
    stage: "gathering",
    moves: gatherMoves(state.map),
    done: 0,
    pending: [],
    batches: 0,
    tick: 0,
  },
});

// The blocks once a run is over: the files in one run after the fixed
// blocks, with the recovered file's block when one was written.
const condensed = (state: DefragState, extra: number): Block[] =>
  Array.from({ length: MAP_BLOCKS }, (_, index) =>
    index < state.map.fixed ? UNMOVABLE : index < state.map.fixed + state.map.movable + extra ? USED : UNUSED,
  );

const finish = (state: DefragState): DefragState => withPhase({ ...state, reading: [], writing: [] }, { kind: "finished" });

// Writing the recovered file, if a number is free and the disk has room.
const recover = (state: DefragState, now: number): DefragState => {
  if (state.number === undefined) return { ...state, blocks: condensed(state, 0) };

  const text = chkText(state.picture, state.number);
  const { total, used, bytesPerCluster } = clusterCount(state.disk.filesystem, state.capacityMb);
  const needed = Math.ceil(new TextEncoder().encode(text).length / bytesPerCluster);
  const written = used + needed <= total ? state.files.write(state.disk, chkPath(state.number), text, now) : undefined;

  return written?.ok
    ? { ...state, disk: written.value, blocks: condensed(state, 1) }
    : { ...state, blocks: condensed(state, 0) };
};

const pictureBlock = (state: DefragState, index: number, frame: number): Block => {
  const color = state.picture.frame(frame)[index];
  return color === undefined ? state.blocks[index] : { kind: "picture", color };
};

const animated = (state: DefragState, frame: number): readonly Block[] => {
  const colors = state.picture.frame(frame);
  return state.blocks.map((block, index) => {
    const color = colors[index];
    return block.kind === "picture" && color !== undefined ? { kind: "picture", color } : block;
  });
};

const batchSize = (stage: Stage, moves: number, batches: number) =>
  stage === "gathering"
    ? Math.max(Math.ceil(moves / GATHER_BATCHES), 1)
    : Math.min(1 + Math.floor(batches / ASSEMBLY_RAMP), ASSEMBLY_MOST);

const interval = (stage: Stage) => (stage === "gathering" ? GATHER_INTERVAL : ASSEMBLY_INTERVAL);

// One tick of optimization: every interval, the reads begun last time are
// written and the next reads begin.
const optimizeTick = (state: DefragState, phase: Extract<Phase, { kind: "optimizing" }>): DefragState => {
  const tick = phase.tick + 1;
  const elapsedTicks = state.elapsedTicks + 1;
  const { map } = state;

  if (phase.stage === "overrun") {
    const lost = state.blocks.flatMap((block, index) => (block.kind === "lost" ? [index] : []));
    const twitch = lost.length > 0 && tick % 6 === 0 ? [lost[(tick * 7919) % lost.length]] : [];
    if (tick < OVERRUN_TICKS) {
      return {
        ...state,
        elapsedTicks,
        reading: twitch,
        writing: [],
        cluster: map.totalClusters + tick * map.clustersPerBlock * 3,
        percent: 100,
        phase: { ...phase, tick },
      };
    }
    return {
      ...state,
      elapsedTicks,
      reading: [],
      phase: { kind: "optimizing", stage: "assembling", moves: assemblyMoves(map), done: 0, pending: [], batches: 0, tick: 0 },
    };
  }

  if (tick % interval(phase.stage) !== 0) return { ...state, elapsedTicks, phase: { ...phase, tick } };

  const blocks = phase.pending.reduce(
    (current, move) =>
      applyMove(current, move, phase.stage === "assembling" ? pictureBlock(state, move.to, 0) : current[move.from]),
    state.blocks,
  );
  const written = phase.pending.map(({ to }) => to);
  const done = phase.done + phase.pending.length;
  const next = phase.moves.slice(done, done + batchSize(phase.stage, phase.moves.length, phase.batches));
  const last = written.at(-1) ?? next.at(0)?.to;
  const progress = phase.moves.length === 0 ? 1 : done / phase.moves.length;
  const shown = {
    ...state,
    blocks,
    elapsedTicks,
    reading: next.map(({ from }) => from),
    writing: written,
    // With no block in flight the last cluster stays shown.
    cluster:
      last === undefined
        ? state.cluster
        : (phase.stage === "assembling" ? map.totalClusters : 0) + last * map.clustersPerBlock,
    percent: phase.stage === "assembling" ? 100 + Math.floor(progress * 100) : Math.floor(progress * 100),
  };

  if (next.length > 0 || phase.pending.length > 0) {
    return { ...shown, phase: { ...phase, done, pending: next, batches: phase.batches + 1, tick } };
  }

  if (phase.stage === "gathering" && state.method === "full" && map.targets.length > 0) {
    return { ...shown, writing: [], phase: { ...phase, stage: "overrun", moves: [], done: 0, pending: [], batches: 0, tick: 0 } };
  }
  if (phase.stage === "assembling") {
    return { ...shown, reading: [], writing: [], percent: 100, phase: { kind: "holding", tick: 0 } };
  }
  return finish({ ...shown, percent: 100 });
};

const tick = (state: DefragState): DefragState => {
  const { phase } = state;

  switch (phase.kind) {
    case "analysing":
      if (phase.tick + 1 < ANALYSIS_TICKS) return withPhase(state, { ...phase, tick: phase.tick + 1 });
      if (phase.then !== undefined) return startOptimizing(state, phase.then);
      return state.autoStart
        ? startOptimizing(state, state.method)
        : withPhase(state, { kind: "recommend", button: 0, method: recommendedMethod(state) });
    case "optimizing":
      return optimizeTick(state, phase);
    case "holding": {
      const next = phase.tick + 1;
      const blocks = next % FRAME_TICKS === 0 ? animated(state, next / FRAME_TICKS) : state.blocks;
      return { ...state, blocks, phase: { kind: "holding", tick: next } };
    }
    default:
      return state;
  }
};

const cycle = (index: number, count: number, step: number) => (index + step + count) % count;

const buttonStep = (key: ProgrammeKey) =>
  key.type === "right" || key.type === "tab" ? 1 : key.type === "left" ? -1 : 0;

const listStep = (key: ProgrammeKey) => (key.type === "down" ? 1 : key.type === "up" ? -1 : 0);

const afterRun = (state: DefragState) => (state.autoStart ? exit(state) : withPhase(state, { kind: "ended", button: 0 }));

const chooseMenu = (state: DefragState, item: number): DefragState => {
  switch (MENU_ITEMS[item]) {
    case "Begin Optimization":
      return reanalyse(state, state.method);
    case "Drive...":
      return main(state, { kind: "drive", focus: "list" });
    case "Optimization Method...":
      return main(state, { kind: "method", choice: METHODS.indexOf(state.method), focus: "list" });
    case "About Defrag...":
      return main(state, { kind: "about" });
    default:
      return exit(state);
  }
};

// Tab moves from the list to OK to Cancel and round again, as the MS-DOS 6
// guide has Tab move between DEFRAG's buttons. The arrow keys stay in the
// list, and move between the buttons only once one has the focus.
const nextFocus = (focus: DialogFocus, key: ProgrammeKey): DialogFocus => {
  if (key.type === "tab") return DIALOG_FOCUS[cycle(DIALOG_FOCUS.indexOf(focus), DIALOG_FOCUS.length, 1)];
  if (focus === "list") return focus;
  if (key.type === "right") return "cancel";
  if (key.type === "left") return "ok";
  return focus;
};

// The drive dialog: Enter on the list or OK reads the drive, Cancel and
// Escape go back.
const driveKey = (
  focus: DialogFocus,
  key: ProgrammeKey,
  { read, back, move }: { read: () => DefragState; back: () => DefragState; move: (focus: DialogFocus) => DefragState },
  state: DefragState,
): DefragState => {
  if (key.type === "escape" || (key.type === "enter" && focus === "cancel")) return back();
  if (key.type === "enter") return read();
  const next = nextFocus(focus, key);
  return next === focus ? state : move(next);
};

const mainKey = (state: DefragState, overlay: Overlay, key: ProgrammeKey): DefragState => {
  switch (overlay.kind) {
    case "none":
      if (key.type === "escape") return exit(state);
      return key.type === "f10" ? main(state, { kind: "menu", item: 0 }) : state;
    case "menu":
      if (key.type === "escape" || key.type === "f10") return main(state);
      if (key.type === "enter") return chooseMenu(state, overlay.item);
      return listStep(key) === 0
        ? state
        : main(state, { kind: "menu", item: cycle(overlay.item, MENU_ITEMS.length, listStep(key)) });
    case "method": {
      if (key.type === "escape" || (key.type === "enter" && overlay.focus === "cancel")) return main(state);
      if (key.type === "enter") return main({ ...state, method: METHODS[overlay.choice] });
      const focus = nextFocus(overlay.focus, key);
      const step = overlay.focus === "list" ? listStep(key) : 0;
      return focus === overlay.focus && step === 0
        ? state
        : main(state, { kind: "method", choice: cycle(overlay.choice, METHODS.length, step), focus });
    }
    case "drive":
      return driveKey(
        overlay.focus,
        key,
        { read: () => reanalyse(state), back: () => main(state), move: (focus) => main(state, { kind: "drive", focus }) },
        state,
      );
    case "about":
      return key.type === "escape" || key.type === "enter" ? main(state) : state;
  }
};

const key = (state: DefragState, pressed: ProgrammeKey, now: number): DefragState => {
  const { phase } = state;

  switch (phase.kind) {
    case "choosing":
      return driveKey(
        phase.focus,
        pressed,
        {
          read: () => withPhase(state, { kind: "analysing", tick: 0 }),
          back: () => exit(state),
          move: (focus) => withPhase(state, { kind: "choosing", focus }),
        },
        state,
      );
    case "analysing":
      return pressed.type === "escape" ? exit(state) : state;
    case "recommend": {
      if (pressed.type === "escape") return main(state);
      if (pressed.type === "enter") {
        return phase.button === 0 ? startOptimizing(state, phase.method) : main(state, { kind: "menu", item: 0 });
      }
      const step = buttonStep(pressed);
      return step === 0 ? state : withPhase(state, { ...phase, button: cycle(phase.button, RECOMMEND_BUTTONS.length, step) });
    }
    case "main":
      return mainKey(state, phase.overlay, pressed);
    case "optimizing":
      return pressed.type === "escape" ? afterRun({ ...state, reading: [], writing: [] }) : state;
    case "holding":
      return finish(recover(state, now));
    case "finished":
      return pressed.type === "enter" || pressed.type === "escape" ? afterRun(state) : state;
    case "ended": {
      if (pressed.type === "escape") return exit(state);
      if (pressed.type === "enter") {
        if (phase.button === 0) return main(state, { kind: "drive", focus: "list" });
        if (phase.button === 1) return main(state, { kind: "menu", item: 0 });
        return exit(state);
      }
      const step = buttonStep(pressed);
      return step === 0 ? state : withPhase(state, { kind: "ended", button: cycle(phase.button, END_BUTTONS.length, step) });
    }
    case "exit":
      return state;
  }
};

export const advanceDefrag = (state: DefragState, event: DefragEvent): DefragState =>
  event.type === "tick" ? tick(state) : key(state, event.key, event.now);

export const wantsTicks = ({ phase }: DefragState) =>
  phase.kind === "analysing" || phase.kind === "optimizing" || phase.kind === "holding";

// The frame of the held picture.
export const heldFrame = ({ phase }: DefragState) => (phase.kind === "holding" ? Math.floor(phase.tick / FRAME_TICKS) : 0);
