import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspaceStore } from '../../server/workspace-store';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })));
describe('任务持久化', () => {
  it('重开存储仍保留不同任务，拒绝过时写入与非法命令', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zhiyin-workspaces-')); dirs.push(dir);
    const file = join(dir, 'state.json'); const store = createWorkspaceStore(file);
    store.change({ type: 'create', id: 'dinner', kind: 'aa', title: '晚餐', revision: 0, requestId: '1' });
    const reloaded = createWorkspaceStore(file);
    expect(reloaded.get().items[0].title).toBe('晚餐');
    expect(() => reloaded.change({ type: 'rename', id: 'dinner', title: '旅游', revision: 0, requestId: '2' })).toThrow('已变化');
    expect(store.get().items[0].title).toBe('晚餐');
  });
});
