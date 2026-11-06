// The pictures DEFRAG.EXE assembles from lost clusters. Each is a fixed set
// of map cells, its silhouette, whose colours change from frame to frame.
// Fictional ODD/OS behaviour: no defragmenter ever did this.

import { CELL_HEIGHT, CELL_WIDTH, PIXEL_ASPECT, type TextStyle } from "../terminal/screen";

export type Color = NonNullable<TextStyle["fg"]>;

export const PICTURE_NAMES = ["smiley", "alien", "yinYang", "lavaLamp", "peace", "eye"] as const;

export type PictureName = (typeof PICTURE_NAMES)[number];

export type Picture = {
  readonly name: PictureName;
  readonly columns: number;
  readonly rows: number;
  // The colour of each map cell in reading order, undefined outside the
  // silhouette. Every frame has the same silhouette.
  readonly frame: (frame: number) => readonly (Color | undefined)[];
};

// A cell is shown about 2.4 times taller than it is wide, so horizontal
// distances are divided by this to keep round things round.
export const CELL_ASPECT = (CELL_HEIGHT * PIXEL_ASPECT) / CELL_WIDTH;

// The picture of the recovered file numbered `number`: the set in order,
// starting again after the last.
export const pictureFor = (number: number): PictureName => PICTURE_NAMES[number % PICTURE_NAMES.length];

type Shape = (x: number, y: number, frame: number) => Color | undefined;

// A point in row units from the picture's centre.
type Space = { readonly columns: number; readonly rows: number; readonly cx: number; readonly cy: number };

const between = (random: () => number, low: number, high: number) => low + random() * (high - low);

const render = (space: Space, shape: Shape) => (frame: number) =>
  Array.from({ length: space.columns * space.rows }, (_, index) => {
    const column = index % space.columns;
    const row = Math.floor(index / space.columns);
    return shape((column + 0.5 - space.cx) / CELL_ASPECT, row + 0.5 - space.cy, frame);
  });

// A centre column that keeps a shape `halfWidth` row units wide on the map.
const centreColumn = (random: () => number, columns: number, halfWidth: number) => {
  const margin = Math.min(halfWidth * CELL_ASPECT + 1, columns / 2);
  return between(random, margin, columns - margin);
};

const ellipse = (x: number, y: number, rx: number, ry: number) => (x / rx) ** 2 + (y / ry) ** 2 <= 1;

// Once every `period` frames the shape spends `length` frames in its other state.
const every = (frame: number, period: number, length: number, offset = 0) =>
  (frame + offset) % period < length;

// The acid house smiley: a yellow face, black eyes and a grin. It winks.
const smiley = (random: () => number, columns: number, rows: number): Shape & { space: Space } => {
  const radius = between(random, rows * 0.47, rows * 0.51);
  const space = { columns, rows, cx: centreColumn(random, columns, radius), cy: rows / 2 };
  const grin = between(random, 0.5, 0.66);
  const eyeHeight = between(random, 0.2, 0.28);

  const shape: Shape = (px, py, frame) => {
    const x = px / radius;
    const y = py / radius;
    const distance = Math.hypot(x, y);
    if (distance > 1) return undefined;

    const winking = every(frame, 40, 5, 20);
    const leftEye = ellipse(x + 0.36, y + 0.3, 0.11, eyeHeight);
    const rightEye = winking
      ? Math.abs(y + 0.3) < 0.07 && Math.abs(x - 0.36) < 0.17
      : ellipse(x - 0.36, y + 0.3, 0.11, eyeHeight);
    const mouth = y > 0.12 && distance >= 0.5 && distance <= 0.68 && Math.abs(x) < grin;

    return leftEye || rightEye || mouth ? "black" : "yellow";
  };

  return Object.assign(shape, { space });
};

// A grey alien: a head tapering to a small chin, and black almond eyes that blink.
const alien = (random: () => number, columns: number, rows: number) => {
  const height = between(random, rows * 0.45, rows * 0.49);
  const width = height * between(random, 0.72, 0.82);
  const slant = between(random, 0.45, 0.7);
  const space = { columns, rows, cx: centreColumn(random, columns, width), cy: rows / 2 };

  const shape: Shape = (px, py, frame) => {
    const y = py / height;
    const taper = y > 0 ? 1 - 0.62 * y : 1;
    if (!ellipse(px / (width * taper), y, 1, 1)) return undefined;

    const x = px / width;
    const eye = (side: number) => {
      const ex = x - side * 0.42;
      const ey = y - 0.05;
      const rotatedX = ex * Math.cos(side * slant) + ey * Math.sin(side * slant);
      const rotatedY = -ex * Math.sin(side * slant) + ey * Math.cos(side * slant);
      return ellipse(rotatedX, rotatedY, 0.36, 0.17);
    };

    if (eye(-1) || eye(1)) return every(frame, 50, 4, 10) ? "dark-grey" : "black";
    return "light-grey";
  };

  return Object.assign(shape, { space });
};

