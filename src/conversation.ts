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
}

const normalized = (value: string) => value.normalize('NFC').toLocaleLowerCase('it-IT');
const slotKey = (slot: Slot) => JSON.stringify([slot.weekday, slot.time]);
const edgeKey = (client: string, slot: Slot) => JSON.stringify([normalized(client), slot.weekday, slot.time]);
const weekdays = ['', 'luned', 'marted', 'mercoled', 'gioved', 'venerd', 'sabat', 'domenic'];

export function hasHomeChannelNotice(text: string): boolean {
  return /no home channel is set|nessun canale principale impostato|\/sethome/i.test(text);
}

export function responseMatches(text: string, expected: ExpectedResponse): boolean {
  const value = normalized(text);
  if (!expected.contains.every((word) => value.includes(normalized(word)))) return false;
  if (!(expected.anyOf ?? []).every((choices) => choices.length > 0 && choices.some((word) => value.includes(normalized(word))))) return false;
  if ((expected.excludes ?? []).some((word) => value.includes(normalized(word)))) return false;
  if (expected.question && !/[?？]/.test(text)) return false;
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
    if (!row.active || !row.hasCreatedAt || !row.text.trim() || !row.clients.length || !row.slots.length
      || new Set(row.clients.map(normalized)).size !== row.clients.length
      || new Set(row.slots.map(slotKey)).size !== row.slots.length) return false;
    const edges = row.clients.flatMap((client) => row.slots.map((slot) => edgeKey(client, slot)));
    const matches = groups.filter(({ rule, edges: expectedEdges }) => row.authorPhone === rule.authorPhone
      && row.authorName === rule.authorName
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
