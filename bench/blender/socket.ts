import net from 'node:net';

/** Run Python inside the live Blender via the BlenderMCP addon socket. Returns what the code printed. */
export function blenderExec(code: string, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(9876, 'localhost');
    let buf = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Blender socket timeout; partial: ${buf.slice(0, 200)}`));
    }, timeoutMs);
    socket.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.on('data', (d) => {
      buf += d.toString('utf8');
      let msg: { status?: string; message?: string; result?: { result?: string } };
      try {
        msg = JSON.parse(buf) as typeof msg;
      } catch {
        return; // incomplete, keep reading
      }
      clearTimeout(timer);
      socket.end();
      if (msg.status !== 'success') reject(new Error(`Blender error: ${msg.message ?? buf}`));
      else resolve(msg.result?.result ?? '');
    });
    socket.write(JSON.stringify({ type: 'execute_code', params: { code } }));
  });
}

const MARK = '__R__';

async function blenderJson<T>(code: string): Promise<T> {
  const out = await blenderExec(code);
  const line = out.split('\n').reverse().find((l) => l.startsWith(MARK));
  if (!line) throw new Error(`No result marker in Blender output: ${out.slice(0, 300)}`);
  return JSON.parse(line.slice(MARK.length)) as T;
}

export async function resetScene(): Promise<void> {
  await blenderExec(`
import bpy
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(coll):
        coll.remove(b)
`);
}

export async function seedScene(code: string): Promise<void> {
  await blenderExec(code);
}

export interface ObjectSnapshot {
  name: string;
  type: string;
  location: [number, number, number];
  scale: [number, number, number];
  dimensions: [number, number, number];
  materials: string[];
}

export interface SceneSnapshot {
  objects: ObjectSnapshot[];
}

export function snapshotScene(): Promise<SceneSnapshot> {
  return blenderJson<SceneSnapshot>(`
import bpy, json
from mathutils import Vector
def center(o):
    # World-space bounding-box centre: independent of where the model put the object's origin.
    pts = [o.matrix_world @ Vector(v) for v in o.bound_box]
    return [sum(p[i] for p in pts) / 8 for i in range(3)]
objs = []
for o in bpy.data.objects:
    objs.append({
        "name": o.name, "type": o.type,
        "location": [round(v, 4) for v in center(o)],
        "scale": [round(v, 4) for v in o.scale],
        "dimensions": [round(v, 4) for v in o.dimensions],
        "materials": [s.material.name for s in o.material_slots if s.material],
    })
print("${MARK}" + json.dumps({"objects": objs}))
`);
}
