import { existsSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { emptyWorkspaces, validWorkspaces, changeWorkspaces, type WorkspaceCommand } from '../src/lib/workspaces';
export function createWorkspaceStore(file: string) {
  const get = () => {
    if (!existsSync(file)) return emptyWorkspaces();
    const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!validWorkspaces(data)) throw new Error('任务记录损坏，原文件已保留');
    return data;
  };
  return { get, change(command: WorkspaceCommand) {
    let lock: number;
    try { lock = openSync(file + '.lock', 'wx', 0o600); } catch { throw new Error('任务正在保存，请重试'); }
    try {
      const next = changeWorkspaces(get(), command);
      writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
      renameSync(file + '.tmp', file); return next;
    } finally { closeSync(lock); unlinkSync(file + '.lock'); }
  } };
}
export function workspaceMiddleware(directory: string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (code: number, data: unknown) => {
      res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(data));
    };
    try {
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return send(403, { error: '仅允许同源访问' });
      const scope = req.headers['x-zhiyin-expense-scope'];
      if (typeof scope !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(scope)) return send(400, { error: '任务空间标识无效' });
      const store = createWorkspaceStore(join(directory, `.zhiyin-workspaces-${scope}.local.json`));
      if (req.method === 'GET') return send(200, store.get());
      if (req.method !== 'POST') return send(405, { error: '不支持的方法' });
      if (req.headers['x-zhiyin-workspaces'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) return send(403, { error: '请求格式无效' });
      let body = '';
      for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 65536) return send(413, { error: '任务内容过长' }); }
      return send(200, store.change(JSON.parse(body)));
    } catch (e) { const error = e instanceof Error ? e.message : '任务服务不可用'; send(error.includes('已变化') ? 409 : 400, { error }); }
  };
}
