import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { stewardResetMiddleware } from '../../server/steward-reset';
import { emptyMemory } from './steward-memory';
import { emptyWorkspaces, changeWorkspaces } from './workspaces';
import { emptyExpenseState } from './expense-notebook';

const scope = '11111111-1111-4111-8111-111111111111';
const dirs: string[] = [], servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
});
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'zhiyin-reset-test-')); dirs.push(dir);
  const memory = { ...emptyMemory(), enabled: true, revision: 4, items: [{ id: 'pref', text: '喜欢高铁', category: 'preference', quote: '', origin: 'manual', updatedAt: 1, expiresAt: 2 }] };
  const tasks = changeWorkspaces(emptyWorkspaces(), { type: 'create', id: 'bill', title: '本月账单', kind: 'bills', revision: 0, requestId: 'create' });
  writeFileSync(join(dir, '.zhiyin-memory.local.json'), JSON.stringify(memory));
  writeFileSync(join(dir, `.zhiyin-workspaces-${scope}.local.json`), JSON.stringify(tasks));
  writeFileSync(join(dir, `.zhiyin-expenses-${scope}.local.json`), JSON.stringify({ ...emptyExpenseState(), revision: 3 }));
  for (const name of ['.zhiyin-bank.local.json', '.zhiyin-tasks.local.json', '.zhiyin-workspaces-other.local.json']) writeFileSync(join(dir, name), 'preserve');
  const server = createServer(stewardResetMiddleware(dir)); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('address');
  const url = `http://127.0.0.1:${address.port}`;
  const reset = (headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zhiyin-Reset': '1', 'X-Zhiyin-Expense-Scope': scope, ...headers }, body: JSON.stringify({ confirm: 'reset-steward' }) });
  return { dir, reset, url, memory, tasks };
}
describe('宁宁重置后端', () => {
  it('清空记忆与当前浏览器任务，递增版本并备份，不动资金或已确认日程', async () => {
    const { dir, reset, memory, tasks } = await fixture();
    const response = await reset(), result = await response.json();
    expect(response.status).toBe(200);
    expect(result.reset).toBe(true);
    const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
    expect(read('.zhiyin-memory.local.json')).toMatchObject({ revision: 5, enabled: true, items: [] });
    expect(read(`.zhiyin-workspaces-${scope}.local.json`)).toMatchObject({ revision: 2, items: [] });
    expect(read(`.zhiyin-expenses-${scope}.local.json`)).toMatchObject({ revision: 4, books: [] });
    const backups = readdirSync(dir).filter(name => name.includes(result.backupId));
    expect(backups).toHaveLength(3);
    expect(read(backups.find(name => name.includes('memory'))!)).toEqual(memory);
    expect(read(backups.find(name => name.includes('workspaces'))!)).toEqual(tasks);
    for (const name of ['.zhiyin-bank.local.json', '.zhiyin-tasks.local.json', '.zhiyin-workspaces-other.local.json']) expect(readFileSync(join(dir, name), 'utf8')).toBe('preserve');
  });
  it('拒绝跨站、无保护头、无确认和非法范围', async () => {
    const { reset, url } = await fixture();
    expect((await reset({ Origin: 'https://example.com' })).status).toBe(403);
    expect((await reset({ 'X-Zhiyin-Reset': '' })).status).toBe(403);
    expect((await reset({ 'X-Zhiyin-Expense-Scope': '../../bank' })).status).toBe(400);
    expect((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zhiyin-Reset': '1', 'X-Zhiyin-Expense-Scope': scope }, body: '{}' })).status).toBe(400);
    expect((await fetch(url)).status).toBe(405);
  });
  it('数据损坏或保存锁冲突时不修改其他记录', async () => {
    const { dir, reset, memory } = await fixture();
    const file = join(dir, `.zhiyin-workspaces-${scope}.local.json`);
    writeFileSync(file, 'broken');
    expect((await reset()).status).toBe(400);
    expect(JSON.parse(readFileSync(join(dir, '.zhiyin-memory.local.json'), 'utf8'))).toEqual(memory);
    expect(readFileSync(file, 'utf8')).toBe('broken');
    writeFileSync(file + '.lock', 'busy');
    expect((await reset()).status).toBe(409);
    expect(readFileSync(file + '.lock', 'utf8')).toBe('busy');
  });
});
