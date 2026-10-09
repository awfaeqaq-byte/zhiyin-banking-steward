import { closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMemoryStore } from './memory-store';
import { createWorkspaceStore } from './workspace-store';
import { createExpenseStore } from './expense-store';
import { emptyMemory } from '../src/lib/steward-memory';
import { emptyWorkspaces } from '../src/lib/workspaces';
import { emptyExpenseState } from '../src/lib/expense-notebook';

/** Local sandbox maintenance, not a cancellation of confirmed financial operations. */
export function resetStewardState(directory: string, scope: string) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(scope)) throw new Error('任务空间标识无效');
  const files = [join(directory, '.zhiyin-memory.local.json'), join(directory, `.zhiyin-workspaces-${scope}.local.json`), join(directory, `.zhiyin-expenses-${scope}.local.json`)];
  const locks: { file: string; fd: number }[] = [];
  const originals = new Map<string, string | null>();
  const written: string[] = [];
  const backupId = randomUUID();
  try {
    for (const file of files) {
      let fd: number;
      try { fd = openSync(file + '.lock', 'wx', 0o600); } catch { throw new Error('记录正在保存，请稍后重试'); }
      locks.push({ file, fd });
    }
    // Validate all records before touching any of them. Revision bumps reject late writes.
    const memory = createMemoryStore(files[0]).get();
    const workspaces = createWorkspaceStore(files[1]).get();
    const expenses = createExpenseStore(files[2]).get();
    const nextMemory = { ...emptyMemory(), revision: memory.revision + 1, enabled: memory.enabled,
      ...(memory.profile ? { profile: { enabled: memory.profile.enabled, items: [], ignored: [] } } : {}) };
    const next = [nextMemory, { ...emptyWorkspaces(), revision: workspaces.revision + 1 }, { ...emptyExpenseState(), revision: expenses.revision + 1 }];
    for (const file of files) {
      const original = existsSync(file) ? readFileSync(file, 'utf8') : null;
      originals.set(file, original);
      if (original !== null) writeFileSync(`${file}.reset-${backupId}.bak`, original, { mode: 0o600, flag: 'wx' });
    }
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      writeFileSync(file + '.tmp', JSON.stringify(next[index]), { mode: 0o600 });
      renameSync(file + '.tmp', file);
      written.push(file);
    }
    return { reset: true, backupId, memoryRevision: nextMemory.revision };
  } catch (error) {
    for (const file of written) {
      const original = originals.get(file);
      if (original === null) unlinkSync(file);
      else if (original !== undefined) { writeFileSync(file + '.tmp', original, { mode: 0o600 }); renameSync(file + '.tmp', file); }
    }
    throw error;
  } finally {
    for (const { file, fd } of locks) {
      if (existsSync(file + '.tmp')) unlinkSync(file + '.tmp');
      closeSync(fd); unlinkSync(file + '.lock');
    }
  }
}

export function stewardResetMiddleware(directory: string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (code: number, data: unknown) => {
      res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(data));
    };
    try {
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return send(403, { error: '仅允许同源访问' });
      if (req.method !== 'POST') return send(405, { error: '不支持的方法' });
      if (req.headers['x-zhiyin-reset'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) return send(403, { error: '请求格式无效' });
      const scope = req.headers['x-zhiyin-expense-scope'];
      if (typeof scope !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(scope)) return send(400, { error: '任务空间标识无效' });
      let body = '';
      for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 1024) return send(413, { error: '请求过大' }); }
      if (JSON.parse(body)?.confirm !== 'reset-steward') return send(400, { error: '请先确认重置范围' });
      return send(200, resetStewardState(directory, scope));
    } catch (error) {
      const message = error instanceof Error ? error.message : '重置未完成，请重试';
      return send(message.includes('正在保存') ? 409 : 400, { error: message });
    }
  };
}
