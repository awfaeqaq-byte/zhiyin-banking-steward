import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkspaceStore,
  workspaceMiddleware,
} from "../../server/workspace-store";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
const dirs: string[] = [];
afterEach(() =>
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })),
);
describe("任务持久化", () => {
  it("同源隔离、参数校验、限长和冲突不会修改记录", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zhiyin-workspaces-"));
    dirs.push(dir);
    const server = createServer(workspaceMiddleware(dir));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const headers = {
        "Content-Type": "application/json",
        "X-Zhiyin-Workspaces": "1",
        "X-Zhiyin-Expense-Scope": crypto.randomUUID(),
      };
      expect((await fetch(url)).status).toBe(400);
      expect(
        (
          await fetch(url, {
            headers: { ...headers, Origin: "https://foreign.example" },
          })
        ).status,
      ).toBe(403);
      expect((await fetch(url, { headers, method: "DELETE" })).status).toBe(
        405,
      );
      expect(
        (
          await fetch(url, {
            headers: { ...headers, "X-Zhiyin-Workspaces": "0" },
            method: "POST",
            body: "{}",
          })
        ).status,
      ).toBe(403);
      expect(
        (await fetch(url, { headers, method: "POST", body: "x".repeat(70000) }))
          .status,
      ).toBe(413);
      const op = {
        type: "create",
        id: "a",
        title: "我的任务",
        kind: "general",
        revision: 0,
        requestId: "create",
      };
      expect(
        (
          await fetch(url, {
            headers,
            method: "POST",
            body: JSON.stringify(op),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fetch(url, {
            headers,
            method: "POST",
            body: JSON.stringify({ ...op, id: "b", requestId: "another" }),
          })
        ).status,
      ).toBe(409);
      expect((await (await fetch(url, { headers })).json()).items).toHaveLength(
        1,
      );
      expect(
        (
          await (
            await fetch(url, {
              headers: {
                ...headers,
                "X-Zhiyin-Expense-Scope": crypto.randomUUID(),
              },
            })
          ).json()
        ).items,
      ).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("重开存储仍保留不同任务，拒绝过时写入与非法命令", () => {
    const dir = mkdtempSync(join(tmpdir(), "zhiyin-workspaces-"));
    dirs.push(dir);
    const file = join(dir, "state.json");
    const store = createWorkspaceStore(file);
    store.change({
      type: "create",
      id: "dinner",
      kind: "aa",
      title: "晚餐",
      revision: 0,
      requestId: "1",
    });
    const reloaded = createWorkspaceStore(file);
    expect(reloaded.get().items[0].title).toBe("晚餐");
    expect(() =>
      reloaded.change({
        type: "rename",
        id: "dinner",
        title: "旅游",
        revision: 0,
        requestId: "2",
      }),
    ).toThrow("已变化");
    expect(store.get().items[0].title).toBe("晚餐");
  });
});
