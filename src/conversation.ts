export interface ClientState {
  firstName: string;
  lastName: string;
  authorPhone: string;
  authorName: string | null;
}

export interface RuleState {
  textContains: string[];
  client: string;
  weekday: number;
  time: string;
  authorPhone: string;
  authorName: string | null;
}

export interface ExpectedState {
  clients: ClientState[];
  rules: RuleState[];
}

export interface ActualRule {
  text: string;
  clients: string[];
  slots: { weekday: number; time: string }[];
  authorPhone: string;
  authorName: string | null;
  active: boolean;
}

export interface ActualState {
  clients: ClientState[];
  rules: ActualRule[];
}

const normalized = (value: string) => value.normalize('NFC').toLocaleLowerCase('it-IT');

export function hasHomeChannelNotice(text: string): boolean {
  return /no home channel is set|nessun canale principale impostato|\/sethome/i.test(text);
}

export function responseMatches(text: string, expected: { contains: string[]; time: string }): boolean {
  const [hours, minutes] = expected.time.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return false;
  const time = minutes === 0
    ? new RegExp(`(^|\\D)0?${hours}(?:[:.]00(?!\\d)|(?![\\d:.]))`)
    : new RegExp(`(^|\\D)0?${hours}[:.]${String(minutes).padStart(2, '0')}(?!\\d)`);
  return expected.contains.every((word) => normalized(text).includes(normalized(word))) && time.test(text);
}

export function stateMatches(actual: ActualState, expected: ExpectedState): boolean {
  if (actual.clients.length !== expected.clients.length || actual.rules.length !== expected.rules.length) return false;
  const remainingClients = [...actual.clients];
  for (const client of expected.clients) {
    const index = remainingClients.findIndex((row) => normalized(row.firstName) === normalized(client.firstName)
      && normalized(row.lastName) === normalized(client.lastName)
      && row.authorPhone === client.authorPhone && row.authorName === client.authorName);
    if (index < 0) return false;
    remainingClients.splice(index, 1);
  }
  const remainingRules = [...actual.rules];
  for (const rule of expected.rules) {
    const index = remainingRules.findIndex((row) => row.active && row.authorPhone === rule.authorPhone
      && row.authorName === rule.authorName && row.clients.length === 1
      && normalized(row.clients[0]) === normalized(rule.client)
      && row.slots.length === 1 && row.slots[0].weekday === rule.weekday && row.slots[0].time === rule.time
      && rule.textContains.every((word) => normalized(row.text).includes(normalized(word))));
    if (index < 0) return false;
    remainingRules.splice(index, 1);
  }
  return true;
}
