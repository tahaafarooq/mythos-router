import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseActions, SWDEngine, type FileAction } from '../src/swd.js';

// ─────────────────────────────────────────────────────────────
// Regression coverage for the v1.18.x correctness pass.
// Each block maps to one previously-identified bug.
// ─────────────────────────────────────────────────────────────

describe('parseActions: content containing the end marker is NOT truncated', () => {
  it('captures full content when the body contains a line-start [/FILE_ACTION]', () => {
    const output = [
      '[FILE_ACTION: docs/protocol.md]',
      'OPERATION: CREATE',
      'INTENT: MUTATE',
      'DESCRIPTION: Document the SWD format',
      'CONTENT:',
      '# SWD Format',
      'Blocks end with [/FILE_ACTION] on their own line.',
      'This second half of the doc must survive parsing.',
      '[/FILE_ACTION]',
    ].join('\n');

    const actions = parseActions(output);
    assert.equal(actions.length, 1);
    const content = actions[0]!.content!;
    // The whole body must be present — not truncated at the embedded marker.
    assert.ok(content.includes('# SWD Format'), 'first line missing');
    assert.ok(
      content.includes('This second half of the doc must survive parsing.'),
      'content truncated at embedded end marker',
    );
    // The embedded marker line itself is part of the content.
    assert.ok(content.includes('Blocks end with [/FILE_ACTION] on their own line.'));
  });

  it('does not treat an inline (mid-line) marker as structure', () => {
    const output = [
      '[FILE_ACTION: notes.txt]',
      'OPERATION: CREATE',
      'INTENT: MUTATE',
      'DESCRIPTION: inline marker',
      'CONTENT:',
      'see the [FILE_ACTION: x] token and [/FILE_ACTION] token used inline',
      '[/FILE_ACTION]',
    ].join('\n');

    const actions = parseActions(output);
    assert.equal(actions.length, 1, 'inline markers should not spawn extra actions');
    assert.ok(actions[0]!.content!.includes('used inline'));
  });

  it('still parses two real consecutive blocks', () => {
    const output = [
      '[FILE_ACTION: a.txt]',
      'OPERATION: CREATE',
      'DESCRIPTION: first',
      'CONTENT:',
      'alpha',
      '[/FILE_ACTION]',
      '[FILE_ACTION: b.txt]',
      'OPERATION: CREATE',
      'DESCRIPTION: second',
      'CONTENT:',
      'beta',
      '[/FILE_ACTION]',
    ].join('\n');

    const actions = parseActions(output);
    assert.equal(actions.length, 2);
    assert.equal(actions[0]!.path, 'a.txt');
    assert.equal(actions[0]!.content, 'alpha');
    assert.equal(actions[1]!.path, 'b.txt');
    assert.equal(actions[1]!.content, 'beta');
  });

  it('does not read field-like lines inside content as header fields', () => {
    const output = [
      '[FILE_ACTION: script.txt]',
      'OPERATION: CREATE',
      'DESCRIPTION: real description',
      'CONTENT:',
      'OPERATION: DELETE',
      'DESCRIPTION: this is content, not a field',
      '[/FILE_ACTION]',
    ].join('\n');

    const actions = parseActions(output);
    assert.equal(actions.length, 1);
    assert.equal(actions[0]!.operation, 'CREATE', 'operation was hijacked by content');
    assert.equal(actions[0]!.description, 'real description');
  });
});

describe('parseActions: traversal check is segment-based', () => {
  it('allows a legitimate filename containing ".." characters', () => {
    const output = [
      '[FILE_ACTION: backup..old.txt]',
      'OPERATION: CREATE',
      'DESCRIPTION: dotted filename',
      'CONTENT:',
      'data',
      '[/FILE_ACTION]',
    ].join('\n');

    const actions = parseActions(output);
    assert.equal(actions.length, 1, 'dotted filename was wrongly rejected');
    assert.equal(actions[0]!.path, 'backup..old.txt');
  });

  it('still rejects a real traversal segment', () => {
    const output = [
      '[FILE_ACTION: ../escape.txt]',
      'OPERATION: CREATE',
      'DESCRIPTION: traversal',
      'CONTENT:',
      'data',
      '[/FILE_ACTION]',
    ].join('\n');

    assert.equal(parseActions(output).length, 0);
  });

  it('rejects a traversal segment in the middle of a path', () => {
    const output = [
      '[FILE_ACTION: a/../../etc/passwd]',
      'OPERATION: CREATE',
      'DESCRIPTION: traversal',
      'CONTENT:',
      'data',
      '[/FILE_ACTION]',
    ].join('\n');

    assert.equal(parseActions(output).length, 0);
  });
});

describe('SWDEngine: rollback removes empty directories it created', () => {
  const testDir = join(process.cwd(), 'test', '.tmp-regression-dirs');

  it('cleans up a newly-created nested directory on rollback', async () => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });

    const newDir = join(testDir, 'brand', 'new', 'nested');
    const goodFile = join(newDir, 'created.txt');
    // A second action forced to fail (MUTATE that produces a no-op) so the
    // whole batch rolls back, including the successful CREATE above.
    const existingFile = join(testDir, 'existing.txt');
    writeFileSync(existingFile, 'unchanged', 'utf-8');

    const engine = new SWDEngine({ enableRollback: true });
    const actions: FileAction[] = [
      { path: goodFile, operation: 'CREATE', intent: 'MUTATE', content: 'hi', description: 'create nested' },
      { path: existingFile, operation: 'MODIFY', intent: 'MUTATE', content: 'unchanged', description: 'forced noop' },
    ];

    const result = await engine.run(actions);
    assert.equal(result.success, false);
    assert.equal(result.rolledBack, true);
    // The created file is gone...
    assert.equal(existsSync(goodFile), false, 'created file not rolled back');
    // ...and so are the directories that only existed because of it.
    assert.equal(existsSync(newDir), false, 'empty created dir left behind');
    assert.equal(existsSync(join(testDir, 'brand')), false, 'empty created parent left behind');
    // The pre-existing file and dir survive untouched.
    assert.equal(readFileSync(existingFile, 'utf-8'), 'unchanged');
    assert.equal(existsSync(testDir), true);

    rmSync(testDir, { recursive: true, force: true });
  });
});

describe('SWDEngine: mid-batch execution failure is fully reported', () => {
  const testDir = join(process.cwd(), 'test', '.tmp-regression-report');

  it('records an entry for an applied action when a later action throws', async () => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });

    const created = join(testDir, 'first.txt');
    const collision = join(testDir, 'second.txt');
    // Pre-create the collision target so the second CREATE throws
    // ("file already exists"), aborting the batch after the first applied.
    writeFileSync(collision, 'already here', 'utf-8');

    const engine = new SWDEngine({ enableRollback: true });
    const actions: FileAction[] = [
      { path: created, operation: 'CREATE', intent: 'MUTATE', content: 'one', description: 'applies first' },
      { path: collision, operation: 'CREATE', intent: 'MUTATE', content: 'two', description: 'throws' },
    ];

    const result = await engine.run(actions);
    assert.equal(result.success, false);
    // Both the applied-then-rolled-back action and the failing action appear.
    const paths = result.results.map(r => r.action.path);
    assert.ok(paths.includes(created), 'applied action missing from results');
    assert.ok(paths.includes(collision), 'failing action missing from results');
    // The applied file was rolled back (it no longer exists).
    assert.equal(existsSync(created), false);
    // The pre-existing collision file is untouched.
    assert.equal(readFileSync(collision, 'utf-8'), 'already here');

    rmSync(testDir, { recursive: true, force: true });
  });
});
