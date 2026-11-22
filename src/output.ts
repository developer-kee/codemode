/**
 * Cap the text returned to the model: keep the head (70%) and the tail (30%) and say what was cut.
 * Only the final text is capped; nothing the script holds in memory is touched.
 * The result is `max` characters of content plus the marker.
 */
export function capOutput(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  const omitted = text.length - head - tail;
  const marker = `\n…[${omitted} characters omitted; output is capped at ${max} characters, so log or return less]…\n`;
  return `${text.slice(0, head)}${marker}${tail > 0 ? text.slice(text.length - tail) : ''}`;
}
