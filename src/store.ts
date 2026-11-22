/** Reserved host-bridge ids for the sandbox `store`. They contain a dot, so no tool identifier can equal one. */
export const STORE_IDS = ['__store.get', '__store.set', '__store.delete', '__store.keys'] as const;

export const DEFAULT_MAX_STORE_CHARS = 1024 * 1024;

export interface Store {
  /** Handle a bridge call; `handled: false` when `id` is not a store id. */
  handle(id: string, input: unknown): { handled: false } | { handled: true; value: unknown };
}

/**
 * Key/value store that outlives one script (it lives as long as the server). Values are kept as JSON text.
 * The size counts key plus JSON characters of every entry.
 */
export function createStore(maxChars = DEFAULT_MAX_STORE_CHARS): Store {
  const data = new Map<string, string>();
  let total = 0;
  const size = (k: string, v: string): number => k.length + v.length;

  const keyOf = (input: unknown): string => {
    const k = (input as { key?: unknown } | null)?.key;
    if (typeof k !== 'string') throw new Error('store: key must be a string');
    return k;
  };

  return {
    handle(id, input) {
      switch (id) {
        case '__store.get': {
          const raw = data.get(keyOf(input));
          return { handled: true, value: raw === undefined ? { found: false } : { found: true, json: raw } };
        }
        case '__store.set': {
          const key = keyOf(input);
          const json = (input as { json?: unknown }).json;
          if (typeof json !== 'string') {
            throw new Error('store.set: value must be JSON-serialisable (no undefined, functions or symbols)');
          }
          const old = data.get(key);
          const next = total - (old === undefined ? 0 : size(key, old)) + size(key, json);
          if (next > maxChars) {
            throw new Error(`store is full: ${next} > ${maxChars} characters. Delete keys or store less.`);
          }
          data.set(key, json);
          total = next;
          return { handled: true, value: null };
        }
        case '__store.delete': {
          const key = keyOf(input);
          const raw = data.get(key);
          if (raw !== undefined) {
            total -= size(key, raw);
            data.delete(key);
          }
          return { handled: true, value: raw !== undefined };
        }
        case '__store.keys':
          return { handled: true, value: [...data.keys()] };
        default:
          return { handled: false };
      }
    },
  };
}