// A yin-yang, turning slowly.
const yinYang = (random: () => number, columns: number, rows: number) => {
  const radius = between(random, rows * 0.44, rows * 0.49);
  const speed = between(random, 0.08, 0.14) * (random() < 0.5 ? -1 : 1);
  const space = { columns, rows, cx: centreColumn(random, columns, radius), cy: rows / 2 };

  const shape: Shape = (px, py, frame) => {
    if (Math.hypot(px, py) > radius) return undefined;

    const angle = frame * speed;
    const x = (px * Math.cos(angle) + py * Math.sin(angle)) / radius;
    const y = (-px * Math.sin(angle) + py * Math.cos(angle)) / radius;
    const upper = Math.hypot(x, y + 0.5);
    const lower = Math.hypot(x, y - 0.5);

    if (upper < 0.17) return "black";
    if (lower < 0.17) return "white";
    if (upper < 0.5) return "white";
    if (lower < 0.5) return "black";
    return x < 0 ? "white" : "black";
  };

  return Object.assign(shape, { space });
};

// A lava lamp: a cap, a glass of magenta liquid with drifting blobs, and a base.
const lavaLamp = (random: () => number, columns: number, rows: number) => {
  const halfHeight = rows / 2 - 0.2;
  const glass = between(random, 3.4, 4);
  const space = { columns, rows, cx: centreColumn(random, columns, glass * 1.4), cy: rows / 2 };
  const blobs = Array.from({ length: 3 + Math.floor(random() * 2) }, () => ({
    x: between(random, -0.5, 0.5),
    phase: random() * Math.PI * 2,
    speed: between(random, 0.04, 0.08),
    size: between(random, 0.8, 1.2),
  }));
  const blobColor: Color = random() < 0.5 ? "yellow" : "light-red";

  const shape: Shape = (px, py, frame) => {
    const t = (py + halfHeight) / (halfHeight * 2);
    if (t < 0 || t > 1) return undefined;

    if (t < 0.12) return Math.abs(px) <= glass * (0.35 + t * 2.5) ? "dark-grey" : undefined;
    if (t > 0.82) return Math.abs(px) <= glass * (1.4 - (t - 0.82) * 2) ? "dark-grey" : undefined;

    const width = glass * (0.6 + (t - 0.12) * 0.75);
    if (Math.abs(px) > width) return undefined;

    const glassTop = -halfHeight + halfHeight * 2 * 0.12;
    const glassHeight = halfHeight * 2 * 0.7;
    const field = blobs.reduce((sum, blob) => {
      const by = glassTop + glassHeight * (0.5 + 0.42 * Math.sin(frame * blob.speed + blob.phase));
      const distance = Math.hypot((px - blob.x * width) / 1.1, py - by);
      return sum + blob.size ** 2 / Math.max(distance ** 2, 0.01);
    }, 0);

    return field > 1 ? blobColor : "magenta";
  };

  return Object.assign(shape, { space });
};

// The peace sign, a white ring and three spokes, pulsing light and dark.
const PEACE_PULSE: readonly Color[] = ["white", "white", "light-grey", "dark-grey", "light-grey"];

const peace = (random: () => number, columns: number, rows: number) => {
  const radius = between(random, rows * 0.44, rows * 0.49);
  const thickness = between(random, 0.15, 0.2);
  const space = { columns, rows, cx: centreColumn(random, columns, radius), cy: rows / 2 };

  const shape: Shape = (px, py, frame) => {
    const x = px / radius;
    const y = py / radius;
    const distance = Math.hypot(x, y);
    if (distance > 1) return undefined;

    const ring = distance >= 1 - thickness;
    const stem = Math.abs(x) < thickness / 2;
    const arms = y > 0 && Math.abs(Math.abs(x) - y) / Math.SQRT2 < thickness / 2;
    if (!ring && !stem && !arms) return undefined;

    return PEACE_PULSE[Math.floor(frame / 3) % PEACE_PULSE.length];
  };

  return Object.assign(shape, { space });
};

// A watching eye: an almond of white with a cyan iris that looks about.
const eye = (random: () => number, columns: number, rows: number) => {
  const height = between(random, rows * 0.4, rows * 0.46);
  const width = height * between(random, 1.6, 1.85);
  const iris = between(random, 0.42, 0.5);
  const look = between(random, 0.03, 0.06);
  const space = { columns, rows, cx: centreColumn(random, columns, width), cy: rows / 2 };

  const shape: Shape = (px, py, frame) => {
    const x = px / width;
    const y = py / height;
    if (Math.abs(x) > 1 || Math.abs(y) > 1 - x * x) return undefined;
    if (every(frame, 60, 4, 30)) return "brown";

    const ix = 0.45 * Math.sin(frame * look);
    // Whole rows only, so that the pupil keeps its shape as it moves.
    const iy = Math.round(0.15 * Math.sin(frame * look * 1.7) * height) / height;
    const fromIris = Math.hypot((px - ix * width) / height, y - iy);

    if (fromIris < iris * 0.45) return "black";
    if (fromIris < iris) return "light-cyan";
    return "white";
  };

  return Object.assign(shape, { space });
};

const GENERATORS = { smiley, alien, yinYang, lavaLamp, peace, eye } as const;

// A picture for a map of `columns` by `rows` cells, varied by `random`.
export const createPicture = (
  name: PictureName,
  random: () => number,
  columns: number,
  rows: number,
): Picture => {
  const shape = GENERATORS[name](random, columns, rows);

  return { name, columns, rows, frame: render(shape.space, shape) };
};

// The cells of a picture's silhouette in reading order.
export const silhouette = (picture: Picture): readonly number[] =>
  picture.frame(0).flatMap((color, index) => (color === undefined ? [] : [index]));
