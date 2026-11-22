// Small helpers every suite's tasks need: verdicts, deterministic data, files, number matching.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import type { Verdict } from './types/index.ts';

export const ok: Verdict = { pass: true, detail: 'ok' };
export const fail = (detail: string): Verdict => ({ pass: false, detail });

/** Deterministic pseudo-random sequence, so every run seeds identical data. */
export function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Non-empty trimmed lines. */
export const lines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

export const readText = (path: string): string => readFileSync(path, 'utf8').replace(/^﻿/, '');

/** Empty the folder, creating it if needed. */
export function freshDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

/** True when the answer contains a number within `tol` of `value` (thousands separators ignored). */
export function hasNumber(answer: string, value: number, tol = 0): boolean {
  return [...answer.replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].some((m) => Math.abs(Number(m[0]) - value) <= tol);
}
