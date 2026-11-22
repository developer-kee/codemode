// Model families: how runs are grouped in the reports, derived from the model id.
import type { RunRecord } from './records.ts';

/** Family display names for common model prefixes; anything else is capitalised from its own prefix. */
const FAMILY_NAMES: Record<string, string> = {
  claude: 'Claude',
  deepseek: 'DeepSeek',
  gpt: 'OpenAI',
  openai: 'OpenAI',
  o1: 'OpenAI',
  o3: 'OpenAI',
  gemini: 'Google',
  gemma: 'Google',
  llama: 'Meta',
  qwen: 'Qwen',
  mistral: 'Mistral',
  kimi: 'Moonshot',
  grok: 'xAI',
};
/** Families that sort first; any other family follows alphabetically. */
const FAMILY_ORDER = ['Claude', 'DeepSeek', 'Other'];

/** The family of a model id, from its leading alphanumeric token (`claude-sonnet-5-5` -> `Claude`). */
export function modelFamily(model: string): string {
  const key = model.trim().toLowerCase().match(/^[a-z0-9]+/)?.[0] ?? '';
  if (!key) return 'Other';
  return FAMILY_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Families present in `records`, in report order. */
export function familiesIn(records: RunRecord[]): string[] {
  const present = [...new Set(records.map((r) => modelFamily(r.model)))];
  const rank = (f: string): number => {
    const i = FAMILY_ORDER.indexOf(f);
    return i < 0 ? FAMILY_ORDER.length : i;
  };
  return present.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Distinct models in `records`, ordered by family and then by id. */
export function modelsIn(records: RunRecord[]): string[] {
  const models = [...new Set(records.map((r) => r.model))];
  const rank = (m: string): number => {
    const i = FAMILY_ORDER.indexOf(modelFamily(m));
    return i < 0 ? FAMILY_ORDER.length : i;
  };
  return models.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Runner that produced a record. Records without one predate `--runner` and all used `claude`. */
export const runnerOf = (r: RunRecord): string => r.runner ?? 'claude';

/** Distinct runner ids in `records`. */
export const runnersOf = (records: RunRecord[]): string[] => [...new Set(records.map(runnerOf))];
