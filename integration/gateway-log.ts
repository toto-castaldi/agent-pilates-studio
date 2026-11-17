import assert from 'node:assert/strict';
import { parseSendFailureLine } from '../src/send-failure-log.js';

// The gateway log holds the launch event, then only fixed send-failure events
// (for example replies to Graph unreachable from an isolated test network).
export function assertGatewayLog(log: string): string[] {
  const lines = log.trim().split('\n');
  assert.equal(lines[0], 'hermes_launch');
  for (const line of lines.slice(1)) assert.ok(parseSendFailureLine(line), `unexpected gateway log line: ${line}`);
  return lines.slice(1);
}
