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
export function createExpenseStore(file: string) {
  const get = (): ExpenseState => {
    if (!existsSync(file)) return emptyExpenseState();
    const data = JSON.parse(readFileSync(file, "utf8")) as ExpenseState;
    if (!validExpenseState(data)) throw new Error("账本文件损坏，原文件已保留");
    return data;
  };
  return {
    get,
    change(command: ExpenseCommand) {
      let lock: number;
      try {
        lock = openSync(file + ".lock", "wx", 0o600);
      } catch {
        throw new Error("记录正在保存，请重试");
      }
      try {
        const next = changeExpenses(get(), command);
        writeFileSync(file + ".tmp", JSON.stringify(next), { mode: 0o600 });
        renameSync(file + ".tmp", file);
        return next;
      } finally {
        closeSync(lock);
        unlinkSync(file + ".lock");
      }
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
