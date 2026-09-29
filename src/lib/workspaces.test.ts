import { describe, it, expect } from "vitest";
import {
  changeWorkspaces,
  emptyWorkspaces,
  workspaceContext,
  validateRoutes,
  validWorkspaces,
  type WorkspaceCommand,
} from "./workspaces";
describe("独立任务工作区", () => {
  it('合法的最长请求标识不会写出无法再次读取的记录',()=>{
    const s=changeWorkspaces(emptyWorkspaces(),{type:'create',id:'a',title:'事项',kind:'general',revision:0,requestId:'create'});
    const next=changeWorkspaces(s,{type:'turn',id:'a',user:'你好',assistant:'你好',memoryRevision:0,revision:1,requestId:'a'.repeat(80)});
    expect(validWorkspaces(next)).toBe(true);
  });
  it("同类任务独立保存，消息幂等，不能靠完成任务来完成转账", () => {
    let s = emptyWorkspaces();
    const apply = (op: object) =>
      (s = changeWorkspaces(s, {
        ...op,
        revision: s.revision,
        requestId: crypto.randomUUID(),
      } as WorkspaceCommand));
    apply({ type: "create", id: "dinner", kind: "aa", title: "今晚聚餐" });
    apply({ type: "create", id: "trip", kind: "aa", title: "周末旅行" });
    const command = {
      type: "turn" as const,
      id: "dinner",
      revision: s.revision,
      requestId: "one",
      user: "饮料18",
      assistant: "已记录",
      memoryRevision: 0,
    };
    s = changeWorkspaces(s, command);
    expect(changeWorkspaces(s, command)).toEqual(s);
    expect(s.items.find((w) => w.id === "trip")!.messages).toHaveLength(0);
    expect(workspaceContext(s.items[0], 0)).toContain("饮料18");
    expect(workspaceContext(s.items[0], 1)).not.toContain("饮料18");
    apply({ type: "status", id: "dinner", status: "archived" });
    expect(s.items[0].status).toBe("archived");
    expect(() =>
      apply({
        type: "turn",
        id: "missing",
        user: "hi",
        assistant: "hi",
        memoryRevision: 0,
      }),
    ).toThrow();
  });
  it("待处理交代持久保存，完成对应轮次后移除，不能串清另一个请求", () => {
    let s = changeWorkspaces(emptyWorkspaces(), {
      type: "create",
      id: "a",
      title: "AA",
      kind: "aa",
      revision: 0,
      requestId: "create",
    });
    s = changeWorkspaces(s, {
      type: "enqueue",
      id: "a",
      token: "pending",
      text: "饮料18",
      revision: s.revision,
      requestId: "q",
    });
    expect(s.items[0].pending).toEqual([{ token: "pending", text: "饮料18" }]);
    s = changeWorkspaces(s, {
      type: "turn",
      id: "a",
      token: "pending",
      user: "饮料18",
      assistant: "已记录",
      memoryRevision: 0,
      revision: s.revision,
      requestId: "finish",
    });
    expect(s.items[0].pending).toEqual([]);
  });
  it("路由只能引用已知任务、原文片段；混合请求必须覆盖全部原文", () => {
    const s = changeWorkspaces(emptyWorkspaces(), {
      type: "create",
      id: "dinner",
      kind: "aa",
      title: "今晚聚餐",
      revision: 0,
      requestId: "create",
    });
    const prompt = "明天给妈妈转500，刚才饮料改成16";
    const parts = [
      {
        taskId: null,
        kind: "transfer",
        title: "给妈妈转账",
        text: "明天给妈妈转500",
      },
      {
        taskId: "dinner",
        kind: "aa",
        title: "今晚聚餐",
        text: "刚才饮料改成16",
      },
    ];
    expect(validateRoutes({ parts }, prompt, s.items).parts).toHaveLength(2);
    expect(() =>
      validateRoutes({ parts: parts.slice(0, 1) }, prompt, s.items),
    ).toThrow();
    expect(() =>
      validateRoutes(
        { parts: [{ ...parts[0], text: "转1000" }] },
        prompt,
        s.items,
      ),
    ).toThrow();
    expect(() =>
      validateRoutes(
        { parts: [{ ...parts[0], taskId: "fake", text: prompt }] },
        prompt,
        s.items,
      ),
    ).toThrow();
  });
  it("拒绝非法版本与归档写入，压缩历史只保留原话，记忆版本变化后不回灌旧条件", () => {
    let s = changeWorkspaces(emptyWorkspaces(), {
      type: "create",
      id: "a",
      title: "AA",
      kind: "aa",
      revision: 0,
      requestId: "create",
    });
    for (let i = 0; i < 25; i++)
      s = changeWorkspaces(s, {
        type: "turn",
        id: "a",
        user: `饮料${i}`,
        assistant: "模型说已付款但这不是凭据",
        memoryRevision: 0,
        requestId: `t${i}`,
        revision: s.revision,
      });
    expect(s.items[0].messages).toHaveLength(40);
    expect(s.items[0].summary).toContain("饮料0");
    expect(s.items[0].summary).not.toContain("已付款");
    s = changeWorkspaces(s, {
      type: "turn",
      id: "a",
      user: "新偏好",
      assistant: "收到",
      memoryRevision: 1,
      requestId: "new",
      revision: s.revision,
    });
    expect(workspaceContext(s.items[0], 1)).not.toContain("饮料");
    expect(() =>
      changeWorkspaces(s, {
        type: "rename",
        id: "a",
        title: "",
        revision: s.revision,
        requestId: "invalid",
      }),
    ).toThrow();
    s = changeWorkspaces(s, {
      type: "link",
      id: "a",
      expenseBookId: "book",
      revision: s.revision,
      requestId: "link",
    });
    expect(s.items[0].expenseBookId).toBe("book");
    s = changeWorkspaces(s, {
      type: "rename",
      id: "a",
      title: "旅游",
      revision: s.revision,
      requestId: "rename",
    });
    expect(s.items[0].title).toBe("旅游");
    s = changeWorkspaces(s, {
      type: "status",
      id: "a",
      status: "archived",
      revision: s.revision,
      requestId: "archive",
    });
    expect(() =>
      changeWorkspaces(s, {
        type: "turn",
        id: "a",
        user: "hi",
        assistant: "hi",
        memoryRevision: 1,
        requestId: "blocked",
        revision: s.revision,
      }),
    ).toThrow("先继续");
    expect(
      validateRoutes(
        { parts: [], clarification: "是哪次活动？" },
        "改16",
        s.items,
      ),
    ).toEqual({ parts: [], clarification: "是哪次活动？" });
  });
});
