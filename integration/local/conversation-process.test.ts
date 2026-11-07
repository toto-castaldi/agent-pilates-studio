import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { runProcess } from '../../src/conversation-process.js';

test('a waiting subprocess does not block the host relay event loop', async () => {
  const server = createServer((_request, response) => response.end('synthetic'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const script = 'fetch(process.argv[1]).then(r => r.text()).then(t => { if (t !== "synthetic") process.exitCode = 1; }).catch(() => { process.exitCode = 1; });';
    await runProcess(process.execPath, ['-e', script, `http://127.0.0.1:${address.port}/`], { PATH: process.env.PATH }, 10_000);
    await assert.rejects(runProcess(process.execPath, ['-e', 'process.exit(7)'], { PATH: process.env.PATH }, 10_000));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
