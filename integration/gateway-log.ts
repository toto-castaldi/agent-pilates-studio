import assert from 'node:assert/strict';
import { parseSendFailureLine } from '../src/send-failure-log.js';
import { USAGE_EVENT_FAILED } from '../src/usage-event.js';

// The gateway log holds the launch event, then only fixed send-failure events
// (for example replies to Graph unreachable from an isolated test network)
// and, when a test provokes it, the fixed usage-write failure event.
export function assertGatewayLog(log: string, options: { usageFailures?: boolean } = {}): string[] {
  const lines = log.trim().split('\n');
  assert.equal(lines[0], 'hermes_launch');
  for (const line of lines.slice(1)) {
    assert.ok(parseSendFailureLine(line) || (options.usageFailures && line === USAGE_EVENT_FAILED), `unexpected gateway log line: ${line}`);
  }
  return lines.slice(1);
}
