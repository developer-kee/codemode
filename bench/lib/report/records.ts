// Run records: the on-disk JSONL batches and the generated calls-latest.json.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AgentRun } from '../runners/agent.ts';
import type { CallsData } from '../calls/data.ts';

export interface RunRecord {
  batch: string;
  /** Which variant of the service was run. Records written before variants existed have none and count as `scenarios`. */
  variant: string;
  task: string;
  model: string;
  /** Runner id that drove the model. Absent on early records, which all used `claude`. */
  runner?: string;
  repeat: number;
  pass: boolean;
  verdict: string;
  /** Git revision of this repo when the run was made, so results can be tied to the wrapper design. */
  rev?: string;
  run: AgentRun;
}

/** The variant of records that carry none (everything recorded before variants existed). */
export const LEGACY_VARIANT = 'scenarios';

/** `bench/`, from `bench/lib/report/records.ts`. */
const benchRoot = fileURLToPath(new URL('../../', import.meta.url));
const servicesRoot = `${benchRoot}services/`;

export const resultsDir = (serviceId: string): string => `${servicesRoot}${serviceId}/results/`;
export const callsFile = (serviceId: string): string => `${servicesRoot}${serviceId}/calls-latest.json`;
export const reportFile = (serviceId: string): string => `${servicesRoot}${serviceId}/RESULTS.md`;
export const overviewFile = `${benchRoot}RESULTS.md`;

export function saveRecord(serviceId: string, rec: RunRecord): void {
  mkdirSync(resultsDir(serviceId), { recursive: true });
  appendFileSync(`${resultsDir(serviceId)}${rec.batch}.jsonl`, `${JSON.stringify(rec)}\n`);
}

export function loadRecords(serviceId: string): RunRecord[] {
  const dir = resultsDir(serviceId);
  const records: RunRecord[] = [];
  if (!existsSync(dir)) return records;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(`${dir}${f}`, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as Omit<RunRecord, 'variant'> & { variant?: string };
      records.push({ ...rec, variant: rec.variant ?? LEGACY_VARIANT });
    }
  }
  return records;
}

export function saveCalls(serviceId: string, data: CallsData): void {
  writeFileSync(callsFile(serviceId), `${JSON.stringify(data, null, 2)}\n`);
}

export function loadCalls(serviceId: string): CallsData | undefined {
  const file = callsFile(serviceId);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as CallsData) : undefined;
}
