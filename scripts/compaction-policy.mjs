// Pure policy: callers provide the configured model and provider catalog. A missing
// or ambiguous entry must never fall back to an assumed model context window.
export function contextWindow(catalog, model) {
  if (!catalog || !Array.isArray(catalog.data) || typeof model !== 'string' || !model) {
    throw new Error('Invalid model catalog');
  }
  const matches = catalog.data.filter((entry) => entry && entry.id === model);
  const window = matches[0]?.context_length;
  if (matches.length !== 1 || !Number.isSafeInteger(window) || window < 3) {
    throw new Error('Model context window unavailable');
  }
  return window;
}

export function compactionThreshold(window) {
  if (!Number.isSafeInteger(window) || window < 3) throw new Error('Invalid model context window');
  // Integer arithmetic avoids rounding up past 40%, including near MAX_SAFE_INTEGER.
  return Math.floor(window / 5) * 2 + Math.floor((window % 5) * 2 / 5);
}

export function idleSeconds(value) {
  if (value === undefined) return 4 * 60 * 60;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new Error('Invalid inactivity interval');
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds > 2147483647) throw new Error('Invalid inactivity interval');
  return seconds;
}
