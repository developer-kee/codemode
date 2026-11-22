import type { AgentRunner } from './agent.ts';
import { claudeRunner } from './claude.ts';
import { dshRunner } from './dsh.ts';

/** Every runner the harness knows. Add one here to make it selectable with `--runner`. */
export const runners: readonly AgentRunner[] = [claudeRunner, dshRunner];

export function getRunner(id: string): AgentRunner | undefined {
  return runners.find((r) => r.id === id);
}

/** Default runner for a model id, so `--model deepseek-flash` works without also passing `--runner`. */
export function runnerForModel(model: string): AgentRunner | undefined {
  const m = model.trim().toLowerCase();
  if (m.startsWith('claude')) return claudeRunner;
  if (m.startsWith('deepseek')) return dshRunner;
  return undefined;
}
