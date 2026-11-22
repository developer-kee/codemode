import { blender } from './suites/blender/index.ts';
import { playwright } from './suites/playwright/index.ts';
import { windows } from './suites/windows/index.ts';
import type { BenchService, BenchVariant } from './lib/types/index.ts';

/** Add a benchmarked service here: one folder under bench/suites/<id>/ (matching services/<id>.ts) exporting a BenchService. */
export const services: BenchService[] = [blender, windows, playwright];

export function getService(id: string): BenchService | undefined {
  return services.find((s) => s.id === id);
}

export function getVariant(service: BenchService, id: string): BenchVariant | undefined {
  return service.variants.find((v) => v.id === id);
}
