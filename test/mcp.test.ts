import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleMCPMessage } from '../src/mcp.js';

async function withTempProject<T>(prefix: string, fn: (dir: string) => Promise<T> | T): Promise<T> {
  const original = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), prefix));
  process.chdir(dir);
  try {
    return await fn(dir);
  } finally {
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('MCP adapter', () => {
  it('initializes with tool capability metadata', async () => {
    const response = await handleMCPMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '0.0.0' },
      },
    });

    assert.equal(response?.jsonrpc, '2.0');
    assert.equal(response?.id, 1);
    assert.ok(response && 'result' in response);
    assert.equal(response.result.protocolVersion, '2025-06-18');
    assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
  });

  it('lists SWD, receipt, and skill tools with safety annotations', async () => {
    const response = await handleMCPMessage({
      jsonrpc: '2.0',
      id: 'tools',
      method: 'tools/list',
    });

    assert.ok(response && 'result' in response);
    const tools = response.result.tools as Array<{ name: string; annotations?: Record<string, unknown> }>;
    const names = tools.map((tool) => tool.name);

    assert.ok(names.includes('swd_dry_run'));
    assert.ok(names.includes('swd_apply'));
    assert.ok(names.includes('receipts_list'));
    assert.ok(names.includes('receipts_verify'));
    assert.ok(names.includes('skills_list'));
    assert.equal(tools.find((tool) => tool.name === 'swd_dry_run')?.annotations?.readOnlyHint, true);
    assert.equal(tools.find((tool) => tool.name === 'swd_apply')?.annotations?.destructiveHint, true);
  });

  it('dry-runs external actions without writing files', async () => {
    await withTempProject('mythos-mcp-dryrun-', async () => {
      const response = await handleMCPMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'swd_dry_run',
          arguments: {
            actions: [
              {
                path: 'planned.txt',
                operation: 'CREATE',
                intent: 'MUTATE',
                description: 'Plan a file write',
                content: 'planned only',
              },
            ],
            agentId: 'mcp-test',
            modelId: 'manual',
          },
        },
      });

      assert.ok(response && 'result' in response);
      assert.equal(response.result.isError, false);
      const structured = response.result.structuredContent as { ok: boolean; mode: string };
      assert.equal(structured.ok, true);
      assert.equal(structured.mode, 'dry-run');
      assert.equal(existsSync('planned.txt'), false);
    });
  });

  it('returns tool errors for blocked sensitive paths', async () => {
    await withTempProject('mythos-mcp-blocked-', async () => {
      const response = await handleMCPMessage({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'swd_apply',
          arguments: {
            actions: [
              {
                path: '.env',
                operation: 'CREATE',
                description: 'Attempt secret write',
                content: 'SECRET=bad',
              },
            ],
          },
        },
      });

      assert.ok(response && 'result' in response);
      assert.equal(response.result.isError, true);
      const structured = response.result.structuredContent as { ok: boolean; rejected: Array<{ risk: string }> };
      assert.equal(structured.ok, false);
      assert.equal(structured.rejected[0]?.risk, 'block');
      assert.equal(existsSync('.env'), false);
    });
  });
});
