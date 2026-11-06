import { describe, expect, test } from "vitest";

import { writeFile } from "../fs/operations";
import { createFilesystem } from "../fs/seed";
import { MACHINE } from "../machine";
import {
  analyseDrive,
  applyMove,
  assemblyMoves,
  gatherMoves,
  MAP_BLOCKS,
  MAP_COLUMNS,
  notFragmented,
  type AnalysedMap,
} from "./defragMap";
import { createPicture, silhouette } from "./defragPictures";
import { randomStream } from "./random";

const NOW = new Date(Date.UTC(1993, 10, 2, 14, 30));
const seeded = createFilesystem();
const smiley = silhouette(createPicture("smiley", randomStream(3), MAP_COLUMNS, 17));

const analyse = (filesystem = seeded, seed = 7, moveHidden = false) =>
  analyseDrive({ filesystem, capacityMb: MACHINE.fixedDiskMb, moveHidden, picture: smiley, random: randomStream(seed) });

const kinds = (map: AnalysedMap, kind: string) =>
  map.blocks.flatMap((block, index) => (block.kind === kind ? [index] : []));

describe("The block map", () => {
  test("covers the drive with whole blocks of clusters", () => {
    const map = analyse();

    expect(map.blocks).toHaveLength(MAP_BLOCKS);
    expect(map.totalClusters).toBe(43_496);
    expect(map.clustersPerBlock).toBe(Math.ceil(43_496 / MAP_BLOCKS));
  });

  test("IO.SYS and MSDOS.SYS are unmovable, at the start", () => {
    const map = analyse();

    expect(map.fixed).toBe(2);
    expect(kinds(map, "unmovable")).toEqual([0, 1]);
  });

  test("hidden files move with /H", () => {
    const hidden = writeFile(seeded, "C:\\", "C:\\SECRET.TXT", "x", NOW);
    if (!hidden.ok) throw new Error(hidden.error);
    const root = hidden.value.root;
    const filesystem = {
      root: {
        ...root,
        entries: root.entries.map((entry) =>
          entry.name === "SECRET.TXT" ? { ...entry, attributes: { ...entry.attributes, hidden: true } } : entry,
        ),
      },
    };

    expect(analyse(filesystem).fixed).toBe(3);
    expect(analyse(filesystem, 7, true).fixed).toBe(2);
  });

  test("the files lie near the top left, separated by gaps", () => {
    const map = analyse();
    const used = kinds(map, "used");

    expect(used).toHaveLength(map.movable);
    expect(Math.max(...used)).toBeLessThan(MAP_COLUMNS);
    expect(Math.max(...used) - Math.min(...used) + 1).toBeGreaterThan(used.length);
  });

  test("a large file adds used blocks", () => {
    const big = writeFile(seeded, "C:\\", "C:\\BIG.TXT", "x".repeat(2_000_000), NOW);
    if (!big.ok) throw new Error(big.error);

    expect(analyse(big.value).movable).toBeGreaterThan(analyse().movable + 5);
  });

  test("lost clusters are scattered away from the files, over the picture and outside it", () => {
    const map = analyse();
    const lost = kinds(map, "lost");
    const picture = new Set(smiley);

    expect(lost.length).toBe(map.targets.length);
    expect(lost.length).toBe(smiley.length);
    expect(lost.some((index) => picture.has(index))).toBe(true);
    expect(lost.some((index) => !picture.has(index))).toBe(true);
    expect(Math.min(...lost)).toBeGreaterThan(Math.max(...kinds(map, "used")));
    expect(new Set(lost.map((index) => Math.floor(index / MAP_COLUMNS))).size).toBeGreaterThan(10);
  });

  test("a fixed seed gives a fixed layout and another seed another", () => {
    expect(analyse(seeded, 7)).toEqual(analyse(seeded, 7));
    expect(analyse(seeded, 7).blocks).not.toEqual(analyse(seeded, 8).blocks);
  });
});

describe("Moving blocks", () => {
  test("gathering leaves the files in one run after the fixed blocks", () => {
    const map = analyse();
    const blocks = gatherMoves(map).reduce((current, move) => applyMove(current, move), map.blocks);
    const used = blocks.flatMap((block, index) => (block.kind === "used" ? [index] : []));

    expect(used).toEqual(Array.from({ length: map.movable }, (_, block) => map.fixed + block));
  });

  test("assembly fills every picture cell with a lost cluster", () => {
    const map = analyse();
    const gathered = gatherMoves(map).reduce((current, move) => applyMove(current, move), map.blocks);
    const blocks = assemblyMoves(map).reduce(
      (current, move) => applyMove(current, move, { kind: "picture", color: "yellow" }),
      gathered,
    );

    expect(blocks.some((block) => block.kind === "lost")).toBe(false);
    expect(blocks.filter((block) => block.kind === "picture")).toHaveLength(smiley.length);
  });

  test("assembly reads each lost cluster once and never writes over one still waiting", () => {
    const map = analyse();
    const moves = assemblyMoves(map);
    const waiting = new Set(map.blocks.flatMap((block, index) => (block.kind === "lost" ? [index] : [])));

    expect(new Set(moves.map(({ from }) => from)).size).toBe(moves.length);
    for (const { from, to } of moves) {
      expect(waiting.has(from)).toBe(true);
      expect(to === from || !waiting.has(to)).toBe(true);
      waiting.delete(from);
    }
    expect(moves.some(({ from, to }) => from === to)).toBe(true);
  });

  test("the drive is mostly fragmented while lost clusters are found", () => {
    expect(notFragmented(analyse())).toBeLessThan(10);
  });
});
