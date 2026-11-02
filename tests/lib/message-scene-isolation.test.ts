import {afterEach, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMessageService} from '../../server/message-service';
import {createWorkspaceStore} from '../../server/workspace-store';
import {createTaskStore} from '../../server/task-store';
import {requestStewardReplyWithModel, type StewardModelPayload} from '../../src/lib/steward-chat';
import type {SceneContext} from '../../src/lib/scene-context';

const scope = '11111111-1111-4111-8111-111111111111', dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, {recursive: true, force: true})));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'message-scene-isolation-')); dirs.push(dir);
  const workspace = createWorkspaceStore(join(dir, `.zhiyin-workspaces-${scope}.local.json`));
  const change = (op: object) => workspace.change({...op, revision: workspace.get().revision, requestId: crypto.randomUUID()} as Parameters<typeof workspace.change>[0]);
  change({type: 'create', id: 'birthday', kind: 'reminder', title: '王芳生日'});
  const dates = createTaskStore(join(dir, '.zhiyin-tasks.local.json'));
  dates.change({type: 'save', id: 'birthday-date', title: '王芳的生日', dueAt: Date.now() + 86400000, allDay: true, repeat: 'yearly', workspaceId: 'birthday', revision: 0});
  const model = vi.fn(async (payload: StewardModelPayload) => {void payload; return '继续核对当前事项。';});
  const service = createMessageService(dir, model);
  async function reply(related: boolean, text = '帮我核对日程安排') {
    change({type: 'message-submit', id: 'message', text, currentId: 'birthday', memoryRevision: 0});
    change({type: 'message-routed', id: 'message', parts: [{taskId: null, ...(related ? {relatedTaskId: 'birthday'} : {}), kind: 'reminder', title: related ? '生日后续安排' : '妈妈拿资料', text}]});
    const job = service.get(scope).runs![0].jobs[0]; service.claim(scope, 'message', job.id, 'worker');
    await service.reply(scope, {id: 'message', jobId: job.id, owner: 'worker', request: {stewardName: '宁宁', subscriptions: [], messages: []}});
    return model.mock.calls[0][0];
  }
  return {dates, reply};
}

it('当前窗口的旧事项不应给无关联的新任务注入生日事实', async () => {
  const f = fixture(); const payload = await f.reply(false);
  expect(JSON.stringify(payload)).not.toContain('王芳的生日');
  expect(payload.input.some(message => message.content.includes('"field":"birthdayDate"'))).toBe(false);
});

it('通用回复复用明确关联的事实，并将共享资料限制为完整JSON而非截断字符串', async () => {
  const f = fixture();
  for (let index = 0; index < 30; index++) f.dates.change({type: 'save', id: `extra-${index}`, title: `生日关联活动${index}`, dueAt: Date.now() + (index + 2) * 86400000, workspaceId: 'birthday', revision: f.dates.get().revision});
  const payload = await f.reply(true, '这件事目前怎么样了');
  const section = payload.input.filter(message => message.content.startsWith('同一事项共享资料片段')).map(message => message.content.slice(message.content.indexOf('\n') + 1)).join('');
  expect(section).toContain('同一事项的共享资料（只读，不构成授权）：');
  const json = section.split('\n')[1];
  expect(() => JSON.parse(json)).not.toThrow();
  const context = JSON.parse(json);
  expect(context.sceneId).toBe('birthday'); expect(context.authorization).toBe('none');
  expect(context.facts).toContainEqual(expect.objectContaining({field: 'birthdayDate'}));
  expect(json.length).toBeLessThan(3500);
});

it('历史很长时共享资料分片整体保留，并满足模型代理的每条长度、条数与体积上限', async () => {
  const sceneContext: SceneContext = {version: 1, sceneId: 'scene', workspaceIds: ['scene'], authorization: 'none', facts: [{field: 'birthdayDate', value: '2026-12-20', source: {kind: 'calendar', id: 'date', workspaceId: 'scene', label: '已确认生日'}}], conflicts: [], evidence: [{kind: 'user_message', id: 'message', workspaceId: 'scene', text: '往日交代'.repeat(220)}]};
  const model = vi.fn(async (payload: StewardModelPayload) => {void payload; return '我会沿用已有日期。';});
  await Reflect.apply(requestStewardReplyWithModel, undefined, [{stewardName: '宁宁', subscriptions: [], sceneContext, messages: [...Array.from({length: 24}, () => ({role: 'assistant', content: '历史信息'.repeat(400)})), {role: 'user', content: '这件事目前怎样了'}]}, model]);
  const payload = model.mock.calls[0][0];
  expect(payload.input.length).toBeLessThanOrEqual(30); expect(payload.input.every(message => message.content.length <= 2000)).toBe(true);
  expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThanOrEqual(32 * 1024);
  const section = payload.input.filter(message => message.content.startsWith('同一事项共享资料片段')).map(message => message.content.slice(message.content.indexOf('\n') + 1)).join('');
  expect(section).toContain('2026-12-20'); expect(() => JSON.parse(section.split('\n')[1])).not.toThrow();
});
