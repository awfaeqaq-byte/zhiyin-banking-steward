import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {Readable} from 'node:stream';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {vi} from 'vitest';
import {bankMiddleware, createBankStore} from '../../server/bank-store';
import {createWealthStore} from '../../server/wealth-store';
import {emptyMemory, updateMemory} from '../lib/steward-memory';
import {updateTasks, type TaskState} from '../lib/task-calendar';
import {emptyWorkspaces, changeWorkspaces} from '../lib/workspaces';

/** Real sandbox ledgers/reducers; external providers are explicitly mocked per test. */
export function elderAppServer() {
  const directory = mkdtempSync(join(tmpdir(), 'elder-app-'));
  const bank = createBankStore(join(directory, 'bank.json'));
  bank.configure({revision: 0, controls: {night: false, overseas: false, contactless: true}});
  const wealth = createWealthStore(bank);
  const banking = bankMiddleware(bank);
  let memory = emptyMemory();
  let tasks: TaskState = {revision: 0, tasks: []};
  let workspaces = emptyWorkspaces();
  const commands: Array<{path: string; body: Record<string, unknown>}> = [];
  const unexpected: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url).split('?')[0];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (body) commands.push({path, body});
    try {
      if (path === '/api/zhiyin/bank') {
        const req = Readable.from(init?.body ? [String(init.body)] : []) as IncomingMessage;
        req.url=String(url);
        req.method = init?.method ?? 'GET';
        req.headers = Object.fromEntries(new Headers(init?.headers).entries());
        let result = new Response(null, {status: 500});
        const res = {statusCode: 200, setHeader() {}, end(value: string) {
          result = new Response(value, {status: this.statusCode});
        }};
        await banking(req, res as unknown as ServerResponse);
        return result;
      }
      if (path === '/api/zhiyin/memory') {
        if (body) memory = updateMemory(memory, body);
        return Response.json(memory);
      }
      if (path === '/api/zhiyin/tasks') {
        if (body) tasks = updateTasks(tasks, body);
        return Response.json(tasks);
      }
      if (path === '/api/zhiyin/messages' || path === '/api/zhiyin/workspaces') {
        if (body) workspaces = changeWorkspaces(workspaces, body);
        return Response.json({...workspaces, conversation: workspaces.conversation ?? [], runs: workspaces.runs ?? []});
      }
      // These manual-entry scenarios have no linked chat workspaces or external orders.
      if (path === '/api/zhiyin/scenes' && !workspaces.items.length &&
          (!body || Array.isArray(body.orders) && body.orders.length === 0 && Array.isArray(body.errors) && body.errors.length === 0)) {
        return Response.json({...workspaces, scenes:[]});
      }
      if(path==='/api/zhiyin/steward-reply')return Response.json({output_text:JSON.stringify({text:'可以结合这个投入金额和持有期，查看适配的账户产品；尚未申购。',candidates:[]})});
      if (path === '/api/zhiyin/wealth') {
        const data = !body ? wealth.get()
          : body.type === 'assess' ? wealth.assess(body.answers)
          : body.type === 'prepare' ? wealth.prepare(body)
          : body.type === 'confirm' ? wealth.confirm(body.draftId)
          : body.type === 'prepare-redemption' ? wealth.prepareRedemption(body.holdingId)
          : body.type === 'confirm-redemption' ? wealth.confirmRedemption(body.draftId)
          : (() => {throw new Error(`Unexpected wealth command: ${body.type}`);})();
        return Response.json(data);
      }
      if (path === '/api/zhiyin/market-context') return Response.json({provider:'akshare',status:'ready',fetchedAt:Date.now(),stale:false,message:'测试市场快照',indicators:[],capabilities:[]});
      if (path === '/api/zhiyin/fund-samples') return Response.json({provider:'issuer_akshare',message:'测试无基金样本',records:[]});
      if (path === '/api/zhiyin/automations' && !body) return Response.json({version:1,engine:'mastra',tasks:[],runs:[]});
      unexpected.push(`${init?.method ?? 'GET'} ${path}`);
      return Response.json({error:`Unconfigured test endpoint: ${path}`}, {status:501});
    } catch (error) {
      return Response.json({error:(error as Error).message}, {status:400});
    }
  });
  return {
    bank, wealth, commands, unexpected,
    get memory() {return memory;}, get tasks() {return tasks;},
    dispose() {
      // Delete only the unique temporary fixture directory created by this invocation.
      const target = resolve(directory), parent = resolve(tmpdir()) + sep;
      if (!target.startsWith(parent) || !target.slice(parent.length).startsWith('elder-app-')) throw new Error('Unsafe fixture cleanup');
      rmSync(target, {recursive:true, force:true});
    },
  };
}
