import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeIdentityDraft, normalizeIdentityName, normalizeInternationalPhone } from '../src/teacher-identity.js';

import { invalidPhones, phoneCases } from './identity-cases.js';

test('international phones require a prefix and normalize only common separators without guessing a country', () => {
  for (const [input, expected] of phoneCases) assert.equal(normalizeInternationalPhone(input), expected);
  for (const input of invalidPhones) assert.throws(() => normalizeInternationalPhone(input), { message: 'Invalid international phone' });
});

test('identity names are bounded and cleaned without losing accents or compound names', () => {
  for (const [input, expected] of [['  Synthetic  Alice ', 'Synthetic Alice'], ['D’Èlia', 'D’Èlia'], ['A\u00a0B\u202fC', 'A B C'], ['X'.repeat(200), 'X'.repeat(200)]]) {
    assert.equal(normalizeIdentityName(input), expected);
  }
  for (const input of [null, undefined, 42, '', '   ', '\u00a0', 'X'.repeat(201), 'Synthetic\nName', 'Synthetic\tName', 'Synthetic\u0000Name', 'Synthetic\u0085Name']) {
    assert.throws(() => normalizeIdentityName(input), { message: 'Invalid identity name' });
  }
});

test('identity drafts require exact operation fields and never accept a declared author or manager flag', () => {
  const enrollment = { operation: 'enroll', firstName: ' Synthetic ', lastName: ' Alice ', phone: '+1 (555) 555-0121' };
  assert.deepEqual(normalizeIdentityDraft(enrollment), {
    operation: 'enroll', teacherId: null, firstName: 'Synthetic', lastName: 'Alice', phone: '+15555550121',
  });
  assert.deepEqual(normalizeIdentityDraft({ ...enrollment, operation: 'bootstrap', teacherId: '42' }), {
    operation: 'bootstrap', teacherId: '42', firstName: 'Synthetic', lastName: 'Alice', phone: '+15555550121',
  });
  for (const operation of ['revoke', 'enable']) {
    assert.deepEqual(normalizeIdentityDraft({ operation, teacherId: '9223372036854775807' }), {
      operation, teacherId: '9223372036854775807', firstName: null, lastName: null, phone: null,
    });
  }
  assert.deepEqual(normalizeIdentityDraft({ operation: 'correct', teacherId: '42', firstName: 'Synthetic', lastName: 'Corrected' }), {
    operation: 'correct', teacherId: '42', firstName: 'Synthetic', lastName: 'Corrected', phone: null,
  });
  for (const operation of ['complete', 'change_phone']) {
    assert.equal(normalizeIdentityDraft({ operation, teacherId: '42', phone: '0015555550121' }).phone, '+15555550121');
  }
  for (const input of [
    null, [], {}, { ...enrollment, operation: 'unknown' }, { ...enrollment, phone: undefined },
    { ...enrollment, firstName: undefined }, { ...enrollment, lastName: undefined },
    ...['manager', 'sender', 'author', 'accessEnabled', 'identityRevision'].map((key) => ({ ...enrollment, [key]: true })),
    ...['0', '-1', '01', '1e3', '9223372036854775808', 42].map((teacherId) => ({ operation: 'revoke', teacherId })),
    { ...enrollment, teacherId: '42' }, { operation: 'complete', phone: '+15555550121' },
    { operation: 'correct', teacherId: '42', firstName: 'Synthetic', lastName: 'Corrected', phone: '+15555550121' },
    { operation: 'enable', teacherId: '42', firstName: 'Synthetic' },
  ]) assert.throws(() => normalizeIdentityDraft(input));
});
