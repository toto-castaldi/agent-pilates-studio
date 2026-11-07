export interface ClientState {
  firstName: string;
  lastName: string;
  authorPhone: string;
  authorName: string | null;
}

export interface Slot {
  weekday: number;
  time: string;
}

export interface RuleState {
  textContains: string[];
  clients: string[];
  slots: Slot[];
  authorPhone: string;
  authorName: string | null;
  together?: boolean;
  deactivation?: { authorPhone: string; authorName: string | null; reasonAnyOf?: string[] };
}

export interface ExpectedState {
  clients: ClientState[];
  rules: RuleState[];
}

export interface ActualRule {
  text: string;
  clients: string[];
  slots: Slot[];
  authorPhone: string;
  authorName: string | null;
  active: boolean;
  hasCreatedAt: boolean;
  id?: string;
  createdAt?: string;
  deactivatedAt?: string | null;
  deactivatedByPhone?: string | null;
  deactivatedByName?: string | null;
  deactivationReason?: string | null;
}

export interface ActualState {
  clients: ClientState[];
  rules: ActualRule[];
}

export interface ExpectedResponse {
  contains: string[];
  anyOf?: string[][];
  excludes?: string[];
  times?: string[];
  question?: boolean;
  groups?: { time: string; contains: string[] }[];
  dayGroups?: { day: string; groups?: { time: string; contains: string[] }[]; times?: string[] }[];
  date?: boolean;
}

const normalized = (value: string) => value.normalize('NFC').toLocaleLowerCase('it-IT');
const slotKey = (slot: Slot) => JSON.stringify([slot.weekday, slot.time]);
const edgeKey = (client: string, slot: Slot) => JSON.stringify([normalized(client), slot.weekday, slot.time]);
const weekdays = ['', 'luned', 'marted', 'mercoled', 'gioved', 'venerd', 'sabat', 'domenic'];

export function hasHomeChannelNotice(text: string): boolean {
  return /no home channel is set|nessun canale principale impostato|\/sethome/i.test(text);
}

// Snapshots are produced by the same ordered SQL queries, including attribution
// and deactivation metadata. Consultation must not change any selected field.
export function snapshotsMatch(before: ActualState, after: ActualState): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}

export function responseMatches(text: string, expected: ExpectedResponse): boolean {
  const value = normalized(text);
  if (!expected.contains.every((word) => value.includes(normalized(word)))) return false;
  if (!(expected.anyOf ?? []).every((choices) => choices.length > 0 && choices.some((word) => value.includes(normalized(word))))) return false;
  if ((expected.excludes ?? []).some((word) => value.includes(normalized(word)))) return false;
  if (expected.question && !/[?？]/.test(text)) return false;
  if (!(expected.groups ?? []).every((group) => group.contains.length > 0
    && text.split(/\n+/).some((line) => responseMatches(line, { contains: group.contains, times: [group.time] })))) return false;
  if (expected.dayGroups?.length) {
    const days = [...value.matchAll(/luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica/g)];
    const fold = (day: string) => day.normalize('NFD').replace(/\p{M}/gu, '');
    if (!expected.dayGroups.every((expectedDay) => days.some((day, index) => fold(day[0]) === fold(normalized(expectedDay.day))
      && responseMatches(value.slice(day.index, days[index + 1]?.index), { contains: [], groups: expectedDay.groups, times: expectedDay.times })))) return false;
  }
  if (expected.date && !/\b(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})\b/i.test(text)) return false;
  return (expected.times ?? []).every((time) => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
    const [hours, minutes] = time.split(':').map(Number);
    const pattern = minutes === 0
      ? new RegExp(`(^|\\D)0?${hours}(?:[:.]00(?!\\d)|(?![\\d:.]))`)
      : new RegExp(`(^|\\D)0?${hours}[:.]${String(minutes).padStart(2, '0')}(?!\\d)`);
    return pattern.test(text);
  });
}

