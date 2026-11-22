import type { ObjectSnapshot, SceneSnapshot } from './blender.ts';

export interface Verdict {
  pass: boolean;
  detail: string;
}

export interface Task {
  id: string;
  /** Python run in Blender before the agent starts (scene is emptied first). */
  seed?: string;
  /** Identical text for both paths; never mentions tool names. */
  prompt: string;
  verify(scene: SceneSnapshot, answer: string): Verdict;
}

const near = (a: number, b: number, tol = 0.02): boolean => Math.abs(a - b) <= tol;
const nearV = (a: readonly number[], b: readonly number[], tol = 0.02): boolean =>
  a.length === b.length && a.every((v, i) => near(v, b[i] ?? Number.NaN, tol));
const byName = (scene: SceneSnapshot): Map<string, ObjectSnapshot> =>
  new Map(scene.objects.map((o) => [o.name, o]));

const fail = (detail: string): Verdict => ({ pass: false, detail });
const ok: Verdict = { pass: true, detail: 'ok' };

export const tasks: Task[] = [
  {
    id: 'table',
    prompt:
      'In the empty Blender scene build a simple table. A box named TableTop, 2 x 1 x 0.1 (x, y, z), centred on x=0 and y=0, ' +
      'with its top surface at z=1. Four cylinders named Leg_1, Leg_2, Leg_3, Leg_4, each radius 0.05 and height 0.95, ' +
      'standing on z=0 under the four corners of the top, inset 0.1 from each edge. Then reply with one short sentence.',
    verify(scene) {
      const objs = byName(scene);
      const top = objs.get('TableTop');
      if (!top) return fail('TableTop missing');
      if (!nearV(top.dimensions, [2, 1, 0.1])) return fail(`TableTop dims ${top.dimensions.join(',')}`);
      if (!near(top.location[2], 0.95) || !near(top.location[0], 0) || !near(top.location[1], 0)) {
        return fail(`TableTop loc ${top.location.join(',')}`);
      }
      const corners = new Set<string>();
      for (let i = 1; i <= 4; i++) {
        const leg = objs.get(`Leg_${i}`);
        if (!leg) return fail(`Leg_${i} missing`);
        if (!nearV(leg.dimensions, [0.1, 0.1, 0.95])) return fail(`Leg_${i} dims ${leg.dimensions.join(',')}`);
        if (!near(leg.location[2], 0.475)) return fail(`Leg_${i} z ${leg.location[2]}`);
        if (!near(Math.abs(leg.location[0]), 0.9) || !near(Math.abs(leg.location[1]), 0.4)) {
          return fail(`Leg_${i} xy ${leg.location[0]},${leg.location[1]}`);
        }
        corners.add(`${Math.sign(leg.location[0])},${Math.sign(leg.location[1])}`);
      }
      return corners.size === 4 ? ok : fail('legs are not in four distinct corners');
    },
  },
  {
    id: 'grid',
    prompt:
      'In the empty Blender scene create a 5 x 5 grid of cubes (each 1 unit across) named Cube_R_C for row R and column C, both 0 to 4. ' +
      'Cube_0_0 sits at the origin; each column step moves 3 units along +x and each row step 3 units along +y. ' +
      'Give every row its own material named Row_R (R = row number) with a different base colour per row, and assign it to all cubes in that row. ' +
      'Then reply with one short sentence.',
    verify(scene) {
      const objs = byName(scene);
      const colours = new Set<string>();
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const cube = objs.get(`Cube_${r}_${c}`);
          if (!cube) return fail(`Cube_${r}_${c} missing`);
          if (!nearV(cube.location, [c * 3, r * 3, 0])) return fail(`Cube_${r}_${c} at ${cube.location.join(',')}`);
          if (!nearV(cube.dimensions, [1, 1, 1])) return fail(`Cube_${r}_${c} dims ${cube.dimensions.join(',')}`);
          if (cube.materials.length !== 1 || cube.materials[0] !== `Row_${r}`) {
            return fail(`Cube_${r}_${c} materials ${cube.materials.join('|')}`);
          }
          colours.add(cube.materials[0]);
        }
      }
      return colours.size === 5 && scene.objects.length === 25 ? ok : fail(`objects=${scene.objects.length}`);
    },
  },
  {
    id: 'inspect-modify',
    seed: `
import bpy
for i in range(1, 9):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(i * 3, 0, 1))
    bpy.context.active_object.name = f"Crate_{i}"
for i in range(1, 5):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1, location=(i * 3, 5, 1))
    bpy.context.active_object.name = f"Barrel_{i}"
`,
    prompt:
      'The Blender scene holds a number of objects named Crate_N and Barrel_N. Find them, then move every crate up by 2 units on Z ' +
      'and scale every barrel to 150% uniformly around its own origin (do not move the barrels). ' +
      'Reply with one short sentence that states how many objects you changed.',
    verify(scene, answer) {
      for (const o of scene.objects) {
        if (o.name.startsWith('Crate_')) {
          if (!near(o.location[2], 3)) return fail(`${o.name} z=${o.location[2]}`);
        } else if (o.name.startsWith('Barrel_')) {
          if (!nearV(o.scale, [1.5, 1.5, 1.5])) return fail(`${o.name} scale ${o.scale.join(',')}`);
          if (!near(o.location[2], 1)) return fail(`${o.name} moved to z=${o.location[2]}`);
        }
      }
      if (scene.objects.length !== 12) return fail(`objects=${scene.objects.length}`);
      return /\b12\b|twelve/i.test(answer) ? ok : fail(`answer lacks count: ${answer.slice(0, 80)}`);
    },
  },
];
