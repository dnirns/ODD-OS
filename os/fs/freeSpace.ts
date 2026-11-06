import { fileSize } from "./entries";
import type { DirectoryEntry, Filesystem } from "./types";

const SECTOR_BYTES = 512;
const SECTORS_PER_MB = 2048;
const RESERVED_SECTORS = 1;
const ROOT_DIRECTORY_SECTORS = 32;
const FATS = 2;
const FAT16_ENTRY_BYTES = 2;
const DIRECTORY_ENTRY_BYTES = 32;

// Default FAT16 cluster sizes by volume size, from the Windows 2000 FAT
// documentation.
const CLUSTER_SECTORS: readonly (readonly [maxMb: number, sectors: number])[] = [
  [32, 1],
  [64, 2],
  [128, 4],
  [256, 8],
  [511, 16],
  [1023, 32],
  [2047, 64],
  [4095, 128],
];

const clusterSectors = (capacityMb: number) =>
  (CLUSTER_SECTORS.find(([maxMb]) => capacityMb <= maxMb) ?? CLUSTER_SECTORS[CLUSTER_SECTORS.length - 1])[1];

const fatSectors = (clusters: number) =>
  Math.ceil(((clusters + 2) * FAT16_ENTRY_BYTES) / SECTOR_BYTES);

const dataClusters = (capacityMb: number, perCluster: number) => {
  const overhead = RESERVED_SECTORS + ROOT_DIRECTORY_SECTORS;
  const total = capacityMb * SECTORS_PER_MB;
  const fits = (clusters: number) =>
    overhead + FATS * fatSectors(clusters) + clusters * perCluster <= total;

  let clusters = Math.max(Math.floor((total - overhead) / perCluster), 0);
  while (clusters > 0 && !fits(clusters)) clusters -= 1;

  return clusters;
};

const clustersFor = (bytes: number, clusterBytes: number) => Math.ceil(bytes / clusterBytes);

const clustersUsed = (directory: DirectoryEntry, clusterBytes: number): number =>
  directory.entries.reduce(
    (sum, entry) =>
      sum +
      (entry.kind === "file"
        ? clustersFor(fileSize(entry), clusterBytes)
        : Math.max(
            clustersFor((entry.entries.length + 2) * DIRECTORY_ENTRY_BYTES, clusterBytes),
            1,
          ) + clustersUsed(entry, clusterBytes)),
    0,
  );

export type ClusterCount = {
  readonly total: number;
  readonly used: number;
  readonly bytesPerCluster: number;
};

// The data clusters of a FAT16 volume of the given size and how many are in
// use. The root directory has its own fixed area, so it uses no clusters;
// every other file and directory is rounded up to whole clusters.
export const clusterCount = (fs: Filesystem, capacityMb: number): ClusterCount => {
  const perCluster = clusterSectors(capacityMb);
  const bytesPerCluster = perCluster * SECTOR_BYTES;

  return {
    total: dataClusters(capacityMb, perCluster),
    used: clustersUsed(fs.root, bytesPerCluster),
    bytesPerCluster,
  };
};

// Bytes free on a FAT16 volume of the given size.
export const freeBytes = (fs: Filesystem, capacityMb: number): number => {
  const { total, used, bytesPerCluster } = clusterCount(fs, capacityMb);

  return Math.max(total - used, 0) * bytesPerCluster;
};
