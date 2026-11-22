import { blender } from './blender/index.ts';
import type { BenchService } from './lib/types.ts';
import { windows } from './windows/index.ts';
import { windowsFull } from './windows-full/index.ts';
import { makeCallService } from './lib/calls.ts';
import { suites } from './suites.ts';

/** Add a benchmarked tool here: one folder under bench/<id>/ exporting a BenchService. */
export const services: BenchService[] = [blender, windows, windowsFull, ...suites.map(makeCallService)];

export function getService(id: string): BenchService | undefined {
  return services.find((s) => s.id === id);
}

