import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MANAGEMENT_TTL, managementTransition, type ManagementInput, type ManagementPerson, type ManagementState } from '../src/identity-flow.js';
const actor: ManagementPerson = { id: '1', first_name: 'Synthetic', last_name: 'Manager', phone: '+15555550102', access_enabled: true, identity_revision: '1', legacy_identity: false };
const other: ManagementPerson = { ...actor, id: '2', first_name: 'Other', phone: '+15555550103' };
const base: ManagementInput = { text: '', now: 100, code: 'synthetic-code', manager: true, actor, people: [actor, other], state: null, managerPhone: actor.phone as string };
function flow(overrides: Partial<ManagementInput> = {}) {
  let state: ManagementState | null = null;
  return (text: string, extra: Partial<ManagementInput> = {}) => {
    const result = managementTransition({ ...base, ...overrides, state, text, ...extra });
    state = result.state;
    return result;
  };
}
test('management policies: bootstrap and international enroll require bound explicit confirmation', () => {
  const run = flow({ actor: null });
  assert.match(run('hello').reply, /iniziale/u);
  assert.equal(run(' Synthetic ').save, undefined);
  const preview = run(' Manager ');
  assert.equal(preview.state?.phone, actor.phone);
  assert.equal(preview.state?.operation, 'bootstrap');
  assert.equal(preview.save, undefined);
  assert.equal(run('/conferma synthetic-code').save?.operation, 'bootstrap');
  assert.equal(run('/conferma synthetic-code', { actor }).save, undefined);
  const enroll = flow();
  enroll('/anagrafica'); enroll('nuovo'); enroll('Other'); enroll('Person');
  const draft = enroll('00 1 (555) 555-0105');
  assert.equal(draft.state?.phone, '+15555550105');
  assert.equal(enroll('/conferma synthetic-code').save?.operation, 'enroll');
});
test('management policies: every mutation previews, self restrictions and reads', () => {
  for (const [command, operation, inputs] of [
    ['completa 2', 'complete', ['+15555550105']], ['correggi 2', 'correct', ['Other', 'Corrected']],
    ['numero 2', 'change_phone', ['+15555550105']], ['revoca 2', 'revoke', []], ['abilita 2', 'enable', []],
  ] as const) {
    const run = flow(); run('/anagrafica'); let preview = run(command);
    for (const value of inputs) preview = run(value);
    assert.equal(preview.state?.step, 'confirm'); assert.equal(preview.save, undefined);
    assert.equal(run('/conferma synthetic-code').save?.operation, operation);
  }
  const run = flow(); run('/anagrafica');
  assert.match(run('elenco').reply, /\+15555550103/u);
  for (const text of ['revoca 1', 'numero 1']) assert.match(run(text).reply, /Non puoi/u);
  assert.equal(run('correggi 1').state?.step, 'firstName');
});
test('management policies: cancel, invalid data, expired and interrupted confirmations never save', () => {
  for (const text of ['/annulla', '/conferma wrong', 'yes']) {
    const run = flow(); run('/anagrafica'); run('revoca 2'); assert.equal(run(text).save, undefined);
    assert.equal(run('/conferma synthetic-code').save, undefined);
  }
  for (const value of ['5555550105', '+1ABC5555550105', '']) {
    const run = flow(); run('/anagrafica'); run('numero 2'); assert.equal(run(value).state, null);
  }
  const run = flow(); run('/anagrafica'); run('revoca 2');
  assert.equal(run('/conferma synthetic-code', { now: 100 + MANAGEMENT_TTL }).save, undefined);
  assert.equal(run('/anagrafica').state?.step, 'menu');
});
test('management policies: untrusted or revoked senders cannot manage or confirm another flow', () => {
  for (const text of ['/anagrafica', '/conferma synthetic-code', '/annulla']) {
    const result = managementTransition({ ...base, text, manager: false });
    assert.equal(result.handled, true); assert.equal(result.save, undefined); assert.equal(result.state, null);
  }
  assert.equal(managementTransition({ ...base, text: '+15555550904', manager: false, state: { step: 'phone', expires: 1000 } }).handled, true);
  assert.equal(managementTransition({ ...base, text: 'ordinary turn', manager: false }).handled, false);
  assert.equal(managementTransition({ ...base, text: '/anagrafica', actor: { ...actor, access_enabled: false } }).state, null);
});
