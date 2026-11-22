import { blender } from './blender/index.ts';
import type { BenchService, BenchVariant } from './lib/types.ts';
import { playwright } from './playwright/index.ts';
import { windows } from './windows/index.ts';

/** Add a benchmarked service here: one folder under bench/<id>/ (matching services/<id>.ts) exporting a BenchService. */
export const services: BenchService[] = [blender, windows, playwright];

export function getService(id: string): BenchService | undefined {
  return services.find((s) => s.id === id);
}

export function getVariant(service: BenchService, id: string): BenchVariant | undefined {
  return service.variants.find((v) => v.id === id);
}
