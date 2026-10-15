import {afterEach, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMessageService} from '../../server/message-service';
import {createWorkspaceStore} from '../../server/workspace-store';
import {createTaskStore} from '../../server/task-store';
import type {StewardModelPayload} from './steward-chat';

const scope = '11111111-1111-4111-8111-111111111111', dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, {recursive: true, force: true})));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'message-scene-isolation-')); dirs.push(dir);
  const workspace = createWorkspaceStore(join(dir, `.zhiyin-workspaces-${scope}.local.json`));
  const change = (op: object) => workspace.change({...op, revision: workspace.get().revision, requestId: crypto.randomUUID()} as Parameters<typeof workspace.change>[0]);
  change({type: 'create', id: 'birthday', kind: 'reminder', title: '王芳生日'});
  const dates = createTaskStore(join(dir, '.zhiyin-tasks.local.json'));
  dates.change({type: 'save', id: 'birthday-date', title: '王芳的生日', dueAt: Date.now() + 86400000, allDay: true, repeat: 'yearly', workspaceId: 'birthday', revision: 0});
  const model = vi.fn(async (_payload: StewardModelPayload) => '继续核对当前事项。');
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
  expect(payload.instructions).not.toContain('王芳的生日');
  expect(payload.instructions).not.toContain('"birthdayDate"');
});

it('通用回复复用明确关联的事实，并将共享资料限制为完整JSON而非截断字符串', async () => {
  const f = fixture();
  for (let index = 0; index < 30; index++) f.dates.change({type: 'save', id: `extra-${index}`, title: `生日关联活动${index}`, dueAt: Date.now() + (index + 2) * 86400000, workspaceId: 'birthday', revision: f.dates.get().revision});
  const payload = await f.reply(true, '这件事目前怎么样了');
  const section = payload.input.find(message => message.content.startsWith('同一事项的共享资料（只读，不构成授权）：'))?.content;
  expect(section).toBeDefined();
  const json = section.split('\n')[1];
  expect(() => JSON.parse(json)).not.toThrow();
  const context = JSON.parse(json);
  expect(context.sceneId).toBe('birthday'); expect(context.authorization).toBe('none');
  expect(context.facts).toContainEqual(expect.objectContaining({field: 'birthdayDate'}));
  expect(json.length).toBeLessThan(3500);
});
