// Test-harness diagnostics only. Never return source text, SQL, parameters,
// model identifiers, tool-call IDs, names or arbitrary error strings.
import { responseMatches, type ExpectedResponse } from './conversation.js';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
export function diagnoseModelRequest(value: unknown): object[] {
  const messages = object(value).messages;
  if (!Array.isArray(messages)) return [];
  const calls = new Map<unknown, Record<string, unknown>>();
  const events: object[] = [];
  for (const message of messages) {
    const item = object(message);
    if (Array.isArray(item.tool_calls)) for (const call of item.tool_calls) {
      const entry = object(call); const fn = object(entry.function);
      let args: Record<string, unknown> = {};
      try { args = object(JSON.parse(String(fn.arguments))); } catch { /* unparseable arguments are not echoed */ }
      const query = typeof args.query === 'string' ? args.query : '';
      const sql = fn.name === 'studio_sql_query';
      const tables = ['teachers', 'teacher_assignments', 'teacher_rules', 'attendance', 'clients', 'training_rules'];
      calls.set(entry.id, {
        tool: sql ? 'sql' : fn.name === 'skill_view' ? 'skill' : 'other',
        operations: sql ? ['select', 'insert', 'update', 'delete'].filter((op) => new RegExp(`\\b${op}\\b`, 'i').test(query)) : [],
        tables: sql ? tables.filter((table) => new RegExp(`\\bapp\\.${table}\\b`, 'i').test(query)) : [],
        senderFunction: sql && query.includes('app.current_sender_teacher_id('),
        validAttendanceFilter: sql && /cancelled_at\s+is\s+null/i.test(query),
      });
    }
    if (item.role === 'tool') {
      const call = calls.get(item.tool_call_id);
      if (!call) continue;
      let result: Record<string, unknown> = {};
      try { result = object(JSON.parse(String(item.content))); } catch { /* no raw result */ }
      const error = typeof result.error === 'string' ? result.error : '';
      events.push({ ...call, rows: Array.isArray(result.rows) ? result.rows.length : null,
        error: !!error, sqlstate: typeof result.sqlstate === 'string' && /^[0-9A-Z]{5}$/.test(result.sqlstate) ? result.sqlstate : null,
        trustedContextUnavailable: /Trusted author context is unavailable|authenticated WhatsApp turn/.test(error),
        genericExecutionFailure: error === 'Database query could not be executed.',
        skillContent: call.tool === 'skill' && !error && /SKILL|content/.test(String(item.content)),
      });
    }
  }
  // History appears in successive requests; the caller stores only this last
  // sanitized snapshot, not the source request or incremental copies.
  return events;
}

export function diagnoseResponse(text: string, expected: ExpectedResponse): object {
  const lower = text.toLocaleLowerCase('it-IT');
  return {
    matches: responseMatches(text, expected),
    enrollmentMention: /censiment|anagrafic|gestore/.test(lower),
    profileMention: /profil|piacere|presentazion/.test(lower),
    operationClaim: /registrat|salvat|inserit|memorizzat/.test(lower),
    refusal: /non posso|non è possibile|non si può/.test(lower),
    futureWording: /futur|non ancora|non è ancora|non iniziat|deve ancora/.test(lower),
    startCondition: /prima.{0,60}(?:inizi|lezion)|dopo.{0,60}(?:inizi|lezion)|solo.{0,40}(?:svolt|inizi)|una volta.{0,30}(?:inizi|svolt)|in anticipo/.test(lower),
    excluded: (expected.excludes ?? []).map((name) => {
      const escaped = name.toLocaleLowerCase('it-IT').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lines = lower.split(/[\n!?]+/).filter((line) => line.includes(name.toLocaleLowerCase('it-IT')));
      return { mentioned: lower.includes(name.toLocaleLowerCase('it-IT')),
        contexts: lines.map((line) => ({
          presenceTerm: /presen/.test(line), absenceTerm: /assen/.test(line),
          cancellationTerm: /annull/.test(line), missingRegistration: /senza registraz|nessuna registraz|non risult(?:a|ano)\s+(?:alcuna\s+|nessuna\s+)?registraz/.test(line),
          explicitExclusion: /esclus|non contegg|non inclus/.test(line), expectedTerm: /attes|previst/.test(line),
          negation: /\bnon\b|nessun|senza/.test(line),
        })),
        nonparticipantOrCancellationContext: new RegExp(`${escaped}[^.!?\\n]{0,70}(?:non risulta|non era|nessuna registrazione|annullat)|(?:non risulta|nessuna registrazione)[^.!?\\n]{0,70}${escaped}`).test(lower) };
    }),
    dayGroups: (expected.dayGroups ?? []).map((day) => ({
      matches: responseMatches(text, { contains: [], dayGroups: [day] }),
      groups: (day.groups ?? []).map((group) => responseMatches(text, { contains: [], dayGroups: [{ day: day.day, groups: [group] }] })),
    })),
  };
}
