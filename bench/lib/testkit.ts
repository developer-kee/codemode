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

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Numbers 0 to 99 written out ("seven", "twenty-three"), as digits, so a correct answer in words is not marked wrong. */
function spelledOutNumbers(text: string): number[] {
  const found: number[] = [];
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  for (let i = 0; i < words.length; i++) {
    const tens = TENS.indexOf(words[i] ?? '');
    if (tens >= 2) {
      // "twenty-three" is one number, not twenty and three.
      const ones = ONES.indexOf(words[i + 1] ?? '');
      if (ones >= 1 && ones <= 9) {
        found.push(tens * 10 + ones);
        i++;
      } else {
        found.push(tens * 10);
      }
      continue;
    }
    const single = ONES.indexOf(words[i] ?? '');
    if (single >= 0) found.push(single);
  }
  return found;
}

/** True when the answer contains a number within `tol` of `value`: digits (thousands separators ignored) or words up to ninety-nine. */
export function hasNumber(answer: string, value: number, tol = 0): boolean {
  const digits = [...answer.replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return [...digits, ...spelledOutNumbers(answer)].some((n) => Math.abs(n - value) <= tol);
}
