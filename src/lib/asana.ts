/** Extract an Asana task gid from a pasted URL or bare id (ported from legacy parseTask). */
export function parseTask(input: string): string {
  const s = String(input || '').trim();
  if (!s) return '';
  if (/^\d{8,}$/.test(s)) return s;
  const m = s.match(/\/task\/(\d{8,})/);
  if (m) return m[1];
  const runs = s.split('?')[0].match(/\d{10,}/g);
  return runs ? runs[runs.length - 1] : '';
}
