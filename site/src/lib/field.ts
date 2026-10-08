// Field diagram geometry, shared by the charting tool and the spray chart.
//
// field_x / field_y in the pitch data are positions on this diagram:
// x from 0 (left) to 1 (right), y from 0 (top) to 1 (bottom),
// home plate at PLATE, one base path = BASE_PATH units.

export const PLATE = { x: 0.5, y: 0.92 };
export const BASE_PATH = 0.16;

const DIAG = Math.SQRT1_2 * BASE_PATH;

/** Point `a` base paths up the first-base line and `b` up the third-base line. */
export function fromBasePaths(a: number, b: number): { x: number; y: number } {
  return { x: PLATE.x + (a - b) * DIAG, y: PLATE.y - (a + b) * DIAG };
}

// Outfield wall in fair territory, from the left-field pole to the right-field pole,
// as (a, b) base-path pairs. Traced from the top-down screenshot of the VR field
// (data repo: reference/field-topdown.png) after correcting the camera perspective
// with the four bases, then made symmetric by averaging each mirrored pair.
// Poles ~3.9 base paths, center ~4.3; treat as approximate (about ±5%).
const WALL: [number, number][] = [
  [0, 3.86],
  [1.1, 4.0],
  [2.5, 3.56],
  [3.56, 2.5],
  [4.0, 1.1],
  [3.86, 0],
];

export const wall = WALL.map(([a, b]) => fromBasePaths(a, b));
export const bases = {
  home: PLATE,
  first: fromBasePaths(1, 0),
  second: fromBasePaths(1, 1),
  third: fromBasePaths(0, 1),
  mound: fromBasePaths(0.5, 0.5),
};

// Rough fielder positions, used to label the diagram.
export const fielderSpots: Record<number, { x: number; y: number }> = {
  1: bases.mound,
  2: fromBasePaths(-0.2, -0.2),
  3: fromBasePaths(1.1, 0.25),
  4: fromBasePaths(1.45, 0.75),
  5: fromBasePaths(0.25, 1.1),
  6: fromBasePaths(0.75, 1.45),
  7: fromBasePaths(0.8, 2.6),
  8: fromBasePaths(2.05, 2.05),
  9: fromBasePaths(2.6, 0.8),
};
