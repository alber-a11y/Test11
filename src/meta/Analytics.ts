/** Analytics stub: collects events locally; plug a real SDK in here later. */
const counts = new Map<string, number>();

export function track(event: string, params: Record<string, unknown> = {}) {
  counts.set(event, (counts.get(event) ?? 0) + 1);
  if (import.meta.env.DEV) console.debug('[analytics]', event, params);
}

export function analyticsCounts() {
  return Object.fromEntries(counts);
}
