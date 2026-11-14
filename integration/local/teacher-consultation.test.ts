import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type ExpectedResponse, responseMatches, scenarioRelativeDate, scenarioRelativeTimestamp } from '../../src/conversation.js';

interface Slot { weekday: number; time: string }
interface Interval { weekday: number; min: string; max: string }
interface Fixture {
  id: string;
  sender: string;
  setup: {
    createdAt: string;
    rules: { clients: string[]; slots: Slot[]; createdAt?: string; active?: boolean; deactivatedAt?: string }[];
    teacherRules?: { teacher: string; intervals: Interval[]; createdAt?: string; deactivatedAt?: string }[];
    assignments?: { teacher: string; lessonDate: string; time: string; createdAt: string; cancelledAt?: string }[];
    attendance?: { client: string; lessonDate: string; time: string; outcome: string; cancelledAt?: string }[];
  };
  turns: { message: string; response: ExpectedResponse; unchanged?: boolean; sqlAggregate?: boolean }[];
}

// A fixed run instant: relative tokens resolve as they would at the start of
// a scenario, and rules without createdAt are created at this instant.
const reference = new Date('2026-11-14T12:00:00Z');
const day = (value: string) => scenarioRelativeDate(reference, value);
const instant = (value: string | undefined) => (value ? Date.parse(scenarioRelativeTimestamp(reference, value) ?? '') : Number.NaN);

// Lesson start in Europe/Rome as a UTC instant, independent of the database.
function romeStart(date: string, time: string): number {
  const offset = (at: number) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(at));
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')) - at;
  };
  const local = Date.parse(`${date}T${time}:00Z`);
  return local - offset(local - offset(local));
}

const isoDay = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const validAt = (start: number, createdAt: string | undefined, deactivatedAt: string | undefined) =>
  (createdAt ? instant(createdAt) : reference.getTime()) < start && (!deactivatedAt || instant(deactivatedAt) > start);

// Independent oracle of REQ-STUDIO-014 over the synthetic fixtures: existing
// lessons, expected teacher from rules valid at the start and valid indication.
function lessons(fixture: Fixture, first: string, last: string) {
  const { setup } = fixture;
  const found = new Map<string, { date: string; time: string }>();
  for (let date = first; date <= last; date = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
    for (const rule of setup.rules) {
      for (const slot of rule.slots) {
        const deactivatedAt = rule.active === false ? rule.deactivatedAt ?? setup.createdAt : undefined;
        if (slot.weekday === isoDay(date) && validAt(romeStart(date, slot.time), rule.createdAt ?? setup.createdAt, deactivatedAt)) found.set(`${date} ${slot.time}`, { date, time: slot.time });
      }
    }
  }
  for (const row of [...(setup.attendance ?? []), ...(setup.assignments ?? [])]) {
    const date = day(row.lessonDate);
    if (!row.cancelledAt && date >= first && date <= last) found.set(`${date} ${row.time}`, { date, time: row.time });
  }
  return [...found.values()].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).map((lesson) => {
    const start = romeStart(lesson.date, lesson.time);
    const expected = (setup.teacherRules ?? []).filter((rule) => validAt(start, rule.createdAt, rule.deactivatedAt)
      && rule.intervals.some((interval) => interval.weekday === isoDay(lesson.date) && interval.min <= lesson.time && lesson.time <= interval.max)).map((rule) => rule.teacher);
    const assigned = (setup.assignments ?? []).filter((row) => !row.cancelledAt && day(row.lessonDate) === lesson.date && row.time === lesson.time).map((row) => row.teacher);
    assert.ok(expected.length <= 1 && assigned.length <= 1, 'fixtures must define at most one expected and one indicated teacher');
    return { ...lesson, start, expected: expected[0], assigned: assigned[0], teacher: assigned[0] ?? expected[0] };
  });
}

const resolved = (response: ExpectedResponse): ExpectedResponse => ({ ...response, dates: response.dates?.map(day) });

