import { isDeepStrictEqual } from 'node:util';

export const workflowKeys = ['packages', 'skills', 'extensions', 'prompts'] as const;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function strings(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

export function validateWorkflow(value: unknown): Record<string, unknown> {
  if (!object(value) || Object.keys(value).some((key) => !workflowKeys.includes(key as typeof workflowKeys[number]))) {
    throw new Error('Manifest workflow Pi non valido.');
  }
  for (const [key, entries] of Object.entries(value)) {
    if (key !== 'packages') {
      if (!strings(entries)) throw new Error('Manifest workflow Pi non valido.');
    } else if (!Array.isArray(entries) || !entries.every((entry: unknown) => {
      if (typeof entry === 'string') return entry.trim().length > 0;
      if (!object(entry) || typeof entry.source !== 'string' || !entry.source.trim()) return false;
      return Object.entries(entry).every(([name, setting]) => {
        if (name === 'source') return true;
        if (name === 'autoload') return typeof setting === 'boolean';
        return ['skills', 'extensions', 'prompts'].includes(name) && strings(setting);
      });
    })) throw new Error('Manifest workflow Pi non valido.');
  }
  return value;
}

export function synchronizeWorkflow(manifest: unknown, settings: unknown): { settings: Record<string, unknown>; changed: boolean } {
  const workflow = validateWorkflow(manifest);
  if (!object(settings)) throw new Error('Settings Pi non valido.');
  const result = { ...settings };
  for (const key of workflowKeys) {
    delete result[key];
    if (Object.hasOwn(workflow, key)) result[key] = structuredClone(workflow[key]);
  }
  return { settings: result, changed: !isDeepStrictEqual(settings, result) };
}
