/**
 * Generated reports must come out the same on every machine, or `bench:validate` cannot tell a stale report from one
 * built on Linux CI. Task prompts and tool arguments contain absolute paths (a sandbox in the temp folder, the repo
 * checkout), which differ between machines and platforms, so reports show them as `<path>`.
 */
// Segments cannot contain spaces: a space would let a path swallow the words after it (and "2026 and /home/x" is two paths).
const ABSOLUTE_PATH = /(?:[A-Za-z]:[\\\\/]+|\/)(?:[\w.~-]+[\\\\/]+)+[\w.~-]*[\w~-]/g;

export const portablePaths = (text: string): string => text.replace(ABSOLUTE_PATH, '<path>');
