// Pure compaction policy shared by the host start command and the Hermes container.
// Callers inject network access; a missing or ambiguous model entry must never fall
// back to an assumed context window.
export const DEFAULT_IDLE_SECONDS = 4 * 60 * 60;
const DEFAULT_CATALOG_BASE = 'https://openrouter.ai/api/v1';

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
  if (value === undefined) return DEFAULT_IDLE_SECONDS;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new Error('Invalid inactivity interval');
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds > 2147483647) throw new Error('Invalid inactivity interval');
  return seconds;
}

// Container settings: Compose interpolates an unset optional value as an empty
// string, so only there an empty value means "use the default". The host command
// rejects an explicitly empty setting before reaching Compose.
export async function resolveCompaction({ env, fetch }) {
  const idle = idleSeconds(env.PILATES_IDLE_COMPACT_SECONDS === '' ? undefined : env.PILATES_IDLE_COMPACT_SECONDS);
  const model = env.PILATES_MODEL;
  if (typeof model !== 'string' || !/^[A-Za-z0-9._/:-]+$/.test(model)) throw new Error('Invalid model');
  const base = (env.OPENROUTER_BASE_URL || DEFAULT_CATALOG_BASE).replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(base)) throw new Error('Invalid catalog URL');
  const headers = env.OPENROUTER_API_KEY ? { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } : {};
  const response = await fetch(`${base}/models`, { headers, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('Model catalog unavailable');
  return { threshold: compactionThreshold(contextWindow(await response.json(), model)), idle };
}
