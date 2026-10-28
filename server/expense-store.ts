import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  emptyExpenseState,
  changeExpenses,
  validExpenseState,
  type ExpenseState,
  type ExpenseCommand,
} from "../src/lib/expense-notebook";
import {importSceneExpenses,syncSceneExpenses,type SceneExpenseSource} from '../src/lib/scene-expenses';
export function createExpenseStore(file: string) {
  const get = (): ExpenseState => {
    if (!existsSync(file)) return emptyExpenseState();
    const data = JSON.parse(readFileSync(file, "utf8")) as ExpenseState;
    if (!validExpenseState(data)) throw new Error("账本文件损坏，原文件已保留");
    return data;
  };
  function mutate(update:(state:ExpenseState)=>ExpenseState) {
      let lock: number;
      try {
        lock = openSync(file + ".lock", "wx", 0o600);
      } catch {
        throw new Error("记录正在保存，请重试");
      }
      try {
        const state=get(),next = update(state);
        if(next===state)return state;
        if(!validExpenseState(next))throw new Error('账本更新无法核对，原记录已保留');
        writeFileSync(file + ".tmp", JSON.stringify(next), { mode: 0o600 });
        renameSync(file + ".tmp", file);
        return next;
      } finally {
        closeSync(lock);
        unlinkSync(file + ".lock");
      }
  }
  return {
    get,
    change(command:ExpenseCommand){return mutate(state=>changeExpenses(state,command));},
    syncSources(sources:SceneExpenseSource[]){return mutate(state=>syncSceneExpenses(state,sources));},
    importSources(bookId:string,sources:SceneExpenseSource[],input:{revision:number;requestId:string;references:unknown}){
      return mutate(state=>{
        if(typeof input.requestId!=='string'||!/^[\w-]{1,100}$/.test(input.requestId))throw new Error('请求标识无效');
        const body=JSON.stringify({type:'import-verified-sources',bookId,references:input.references,revision:input.revision}),seen=state.applied.find(a=>a.id===input.requestId);
        if(seen){if(seen.body!==body)throw new Error('同一请求标识不能用于不同操作');return syncSceneExpenses(state,sources);}
        if(input.revision!==state.revision)throw new Error('记录已变化，请刷新后重试');
        const next=structuredClone(importSceneExpenses(state,bookId,sources));
        next.applied=[...next.applied,{id:input.requestId,body}].slice(-500);
        if(next.revision===state.revision)next.revision++;
        return next;
      });
    },
  };
}
export function expenseMiddleware(directory: string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (code: number, data: unknown) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(data));
    };
    try {
      if (
        req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host)
      )
        return send(403, { error: "仅允许同源访问" });
      const scope = req.headers["x-zhiyin-expense-scope"];
      if (
        typeof scope !== "string" ||
        !/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(
          scope,
        )
      )
        return send(400, { error: "缺少有效的沙箱账本标识" });
      const store = createExpenseStore(
        join(directory, `.zhiyin-expenses-${scope}.local.json`),
      );
      if (req.method === "GET") return send(200, store.get());
      if (req.method !== "POST") return send(405, { error: "不支持的方法" });
      if (
        req.headers["x-zhiyin-expenses"] !== "1" ||
        !req.headers["content-type"]?.startsWith("application/json")
      )
        return send(403, { error: "请求格式无效" });
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 65536)
          return send(413, { error: "记录过大" });
      }
      return send(200, store.change(JSON.parse(body)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "账本不可用";
      send(message.includes("已变化") ? 409 : 400, { error: message });
    }
  };
}
