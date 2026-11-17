import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSendFailureLine, META_RECIPIENT_NOT_ALLOWED, parseSendFailureLine } from '../src/send-failure-log.js';

test('send failure lines admit only source, HTTP status and Meta code', () => {
  assert.deepEqual(parseSendFailureLine('whatsapp_send_failed source=fixed status=400 code=131030'),
    { source: 'fixed', status: 400, code: META_RECIPIENT_NOT_ALLOWED });
  assert.deepEqual(parseSendFailureLine('whatsapp_send_failed source=agent status=network code=none'),
    { source: 'agent', status: 'network', code: null });
  assert.deepEqual(parseSendFailureLine('whatsapp_send_failed source=agent status=503 code=none'),
    { source: 'agent', status: 503, code: null });
  assert.deepEqual(parseSendFailureLine('whatsapp_send_failed source=fixed status=invalid code=2494010'),
    { source: 'fixed', status: 'invalid', code: 2494010 });
});

test('send failure lines reject recipients, texts, names, tokens and extra fields', () => {
  for (const line of [
    'whatsapp_send_failed source=fixed status=400 code=131030 to=15555550104',
    'whatsapp_send_failed source=fixed status=400 code=15555550104',
    'whatsapp_send_failed source=fixed status=400 code=12345678',
    'whatsapp_send_failed source=fixed status=15555550104 code=131030',
    'whatsapp_send_failed source=15555550104 status=400 code=131030',
    'whatsapp_send_failed source=fixed status=400 code=131030 Recipient phone number not in allowed list',
    'whatsapp_send_failed source=fixed status=400 code=131030 alpha SyntheticInstructor',
    'whatsapp_send_failed source=fixed status=400 code=131030 Bearer synthetic-access-token',
    'whatsapp_send_failed source=fixed status=400 code=131030 fbtrace_id=synthetic-trace',
    'whatsapp_send_failed source=fixed status=400 code=131030\nAccesso non abilitato',
    'whatsapp_send_failed source=fixed status=400 code=131030 ',
    'whatsapp_send_failed source=model status=400 code=131030',
    'whatsapp_send_failed source=fixed status=099 code=131030',
    'whatsapp_send_failed source=fixed status=400 code=0131030',
    'whatsapp_send_failed source=fixed code=131030',
    'hermes_launch',
  ]) assert.equal(parseSendFailureLine(line), null, line);
});

test('formatting keeps every field within the contract', () => {
  const cases = [
    [{ source: 'fixed', status: 400, code: 131030 }, 'whatsapp_send_failed source=fixed status=400 code=131030'],
    [{ source: 'agent', status: 'network', code: null }, 'whatsapp_send_failed source=agent status=network code=none'],
    [{ source: 'agent', status: 15555550104, code: 15555550104 }, 'whatsapp_send_failed source=agent status=invalid code=none'],
    [{ source: 'fixed', status: 400.5, code: -1 }, 'whatsapp_send_failed source=fixed status=invalid code=none'],
  ] as const;
  for (const [event, expected] of cases) {
    const line = formatSendFailureLine(event);
    assert.equal(line, expected);
    assert.ok(parseSendFailureLine(line));
    assert.doesNotMatch(line, /[0-9]{8}/u);
  }
  assert.throws(() => formatSendFailureLine({ source: 'model' as 'agent', status: 400, code: 1 }));
});
