import type { Verdict } from '../../lib/types/index.ts';
import { fail, ok } from '../../lib/testkit.ts';
import type { ObjectSnapshot, SceneSnapshot } from './socket.ts';

export interface TaskSpec {
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


// --- "audit" task data: 40 objects, deterministic, with known off-grid and below-ground cases. ---
interface AuditObj {
  name: string;
  x: number;
  y: number;
  z: number; // bounding-box centre
  sx: number;
  sy: number;
  sz: number;
  needsFix: boolean;
}

function buildAudit(): AuditObj[] {
  let s = 12345;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const cats: [string, number, number, number][] = [
    ['Crate', 1, 1, 1],
    ['Barrel', 0.8, 0.8, 1.2],
    ['Lamp', 0.2, 0.2, 3],
    ['Pillar', 0.6, 0.6, 4],
    ['Sign', 1.5, 0.1, 1],
  ];
  const out: AuditObj[] = [];
  for (const [cat, sx, sy, sz] of cats) {
    for (let i = 1; i <= 8; i++) {
      const gx = Math.floor(rnd() * 10) * 2;
      const gy = Math.floor(rnd() * 10) * 2;
      const jx = i % 3 === 0 ? 0 : Math.round((rnd() * 1.4 - 0.7) * 100) / 100;
      const jy = i % 3 === 0 ? 0 : Math.round((rnd() * 1.4 - 0.7) * 100) / 100;
      const mode = i % 4; // 0 on ground, 1 floating, 2 below ground, 3 on ground
      const lift = mode === 1 ? 0.6 : mode === 2 ? -0.4 : 0;
      const o: AuditObj = {
        name: `${cat}_${i}`,
        x: gx + jx,
        y: gy + jy,
        z: sz / 2 + lift,
        sx,
        sy,
        sz,
        needsFix: jx !== 0 || jy !== 0 || mode === 2,
      };
      out.push(o);
    }
  }
  return out;
}

const audit = buildAudit();
const auditExpected = audit.filter((o) => o.needsFix).length;
const snap2 = (v: number): number => Math.round(v / 2) * 2;

export const specs: TaskSpec[] = [
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
  {
    id: 'audit',
    seed: `
import bpy
DATA = ${JSON.stringify(audit.map((o) => [o.name, o.x, o.y, o.z, o.sx, o.sy, o.sz]))}
for name, x, y, z, sx, sy, sz in DATA:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    ob = bpy.context.active_object
    ob.scale = (sx, sy, sz)
    ob.name = name
`,
    prompt:
      'The Blender scene holds 40 objects in five groups by name prefix: Crate, Barrel, Lamp, Pillar and Sign. ' +
      'Audit and fix them. First, find how many objects each group has. Then: snap every object\'s x and y to the nearest multiple of 2 ' +
      '(an object already on a multiple stays put); and any object that sinks below the ground plane (z = 0) must be raised straight up ' +
      'so its lowest point sits exactly on z = 0. Do not touch the height of objects that are not below ground. ' +
      'Reply with one short sentence that gives the number of objects you had to adjust.',
    verify(scene, answer) {
      const objs = byName(scene);
      if (scene.objects.length !== 40) return fail(`objects=${scene.objects.length}`);
      for (const o of audit) {
        const got = objs.get(o.name);
        if (!got) return fail(`${o.name} missing`);
        if (!near(got.location[0], snap2(o.x)) || !near(got.location[1], snap2(o.y))) {
          return fail(`${o.name} xy ${got.location[0]},${got.location[1]} want ${snap2(o.x)},${snap2(o.y)}`);
        }
        const bottom = o.z - o.sz / 2;
        const wantZ = bottom < -0.001 ? o.sz / 2 : o.z;
        if (!near(got.location[2], wantZ)) return fail(`${o.name} z ${got.location[2]} want ${wantZ}`);
      }
      return new RegExp(`\\b${auditExpected}\\b`).test(answer)
        ? ok
        : fail(`answer lacks count ${auditExpected}: ${answer.slice(0, 80)}`);
    },
  },
];
