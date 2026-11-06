import type { IncomingHttpHeaders } from 'node:http';

/** Authorize the synthetic relay and prepare headers for the fixed OpenRouter host. */
export function proxyHeaders(
  method: string | undefined,
  path: string | undefined,
  headers: IncomingHttpHeaders,
  syntheticToken: string,
  apiKey: string,
): IncomingHttpHeaders | null {
  if (headers.authorization !== `Bearer ${syntheticToken}`
      || !['GET', 'POST'].includes(method ?? '')
      || !path?.startsWith('/api/v1/')) return null;
  const forwarded = { ...headers, authorization: `Bearer ${apiKey}`, host: 'openrouter.ai' };
  delete forwarded.connection;
  delete forwarded['transfer-encoding'];
  return forwarded;
}
