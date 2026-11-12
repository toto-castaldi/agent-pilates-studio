export interface ClientState {
  firstName: string;
  lastName: string;
  authorPhone: string;
  authorName: string | null;
  id?: string;
  createdAt?: string;
}

export interface AttendanceState {
  client: string;
  lessonDate: string;
  time: string;
  outcome: string;
  authorPhone: string;
  authorName: string | null;
  createdAt?: string;
  cancelledAt?: string | null;
  cancelledByPhone?: string | null;
  cancelledByName?: string | null;
  cancellationReason?: string | null;
  id?: string;
}

export interface ExpectedAttendance extends AttendanceState {
  cancellation?: { authorPhone: string; authorName: string | null; reasonAnyOf?: string[] };
}

export interface AttendanceExpectation {
  attendance: ExpectedAttendance[];
  addedClients: ClientState[];
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

export interface TeacherInterval {
  weekday: number;
  min: string;
  max: string;
  isActive?: boolean;
}

export interface TeacherRuleState {
  id: string;
  teacher: string;
  text: string;
  createdAt: string;
  authorPhone: string;
  authorName: string | null;
  deactivatedAt: string | null;
  deactivatedByPhone: string | null;
  deactivatedByName: string | null;
  deactivationReason: string | null;
  intervals: TeacherInterval[];
}

export interface TeacherExpectation {
  teachers: { firstName: string; lastName: string }[];
  rules: { teacher: string; intervals: TeacherInterval[]; inactive?: boolean; ruleCount?: number }[];
}

export interface TeacherAssignmentState extends Omit<AttendanceState, 'client' | 'outcome'> {
  teacher: string;
  teacherId: string;
}

export interface ExpectedTeacherAssignment extends Omit<TeacherAssignmentState, 'teacherId'> {
  cancellation?: { authorPhone: string; authorName: string | null; reasonAnyOf?: string[] };
}

export interface AssignmentExpectation {
  assignments: ExpectedTeacherAssignment[];
  addedTeachers: ClientState[];
}

export interface ActualState {
  clients: ClientState[];
  rules: ActualRule[];
  attendance?: AttendanceState[];
  teachers?: ClientState[];
  teacherRules?: TeacherRuleState[];
  teacherAssignments?: TeacherAssignmentState[];
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
  dates?: string[];
  counts?: { labels: string[]; value: number }[];
}

const normalized = (value: string) => value.normalize('NFC').toLocaleLowerCase('it-IT');
const slotKey = (slot: Slot) => JSON.stringify([slot.weekday, slot.time]);
const edgeKey = (client: string, slot: Slot) => JSON.stringify([normalized(client), slot.weekday, slot.time]);
const weekdays = ['', 'luned', 'marted', 'mercoled', 'gioved', 'venerd', 'sabat', 'domenic'];

export function romeDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Freeze relative fixture dates at the start of a scenario, in Rome's calendar.
export function scenarioRelativeDate(reference: Date, value: string): string {
  const today = romeDate(reference);
  if (value === '$TODAY') return today;
  const date = new Date(`${today}T00:00:00Z`);
  if (value === '$YESTERDAY') {
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  const match = /^\$NEXT_MONDAY(?:\+(\d+))?$/.exec(value);
  if (!match) return value;
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7 || 7) + Number(match[1] || 0));
  return date.toISOString().slice(0, 10);
}

