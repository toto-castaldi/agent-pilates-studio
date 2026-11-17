// Contract of the fixed gateway event for a refused or undelivered WhatsApp
// send (send_failure_line in hermes/pilates_trusted.py). The line carries only
// fixed tokens, a three-digit HTTP status and Meta's numeric error code of at
// most seven digits: no field can hold a phone number, a text, a name or a
// credential.
export const SEND_FAILURE_EVENT = 'whatsapp_send_failed';
export type SendFailureSource = 'fixed' | 'agent';
export interface SendFailureEvent {
  source: SendFailureSource;
  // HTTP status of Meta's answer; 'network' when no answer was received.
  status: number | 'network' | 'invalid';
  // Meta's error.code, null when absent.
  code: number | null;
}

// Meta's code for a recipient missing from the test number's recipient list.
export const META_RECIPIENT_NOT_ALLOWED = 131030;

const LINE = /^whatsapp_send_failed source=(fixed|agent) status=([1-5][0-9]{2}|network|invalid) code=(0|[1-9][0-9]{0,6}|none)$/u;

export function parseSendFailureLine(line: string): SendFailureEvent | null {
  const match = LINE.exec(line);
  if (!match) return null;
  const [, source, status, code] = match;
  return {
    source: source as SendFailureSource,
    status: status === 'network' || status === 'invalid' ? status : Number(status),
    code: code === 'none' ? null : Number(code),
  };
}

export function formatSendFailureLine(event: SendFailureEvent): string {
  const status = typeof event.status === 'number' && Number.isInteger(event.status) && event.status >= 100 && event.status <= 599
    ? String(event.status) : event.status === 'network' ? 'network' : 'invalid';
  const code = event.code !== null && Number.isInteger(event.code) && event.code >= 0 && event.code < 10_000_000 ? String(event.code) : 'none';
  if (event.source !== 'fixed' && event.source !== 'agent') throw new Error('Invalid send source');
  return `${SEND_FAILURE_EVENT} source=${event.source} status=${status} code=${code}`;
}
