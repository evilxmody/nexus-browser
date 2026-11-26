/** Collapse whitespace, trim and cap a user/page supplied title. */
export function cleanTitle(value: unknown, fallback: string, max = 200): string {
  const v = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  return v || fallback;
}
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
