// DEFRAG.EXE's block map of drive C. The filesystem has no cluster layout,
// so the layout is generated from the files' sizes and a seed, for display
// only. The lost clusters are fictional: they belong to no file and use no
// space.

import { fileSize } from "../fs/entries";
import { clusterCount } from "../fs/freeSpace";
import type { DirectoryEntry, Filesystem } from "../fs/types";
import type { Color } from "./defragPictures";

export const MAP_COLUMNS = 78;
export const MAP_ROWS = 17;
export const MAP_BLOCKS = MAP_COLUMNS * MAP_ROWS;

export type Block =
  | { readonly kind: "unused" }
  | { readonly kind: "used" }
  | { readonly kind: "unmovable" }
  | { readonly kind: "lost" }
  | { readonly kind: "picture"; readonly color: Color };

export const UNUSED: Block = { kind: "unused" };
export const USED: Block = { kind: "used" };
export const UNMOVABLE: Block = { kind: "unmovable" };
export const LOST: Block = { kind: "lost" };

export type DriveMap = {
  readonly blocks: readonly Block[];
  readonly clustersPerBlock: number;
  readonly totalClusters: number;
  // Blocks of files that never move, at the start of the map.
  readonly fixed: number;
  // Blocks of files and directories that move, gathered after `fixed`.
  readonly movable: number;
};

const blocksFor = (clusters: number, clustersPerBlock: number) =>
  clusters === 0 ? 0 : Math.ceil(clusters / clustersPerBlock);

// The blocks of every file and directory below the root, split by whether
// DEFRAG may move them: system files never, hidden files only with /H.
const countBlocks = (
  directory: DirectoryEntry,
  bytesPerCluster: number,
  clustersPerBlock: number,
  moveHidden: boolean,
): { readonly fixed: number; readonly movable: number } =>
  directory.entries.reduce(
    (sum, entry) => {
      if (entry.kind === "file") {
        const blocks = blocksFor(Math.ceil(fileSize(entry) / bytesPerCluster), clustersPerBlock);
        const fixed = entry.attributes.system || (entry.attributes.hidden && !moveHidden);
        return fixed ? { ...sum, fixed: sum.fixed + blocks } : { ...sum, movable: sum.movable + blocks };
      }

      const own = blocksFor(Math.max(Math.ceil(((entry.entries.length + 2) * 32) / bytesPerCluster), 1), clustersPerBlock);
      const inside = countBlocks(entry, bytesPerCluster, clustersPerBlock, moveHidden);
      return { fixed: sum.fixed + inside.fixed, movable: sum.movable + own + inside.movable };
    },
    { fixed: 0, movable: 0 },
  );

const shuffled = <T,>(items: readonly T[], random: () => number): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

// Positions for `count` blocks from `start`, in two to four runs separated by
// gaps of one to four blocks, as files written and deleted over time leave them.
const scatteredRuns = (start: number, count: number, random: () => number): readonly number[] => {
  const runs = Math.min(count, 2 + Math.floor(random() * 3));
  const lengths = Array.from({ length: runs }, (_, run) => Math.floor(count / runs) + (run < count % runs ? 1 : 0));
  const positions: number[] = [];
  let next = start + 1 + Math.floor(random() * 3);

  for (const length of lengths) {
    for (let block = 0; block < length; block += 1) positions.push(next + block);
    next += length + 1 + Math.floor(random() * 4);
  }

  const last = positions.at(-1) ?? start;
  return last < MAP_BLOCKS ? positions : Array.from({ length: count }, (_, block) => start + block);
};

export type MapOptions = {
  readonly filesystem: Filesystem;
  readonly capacityMb: number;
  readonly moveHidden: boolean;
  // The cells a full optimization will fill with lost clusters.
  readonly picture: readonly number[];
  readonly random: () => number;
};

export type AnalysedMap = DriveMap & {
  // The picture cells the lost clusters will fill, in the order they are filled.
  readonly targets: readonly number[];
};

export const analyseDrive = ({ filesystem, capacityMb, moveHidden, picture, random }: MapOptions): AnalysedMap => {
  const { total, bytesPerCluster } = clusterCount(filesystem, capacityMb);
  const clustersPerBlock = Math.max(Math.ceil(total / MAP_BLOCKS), 1);
  const counted = countBlocks(filesystem.root, bytesPerCluster, clustersPerBlock, moveHidden);
  const fixed = Math.min(counted.fixed, MAP_BLOCKS);
  const movable = Math.min(counted.movable, MAP_BLOCKS - fixed);

  const blocks: Block[] = Array.from({ length: MAP_BLOCKS }, (_, index) => (index < fixed ? UNMOVABLE : UNUSED));
  const files = scatteredRuns(fixed, movable, random);
  for (const position of files) blocks[position] = USED;

  // The files end up in [fixed, fixed + movable), so only picture cells
  // beyond that can be filled. Lost clusters start away from the files,
  // scattered over picture and other cells alike so that the picture's
  // shape does not show before it forms.
  const gathered = fixed + movable;
  const targetCells = picture.filter((cell) => cell >= gathered);
  const filesEnd = Math.max(gathered, (files.at(-1) ?? 0) + 1);
  const sources = shuffled(
    blocks.flatMap((block, index) => (block.kind === "unused" && index >= filesEnd + 2 ? [index] : [])),
    random,
  );
  const lost = Math.min(targetCells.length, sources.length);
  for (const position of sources.slice(0, lost)) blocks[position] = LOST;

  return {
    blocks,
    clustersPerBlock,
    totalClusters: total,
    fixed,
    movable,
    targets: targetCells.slice(0, lost),
  };
};

export type Move = { readonly from: number; readonly to: number };

// Gathering: each gap in the run after the fixed blocks is filled with the
// file block furthest along the map.
export const gatherMoves = ({ blocks, fixed, movable }: DriveMap): readonly Move[] => {
  const used = blocks.flatMap((block, index) => (block.kind === "used" ? [index] : []));
  const end = fixed + movable;
  const outside = used.filter((index) => index >= end).reverse();
  const gaps = Array.from({ length: movable }, (_, block) => fixed + block).filter(
    (index) => blocks[index].kind !== "used",
  );

  return gaps.map((to, index) => ({ from: outside[index], to }));
};

// Assembly: the picture cells in order, each written with a lost cluster.
// One already on its cell is rewritten in place; the others come from the
// top of the map, and none is ever written over before it has moved.
export const assemblyMoves = (map: AnalysedMap): readonly Move[] => {
  const lost = new Set(map.blocks.flatMap((block, index) => (block.kind === "lost" ? [index] : [])));
  const targets = new Set(map.targets);
  const elsewhere = [...lost].filter((index) => !targets.has(index));
  let next = 0;

  return map.targets.map((to) => {
    if (lost.has(to)) return { from: to, to };
    const from = elsewhere[next];
    next += 1;
    return { from, to };
  });
};

export const applyMove = (blocks: readonly Block[], { from, to }: Move, block: Block = blocks[from]): Block[] =>
  blocks.map((current, index) => (index === to ? block : index === from ? UNUSED : current));

// Percent of the drive's file and lost blocks that are where they belong.
export const notFragmented = ({ blocks, fixed, movable }: DriveMap): number => {
  const inPlace = blocks.filter((block, index) => block.kind === "used" && index < fixed + movable).length;
  const lost = blocks.filter((block) => block.kind === "lost").length;
  const all = movable + lost;
  return all === 0 ? 100 : Math.min(Math.floor((100 * inPlace) / all), 99);
};
