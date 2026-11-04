import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestRows, progressColumns, taskFinished, stageId } from '../src/task-progress.ts';
const task = (id, props = {}) => ({ id, title: id, status: 'todo', requests: [{ id: 'request-a', title: '요청 A' }], stageName: '개발', completionMode: 'code', ...props });

test('assignee/search matches preserve the other stages of the same request', () => {
  const tasks = [task('plan', { stageName: '기획', completionMode: 'document' }), task('code'), task('other', { requests: [{ id: 'request-b', title: '요청 B' }] })];
  const rows = requestRows(tasks, new Set(['code']));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].tasks.map(t => t.id), ['plan', 'code']);
});
test('shared tasks appear under each request and unlinked tasks remain accessible', () => {
  const tasks = [task('shared', { requests: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }), task('internal', { requests: [] })];
  const rows = requestRows(tasks, new Set(tasks.map(t => t.id)));
  assert.equal(rows.length, 3);
  assert.equal(rows[2].requestId, undefined);
  assert.equal(rows[2].tasks[0].id, 'internal');
});
test('columns retain unused configured stages and historical categories without merging distinct completion modes', () => {
  const configured = [{ name: '기획', completionMode: 'document' }, { name: '개발', completionMode: 'code' }];
  const columns = progressColumns([task('a'), task('b', { stageName: '옛 단계' }), task('c', { completionMode: 'document' })], configured);
  assert.equal(columns.length, 4);
  assert.equal(columns[0].name, '기획');
  assert.equal(new Set(columns.map(stageId)).size, 4);
});
test('code and deployment work is not complete until released; document approval completes document work', () => {
  assert.equal(taskFinished(task('a', { status: 'deploy_pending' })), false);
  assert.equal(taskFinished(task('a', { status: 'done' })), false);
  assert.equal(taskFinished(task('a', { status: 'done', completionMode: 'document' })), true);
  assert.equal(taskFinished(task('a', { status: 'released' })), true);
});