// A group describes the expected client/slot associations, not a prescribed
// SQL decomposition. Each resulting rule must belong to one group; the union
// of its Cartesian associations must cover the group exactly once.
export function stateMatches(actual: ActualState, expected: ExpectedState): boolean {
  if (actual.clients.length !== expected.clients.length) return false;
  const remainingClients = [...actual.clients];
  for (const client of expected.clients) {
    const index = remainingClients.findIndex((row) => normalized(row.firstName) === normalized(client.firstName)
      && normalized(row.lastName) === normalized(client.lastName)
      && row.authorPhone === client.authorPhone && row.authorName === client.authorName);
    if (index < 0) return false;
    remainingClients.splice(index, 1);
  }
  const groups = expected.rules.map((rule) => ({
    rule,
    edges: new Set(rule.clients.flatMap((client) => rule.slots.map((slot) => edgeKey(client, slot)))),
    seen: new Set<string>(),
  }));
  const clientNames = new Set(expected.clients.map((client) => normalized(`${client.firstName} ${client.lastName}`)));
  if (groups.some(({ rule, edges }) => !rule.clients.length || !rule.slots.length
    || rule.clients.some((client) => !clientNames.has(normalized(client)))
    || edges.size !== rule.clients.length * rule.slots.length)) return false;
  for (const row of actual.rules) {
    if (!row.hasCreatedAt || !row.text.trim() || !row.clients.length || !row.slots.length
      || new Set(row.clients.map(normalized)).size !== row.clients.length
      || new Set(row.slots.map(slotKey)).size !== row.slots.length) return false;
    const edges = row.clients.flatMap((client) => row.slots.map((slot) => edgeKey(client, slot)));
    const matches = groups.filter(({ rule, edges: expectedEdges }) => row.authorPhone === rule.authorPhone
      && row.authorName === rule.authorName
      && (rule.deactivation
        ? !row.active && !!row.deactivatedAt && row.deactivatedByPhone === rule.deactivation.authorPhone
          && row.deactivatedByName === rule.deactivation.authorName && !!row.deactivationReason?.trim()
          && (!rule.deactivation.reasonAnyOf || rule.deactivation.reasonAnyOf.some((word) => normalized(row.deactivationReason ?? '').includes(normalized(word))))
        : row.active && !row.deactivatedAt && !row.deactivatedByPhone && !row.deactivatedByName && !row.deactivationReason)
      && rule.textContains.every((word) => normalized(row.text).includes(normalized(word)))
      && row.slots.every((slot) => weekdays[slot.weekday]
        && normalized(row.text).includes(weekdays[slot.weekday])
        && responseMatches(row.text, { contains: [], times: [slot.time] }))
      && (!rule.together || /insieme|gruppo|condivis/i.test(row.text)
        || rule.clients.every((client) => normalized(row.text).includes(normalized(client.split(' ')[0]))))
      && edges.every((edge) => expectedEdges.has(edge)));
    if (matches.length !== 1 || edges.some((edge) => matches[0].seen.has(edge))) return false;
    for (const edge of edges) matches[0].seen.add(edge);
  }
  return groups.every(({ edges, seen }) => edges.size === seen.size);
}

// Existing rules and their associations are immutable. Only the first
// deactivation may change a previously active row between turns.
export function historyPreserved(previous: ActualState, current: ActualState): boolean {
  return previous.rules.every((before) => {
    if (!before.id || !before.createdAt) return false;
    const matches = current.rules.filter((row) => row.id === before.id);
    if (matches.length !== 1) return false;
    const after = matches[0];
    if (before.createdAt !== after.createdAt || before.text !== after.text
      || before.authorPhone !== after.authorPhone || before.authorName !== after.authorName
      || JSON.stringify([...before.clients].sort()) !== JSON.stringify([...after.clients].sort())
      || JSON.stringify(before.slots.map(slotKey).sort()) !== JSON.stringify(after.slots.map(slotKey).sort())) return false;
    if (!before.active) {
      return !after.active && before.deactivatedAt === after.deactivatedAt
        && before.deactivatedByPhone === after.deactivatedByPhone
        && before.deactivatedByName === after.deactivatedByName
        && before.deactivationReason === after.deactivationReason;
    }
    return true;
  });
}