export function scenarioRelativeTimestamp(reference: Date, value: string | undefined): string | undefined {
  return value?.replace(/^\$YESTERDAY(?=T)/, scenarioRelativeDate(reference, '$YESTERDAY'));
}

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
  if (!(expected.counts ?? []).every(({ labels, value: count }) => {
    if (!Number.isInteger(count) || count < 0 || count > 10 || !labels.length) return false;
    const words = ['zero', 'un[oa]?', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];
    const number = `(?:(?<!\\d)${count}(?!\\d)|\\b${words[count]}\\b)`;
    return labels.some((label) => {
      if (!label) return false;
      const escaped = normalized(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const between = '[^\\d]{0,40}';
      return new RegExp(`(?:${number}${between}${escaped}|${escaped}${between}${number})`, 'i').test(value);
    });
  })) return false;
  if (!(expected.groups ?? []).every((group) => group.contains.length > 0
    && text.split(/\n+/).some((line) => responseMatches(line, { contains: group.contains, times: [group.time] })))) return false;
  if (expected.dayGroups?.length) {
    const days = [...value.matchAll(/luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica/g)];
    const fold = (day: string) => day.normalize('NFD').replace(/\p{M}/gu, '');
    if (!expected.dayGroups.every((expectedDay) => days.some((day, index) => fold(day[0]) === fold(normalized(expectedDay.day))
      && responseMatches(value.slice(day.index, days[index + 1]?.index), { contains: [], groups: expectedDay.groups, times: expectedDay.times })))) return false;
  }
  const dateText = value.replace(/[*_`~]/g, '');
  if (expected.date && !/\b(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})\b/i.test(dateText)) return false;
  const months = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  if (!(expected.dates ?? []).every((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const [year, month, day] = date.split('-').map(Number);
    if (!months[month] || day < 1 || day > 31) return false;
    const expression = new RegExp(`(?:\\b${date}\\b|\\b0?${day}[/.-]0?${month}(?:[/.-]${year}\\b|(?![/.-]\\d)\\b)|\\b0?${day}\\s+${months[month]}(?:\\s+${year}\\b|(?!\\s+\\d{4})\\b))`, 'i');
    return expression.test(dateText);
  })) return false;
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
  if (actual.attendance?.length || actual.teachers?.length || actual.teacherRules?.length || actual.teacherAssignments?.length) return false;
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

// Attendance scenarios compare the entire rule snapshot and all attendance
// rows, including cancelled ones, rather than only the currently valid rows.
export function attendanceScenarioMatches(before: ActualState, actual: ActualState, expected: AttendanceExpectation): boolean {
  if (JSON.stringify(before.teachers ?? []) !== JSON.stringify(actual.teachers ?? [])
    || JSON.stringify(before.teacherRules ?? []) !== JSON.stringify(actual.teacherRules ?? [])
    || JSON.stringify(before.teacherAssignments ?? []) !== JSON.stringify(actual.teacherAssignments ?? [])) return false;
  if (JSON.stringify(before.rules) !== JSON.stringify(actual.rules)) return false;
  if (JSON.stringify(before.clients) !== JSON.stringify(actual.clients.slice(0, before.clients.length))) return false;
  const added = actual.clients.slice(before.clients.length);
  if (added.length !== expected.addedClients.length) return false;
  const remaining = [...added];
  for (const client of expected.addedClients) {
    const index = remaining.findIndex((row) => normalized(row.firstName) === normalized(client.firstName)
      && normalized(row.lastName) === normalized(client.lastName) && row.authorPhone === client.authorPhone
      && row.authorName === client.authorName && !!row.id && !!row.createdAt && !Number.isNaN(Date.parse(row.createdAt)));
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  const rows = [...(actual.attendance ?? [])];
  if (rows.length !== expected.attendance.length) return false;
  for (const item of expected.attendance) {
    const index = rows.findIndex((row) => normalized(row.client) === normalized(item.client)
      && row.lessonDate === item.lessonDate && row.time === item.time && row.outcome === item.outcome
      && row.authorPhone === item.authorPhone && row.authorName === item.authorName
      && !!row.id && !!row.createdAt && !Number.isNaN(Date.parse(row.createdAt))
      && (item.cancellation
        ? !!row.cancelledAt && !Number.isNaN(Date.parse(row.cancelledAt))
          && row.cancelledByPhone === item.cancellation.authorPhone && row.cancelledByName === item.cancellation.authorName
          && !!row.cancellationReason?.trim() && (!item.cancellation.reasonAnyOf
            || item.cancellation.reasonAnyOf.some((word) => normalized(row.cancellationReason ?? '').includes(normalized(word))))
        : !row.cancelledAt && !row.cancelledByPhone && !row.cancelledByName && !row.cancellationReason));
    if (index < 0) return false;
    rows.splice(index, 1);
  }
  return true;
}

// Assignment scenarios preserve all unrelated tables and compare the complete
// assignment history, including cancellations and the teacher foreign key.
export function assignmentScenarioMatches(before: ActualState, actual: ActualState, expected: AssignmentExpectation): boolean {
  if (JSON.stringify(before.clients) !== JSON.stringify(actual.clients)
    || JSON.stringify(before.rules) !== JSON.stringify(actual.rules)
    || JSON.stringify(before.attendance ?? []) !== JSON.stringify(actual.attendance ?? [])
    || JSON.stringify(before.teacherRules ?? []) !== JSON.stringify(actual.teacherRules ?? [])) return false;
  const teachers = actual.teachers ?? [];
  const originalTeachers = before.teachers ?? [];
  if (JSON.stringify(originalTeachers) !== JSON.stringify(teachers.slice(0, originalTeachers.length))
    || new Set(teachers.map((row) => row.id)).size !== teachers.length) return false;
  const added = teachers.slice(originalTeachers.length);
  if (added.length !== expected.addedTeachers.length) return false;
  const remainingTeachers = [...added];
  for (const person of expected.addedTeachers) {
    const index = remainingTeachers.findIndex((row) => normalized(row.firstName) === normalized(person.firstName)
      && normalized(row.lastName) === normalized(person.lastName) && row.authorPhone === person.authorPhone
      && row.authorName === person.authorName && !!row.id && !!row.createdAt && !Number.isNaN(Date.parse(row.createdAt)));
    if (index < 0) return false;
    remainingTeachers.splice(index, 1);
  }
  const rows = [...(actual.teacherAssignments ?? [])];
  if (rows.length !== expected.assignments.length || new Set(rows.map((row) => row.id)).size !== rows.length) return false;
  const validLessons = rows.filter((row) => !row.cancelledAt).map((row) => JSON.stringify([row.lessonDate, row.time]));
  if (new Set(validLessons).size !== validLessons.length) return false;
  for (const item of expected.assignments) {
    const index = rows.findIndex((row) => normalized(row.teacher) === normalized(item.teacher)
      && !!row.teacherId && teachers.some((teacher) => teacher.id === row.teacherId
        && normalized(`${teacher.firstName} ${teacher.lastName}`) === normalized(row.teacher))
      && row.lessonDate === item.lessonDate && row.time === item.time
      && /^\d{4}-\d{2}-\d{2}$/.test(row.lessonDate) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time)
      && row.authorPhone === item.authorPhone && row.authorName === item.authorName
      && !!row.id && !!row.createdAt && !Number.isNaN(Date.parse(row.createdAt))
      && (item.cancellation
        ? !!row.cancelledAt && !Number.isNaN(Date.parse(row.cancelledAt)) && Date.parse(row.cancelledAt) >= Date.parse(row.createdAt)
          && row.cancelledByPhone === item.cancellation.authorPhone && row.cancelledByName === item.cancellation.authorName
          && !!row.cancellationReason?.trim() && (!item.cancellation.reasonAnyOf
            || item.cancellation.reasonAnyOf.some((word) => normalized(row.cancellationReason ?? '').includes(normalized(word))))
        : !row.cancelledAt && !row.cancelledByPhone && !row.cancelledByName && !row.cancellationReason));
    if (index < 0) return false;
    rows.splice(index, 1);
  }
  return true;
}

// Compare teacher coverage minute by minute, permitting equivalent splits but
// rejecting duplicates, missing endpoints, wrong authors and extra records.
export function teacherScenarioMatches(actual: ActualState, expected: TeacherExpectation, authorPhone: string, authorName: string | null): boolean {
  if (actual.clients.length || actual.rules.length || actual.attendance?.length || actual.teacherAssignments?.length) return false;
  const teachers = [...(actual.teachers ?? [])];
  if (teachers.length !== expected.teachers.length) return false;
  for (const person of expected.teachers) {
    const index = teachers.findIndex((row) => normalized(row.firstName) === normalized(person.firstName)
      && normalized(row.lastName) === normalized(person.lastName) && row.authorPhone === authorPhone
      && row.authorName === authorName && !!row.id && !!row.createdAt && !Number.isNaN(Date.parse(row.createdAt)));
    if (index < 0) return false;
    teachers.splice(index, 1);
  }
  const minutes = (intervals: TeacherInterval[]): string[] | null => {
    const result: string[] = [];
    for (const interval of intervals) {
      if (!Number.isInteger(interval.weekday) || interval.weekday < 1 || interval.weekday > 7
        || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.min)
        || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.max)) return null;
      const [minHours, minMinutes] = interval.min.split(':').map(Number);
      const [maxHours, maxMinutes] = interval.max.split(':').map(Number);
      const min = minHours * 60 + minMinutes;
      const max = maxHours * 60 + maxMinutes;
      if (min > max) return null;
      for (let minute = min; minute <= max; minute++) result.push(`${interval.weekday}:${minute}`);
    }
    return result;
  };
  const groups = expected.rules.map((rule) => {
    const edges = minutes(rule.intervals);
    return { rule, edges, expected: new Set(edges ?? []), seen: new Set<string>(), count: 0 };
  });
  const names = new Set(expected.teachers.map((person) => normalized(`${person.firstName} ${person.lastName}`)));
  const identities = groups.map(({ rule }) => JSON.stringify([normalized(rule.teacher), !!rule.inactive]));
  if (new Set(identities).size !== identities.length || groups.some(({ rule, edges, expected: coverage }) =>
    !names.has(normalized(rule.teacher)) || !edges?.length || coverage.size !== edges.length)) return false;
  for (const row of actual.teacherRules ?? []) {
    const inactive = !!row.deactivatedAt;
    const group = groups.find(({ rule }) => normalized(rule.teacher) === normalized(row.teacher) && !!rule.inactive === inactive);
    const edges = minutes(row.intervals);
    if (!group || !row.id || !row.createdAt || Number.isNaN(Date.parse(row.createdAt))
      || !row.text.trim() || row.text !== row.text.trim() || row.authorPhone !== authorPhone || row.authorName !== authorName
      || !edges?.length || new Set(edges).size !== edges.length || row.intervals.some((interval) => interval.isActive !== !inactive)
      || (inactive ? Number.isNaN(Date.parse(row.deactivatedAt ?? '')) || Date.parse(row.deactivatedAt ?? '') < Date.parse(row.createdAt) || row.deactivatedByPhone !== authorPhone
        || row.deactivatedByName !== authorName || !row.deactivationReason?.trim()
        : !!row.deactivatedByPhone || !!row.deactivatedByName || !!row.deactivationReason)
      || edges.some((edge) => !group.expected.has(edge) || group.seen.has(edge))) return false;
    for (const edge of edges) group.seen.add(edge);
    group.count++;
  }
  return groups.every(({ rule, expected: coverage, seen, count }) => coverage.size === seen.size
    && (rule.ruleCount === undefined || rule.ruleCount === count));
}

// Existing records are immutable except for the first cancellation or
// deactivation; cancelled or deactivated rows must remain exactly unchanged.
export function historyPreserved(previous: ActualState, current: ActualState): boolean {
  if (!(previous.teachers ?? []).every((row) => {
    const matches = (current.teachers ?? []).filter((next) => next.id === row.id);
    return !!row.id && matches.length === 1 && JSON.stringify(matches[0]) === JSON.stringify(row);
  })) return false;
  if (!(previous.teacherAssignments ?? []).every((row) => {
    if (!row.id || !row.createdAt || Number.isNaN(Date.parse(row.createdAt))) return false;
    const matches = (current.teacherAssignments ?? []).filter((next) => next.id === row.id);
    if (matches.length !== 1) return false;
    const next = matches[0];
    if (JSON.stringify(row) === JSON.stringify(next)) return true;
    if (row.cancelledAt || row.cancelledByPhone || row.cancelledByName || row.cancellationReason
      || !next.cancelledAt || Number.isNaN(Date.parse(next.cancelledAt)) || Date.parse(next.cancelledAt) < Date.parse(row.createdAt)
      || !next.cancelledByPhone || !next.cancellationReason?.trim()) return false;
    return JSON.stringify({ ...next, cancelledAt: row.cancelledAt, cancelledByPhone: row.cancelledByPhone,
      cancelledByName: row.cancelledByName, cancellationReason: row.cancellationReason }) === JSON.stringify(row);
  })) return false;
  if (!(previous.teacherRules ?? []).every((row) => {
    const matches = (current.teacherRules ?? []).filter((next) => next.id === row.id);
    if (matches.length !== 1) return false;
    const next = matches[0];
    if (JSON.stringify(row) === JSON.stringify(next)) return true;
    if (row.deactivatedAt || row.deactivatedByPhone || row.deactivatedByName || row.deactivationReason
      || !next.deactivatedAt || Number.isNaN(Date.parse(next.deactivatedAt)) || !next.deactivatedByPhone
      || !next.deactivationReason?.trim() || row.intervals.some((interval) => interval.isActive !== true)
      || next.intervals.some((interval) => interval.isActive !== false)) return false;
    const restored = { ...next, deactivatedAt: row.deactivatedAt, deactivatedByPhone: row.deactivatedByPhone,
      deactivatedByName: row.deactivatedByName, deactivationReason: row.deactivationReason,
      intervals: next.intervals.map((interval) => ({ ...interval, isActive: true })) };
    return JSON.stringify(restored) === JSON.stringify(row);
  })) return false;
  if (!(previous.attendance ?? []).every((row) => {
    if (!row.id || !row.createdAt) return false;
    const matches = (current.attendance ?? []).filter((next) => next.id === row.id);
    if (matches.length !== 1) return false;
    const next = matches[0];
    if (JSON.stringify(row) === JSON.stringify(next)) return true;
    if (row.cancelledAt || row.cancelledByPhone || row.cancelledByName || row.cancellationReason
      || !next.cancelledAt || Number.isNaN(Date.parse(next.cancelledAt)) || !next.cancelledByPhone || !next.cancellationReason?.trim()) return false;
    return JSON.stringify({ ...next, cancelledAt: row.cancelledAt, cancelledByPhone: row.cancelledByPhone,
      cancelledByName: row.cancelledByName, cancellationReason: row.cancellationReason }) === JSON.stringify(row);
  })) return false;
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