test('teacher consultation catalog matches an independent oracle and never expects writes', async () => {
  const catalog = JSON.parse(await readFile('scenarios/basic.json', 'utf8')) as { scenarios: Fixture[] };
  const scenario = (id: string) => {
    const found = catalog.scenarios.find((entry) => entry.id === id);
    assert.ok(found, `Missing scenario ${id}`);
    return found;
  };
  const ids = ['consultazione-insegnante-lezione', 'consultazione-insegnante-periodo', 'consultazione-insegnante-regole', 'consultazione-lezioni-senza-insegnante'];
  for (const id of ids) {
    const entry = scenario(id);
    assert.ok(entry.turns.length >= 2 && entry.turns.every((turn) => turn.unchanged === true), `${id} must only consult`);
  }

  // Lesson with an indication, expected teacher, cancelled substitution, history.
  const single = scenario('consultazione-insegnante-lezione');
  assert.ok(single.setup.assignments?.some((row) => row.cancelledAt) && single.setup.assignments.some((row) => !row.cancelledAt));
  const at = (date: string, time: string) => {
    const found = lessons(single, day(date), day(date)).find((lesson) => lesson.time === time);
    assert.ok(found, `missing lesson ${date} ${time}`);
    return found;
  };
  assert.deepEqual([at('$LAST_SATURDAY', '19:00')].map(({ expected, assigned }) => [expected, assigned]), [['Francesca Blu', 'Antonio Neri']]);
  assert.deepEqual([at('$NEXT_MONDAY', '18:00')].map(({ expected, assigned }) => [expected, assigned]), [['Antonio Neri', undefined]]);
  assert.deepEqual([at('$YESTERDAY', '20:00')].map(({ expected, assigned }) => [expected, assigned]), [['Giulia Rosa', undefined]]);
  const [substitution, expectedOnly, cancelled, history] = single.turns;
  assert.deepEqual(substitution.response.dates, ['$LAST_SATURDAY']);
  assert.ok(responseMatches(`Sabato ${day('$LAST_SATURDAY')} alle 19:00 l'ha tenuta Antonio Neri in sostituzione di Francesca Blu.`, resolved(substitution.response)));
  assert.equal(responseMatches(`Sabato ${day('$LAST_SATURDAY')} alle 19:00 l'ha tenuta Francesca Blu.`, resolved(substitution.response)), false);
  assert.ok(responseMatches('Lunedì alle 18:00 la tiene Antonio Neri, insegnante atteso dalla regola.', expectedOnly.response));
  assert.equal(responseMatches('Lunedì alle 18:00 la tiene Francesca Blu.', expectedOnly.response), false);
  assert.ok(responseMatches(`Ieri, ${day('$YESTERDAY')}, alle 20:00 l'ha tenuta Giulia Rosa, l'insegnante atteso; l'indicazione di Antonio Neri è annullata.`, resolved(cancelled.response)));
  assert.equal(responseMatches(`Ieri, ${day('$YESTERDAY')}, alle 20:00 l'ha tenuta Antonio Neri.`, resolved(cancelled.response)), false);
  assert.ok(history.response.date && history.response.excludes?.includes(single.sender));
  assert.equal(responseMatches(`Antonio Neri: annullata il 13/11/2026 da Operatore Sintetico (${single.sender}), motivo errore.`, history.response), false);

  // Lessons, counts and present clients of a teacher in October 2025.
  const period = scenario('consultazione-insegnante-periodo');
  assert.ok(period.setup.teacherRules?.some((rule) => rule.deactivatedAt), 'the period must cross a deactivated historical rule');
  assert.ok(period.setup.assignments?.some((row) => row.cancelledAt) && period.setup.attendance?.some((row) => row.cancelledAt));
  const october = lessons(period, '2025-10-01', '2025-10-31');
  const teacher = 'Antonio Neri';
  const held = october.filter((lesson) => lesson.teacher === teacher);
  const asSubstitute = held.filter((lesson) => lesson.assigned === teacher && lesson.expected && lesson.expected !== teacher);
  const replaced = october.filter((lesson) => lesson.expected === teacher && lesson.assigned && lesson.assigned !== teacher);
  const [list, present, empty] = period.turns;
  assert.deepEqual(list.response.dates, [...held, ...replaced].map((lesson) => lesson.date).sort());
  assert.deepEqual(list.response.counts?.map((count) => count.value), [held.length, asSubstitute.length, replaced.length]);
  assert.deepEqual([held.length, asSubstitute.length, replaced.length], [7, 2, 1]);
  const presences = new Map<string, number>();
  for (const row of period.setup.attendance ?? []) {
    if (row.outcome === 'present' && !row.cancelledAt && held.some((lesson) => lesson.date === row.lessonDate && lesson.time === row.time)) {
      presences.set(row.client, (presences.get(row.client) ?? 0) + 1);
    }
  }
  assert.deepEqual([...presences.keys()].map((name) => name.split(' ')[0]).sort(), [...present.response.contains].sort());
  for (const count of present.response.counts ?? []) {
    assert.equal([...presences].find(([name]) => name.startsWith(`${count.labels[0]} `))?.[1], count.value);
  }
  for (const name of present.response.excludes ?? []) assert.ok(![...presences.keys()].some((client) => client.startsWith(`${name} `)));
  assert.ok(list.sqlAggregate && present.sqlAggregate);
  assert.ok(responseMatches('Lezioni tenute: 7, di cui 2 in sostituzione; sostituite da altri: 1. Clienti: Antonio, Francesca, Ada, Dario. '
    + '3 ottobre 2025, 6 ottobre 2025, 10 ottobre 2025, 13 ottobre 2025, 20 ottobre 2025, 22 ottobre 2025, 27 ottobre 2025, 31 ottobre 2025', list.response));
  assert.equal(responseMatches('Lezioni tenute: 5, di cui 2 in sostituzione; sostituite da altri: 1. Antonio, Francesca, Ada, Dario. '
    + '3 ottobre 2025, 6 ottobre 2025, 10 ottobre 2025, 13 ottobre 2025, 20 ottobre 2025, 22 ottobre 2025, 27 ottobre 2025, 31 ottobre 2025', list.response), false);
  assert.ok(responseMatches('Ada Verdi: 3 presenze; Bruno Rossi: 1; Carla Bianchi: 1; Dario Viola: 2; Emma Gialli: 1.', present.response));
  assert.equal(responseMatches('Ada Verdi: 4 presenze; Bruno Rossi: 2; Carla Bianchi: 2; Dario Viola: 2; Emma Gialli: 1; Zeno Pace: 1.', present.response), false);
  assert.equal(lessons(period, '2024-03-01', '2024-03-31').length, 0);
  assert.ok(empty.response.anyOf?.[0].includes('nessun'));

  // Active rules, expected teacher by weekday, part of day or time, history.
  const rules = scenario('consultazione-insegnante-regole');
  const active = (rules.setup.teacherRules ?? []).filter((rule) => !rule.deactivatedAt);
  assert.ok(active.some((rule) => !rule.createdAt), 'a current rule is created through the normal triggers');
  assert.ok((rules.setup.teacherRules ?? []).some((rule) => rule.deactivatedAt && rule.teacher === 'Antonio Neri'
    && rule.intervals.some((interval) => interval.weekday === 5 && interval.min === '19:00')));
  assert.deepEqual(active.filter((rule) => rule.intervals.some((interval) => interval.weekday === 5 && interval.min <= '19:00' && interval.max >= '19:00')).map((rule) => rule.teacher), ['Francesca Blu']);
  assert.deepEqual(active.filter((rule) => rule.intervals.some((interval) => interval.weekday === 1 && interval.min <= '17:59' && interval.max >= '13:00')), []);
  const [, friday, wednesday, afternoon, ruleHistory] = rules.turns;
  assert.ok(friday.response.excludes?.includes('Antonio') && wednesday.response.contains.includes('Francesca'));
  assert.ok(afternoon.response.anyOf?.[0].includes('nessun'));
  assert.deepEqual(ruleHistory.response.dates, ['2025-09-01', '2025-10-15']);
  assert.ok(ruleHistory.response.excludes?.includes(rules.sender));

  // Lessons without teacher last week, with a current rule that is not valid
  // for past lessons and a cancelled indication; then an empty period.
  const missing = scenario('consultazione-lezioni-senza-insegnante');
  const lastWeek = lessons(missing, day('$LAST_WEEK_MONDAY'), day('$LAST_WEEK_MONDAY+6'));
  const withoutTeacher = lastWeek.filter((lesson) => !lesson.teacher);
  const [noTeacher, emptyWeek] = missing.turns;
  assert.deepEqual(noTeacher.response.dates?.map(day), withoutTeacher.map((lesson) => lesson.date));
  assert.deepEqual([...(noTeacher.response.times ?? [])].sort(), [...new Set(withoutTeacher.map((lesson) => lesson.time))].sort());
  const listed = withoutTeacher.map((lesson) => `${lesson.date} alle ${lesson.time}`).join('; ');
  assert.ok(responseMatches(`Lezioni senza insegnante: ${listed}.`, resolved(noTeacher.response)));
  for (const lesson of lastWeek.filter((entry) => entry.teacher)) {
    assert.equal(responseMatches(`Lezioni senza insegnante: ${listed}; ${lesson.date} alle ${lesson.time} con ${lesson.teacher}.`, resolved(noTeacher.response)), false);
  }
  assert.ok(lastWeek.some((lesson) => lesson.teacher && lesson.assigned) && lastWeek.some((lesson) => lesson.teacher && lesson.expected));
  assert.ok((missing.setup.teacherRules ?? []).some((rule) => !rule.createdAt && rule.intervals.some((interval) => interval.weekday === 2)),
    'the current Tuesday rule must not give a teacher to last week');
  assert.ok(lastWeek.every((lesson) => lesson.start < reference.getTime()));
  assert.equal(lessons(missing, '2023-01-02', '2023-01-08').length, 0);
  assert.ok(emptyWeek.response.anyOf?.[0].includes('nessun'));
});
