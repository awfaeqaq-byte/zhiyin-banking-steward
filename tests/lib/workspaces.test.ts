import { describe, it, expect } from "vitest";
import {
  changeWorkspaces,
  emptyWorkspaces,
  workspaceContext,
  validateRoutes,
  validWorkspaces,
  type WorkspaceCommand,
} from "../../src/lib/workspaces";
describe("独立任务工作区", () => {
  it('会话可新增、读取、重命名、归档恢复和删除；待处理任务不能删除',()=>{
    let state=emptyWorkspaces();
    const apply=(operation:object)=>{state=changeWorkspaces(state,{...operation,revision:state.revision,requestId:crypto.randomUUID()} as WorkspaceCommand);};
    apply({type:'create',id:'chat-1',title:'新对话',kind:'general'});
    expect(state.items[0].title).toBe('新对话');
    apply({type:'rename',id:'chat-1',title:'生日安排'});
    apply({type:'status',id:'chat-1',status:'archived'});
    expect(state.items[0]).toMatchObject({title:'生日安排',status:'archived'});
    apply({type:'status',id:'chat-1',status:'active'});
    apply({type:'enqueue',id:'chat-1',token:'pending',text:'继续处理'});
    expect(()=>apply({type:'delete',id:'chat-1'})).toThrow(/待处理/);
    apply({type:'discard',id:'chat-1',token:'pending'});
    apply({type:'delete',id:'chat-1'});
    expect(state.items).toHaveLength(0);
    expect(validWorkspaces(state)).toBe(true);
  });
  it('待处理交代不能归档，完成后可归档并恢复原会话',()=>{
    let state=emptyWorkspaces();
    const apply=(operation:object)=>{state=changeWorkspaces(state,{...operation,revision:state.revision,requestId:crypto.randomUUID()} as WorkspaceCommand);};
    apply({type:'create',id:'chat',title:'读书计划',kind:'general'});
    apply({type:'enqueue',id:'chat',token:'pending',text:'推荐一本书'});
    const before=structuredClone(state);
    expect(()=>apply({type:'status',id:'chat',status:'archived'})).toThrow(/待处理.*归档/);
    expect(state).toEqual(before);
    apply({type:'turn',id:'chat',token:'pending',user:'推荐一本书',assistant:'先从这一本开始。',memoryRevision:0});
    apply({type:'status',id:'chat',status:'archived'});
    expect(state.items[0].status).toBe('archived');
    apply({type:'status',id:'chat',status:'active'});
    expect(state.items[0]).toMatchObject({status:'active',pending:[],messages:[{content:'推荐一本书'},{content:'先从这一本开始。'}]});
  });
  it.each(['routing','ready','processing'] as const)('%s 的关联会话拒绝归档，原消息完成后可以归档恢复',phase=>{
    let state=emptyWorkspaces();
    const apply=(operation:object)=>{state=changeWorkspaces(state,{...operation,revision:state.revision,requestId:crypto.randomUUID()} as WorkspaceCommand);};
    apply({type:'create',id:'chat',title:'出行清单',kind:'general'});
    apply({type:'create',id:'other',title:'其他事项',kind:'general'});
    apply({type:'message-submit',id:'message',text:'整理杭州出行清单',currentId:phase==='routing'?'chat':'other',memoryRevision:0});
    const route=()=>apply({type:'message-routed',id:'message',parts:[{taskId:'chat',kind:'general',title:'出行清单',text:'整理杭州出行清单'}]});
    if(phase!=='routing')route();
    let job=state.runs?.[0].jobs[0];
    if(phase==='processing')apply({type:'message-claim',id:'message',jobId:job!.id,owner:'browser'});
    // Even a separately cleared pending entry must not archive a live job's workspace.
    if(job)apply({type:'discard',id:'chat',token:job.id});
    const before=structuredClone(state);
    expect(()=>apply({type:'status',id:'chat',status:'archived'})).toThrow(/处理消息.*归档/);
    expect(state).toEqual(before);
    expect(state.items.find(item=>item.id==='chat')?.status).toBe('active');
    if(phase==='routing')route();
    job=state.runs![0].jobs[0];
    if(phase!=='processing')apply({type:'message-claim',id:'message',jobId:job.id,owner:'browser'});
    apply({type:'message-complete',id:'message',jobId:job.id,owner:'browser',assistant:'出行清单已整理。',memoryRevision:0,failed:false});
    expect(state.runs![0].status).toBe('completed');
    apply({type:'status',id:'chat',status:'archived'});
    expect(state.items.find(item=>item.id==='chat')?.status).toBe('archived');
    apply({type:'status',id:'chat',status:'active'});
    expect(state.items.find(item=>item.id==='chat')?.messages.at(-1)?.content).toBe('出行清单已整理。');
  });
  it('只等待用户补充、没有执行或排队的会话仍可归档恢复',()=>{
    let state=emptyWorkspaces();
    const apply=(operation:object)=>{state=changeWorkspaces(state,{...operation,revision:state.revision,requestId:crypto.randomUUID()} as WorkspaceCommand);};
    apply({type:'create',id:'chat',title:'出行安排',kind:'general'});
    apply({type:'message-submit',id:'message',text:'改一下时间',currentId:'chat',memoryRevision:0});
    apply({type:'message-routed',id:'message',parts:[],clarification:'你想改哪次出行？'});
    expect(state.runs![0].status).toBe('waiting_user');
    apply({type:'status',id:'chat',status:'archived'});
    expect(state.items[0].status).toBe('archived');
    apply({type:'status',id:'chat',status:'active'});
    expect(state.items[0].status).toBe('active');
    expect(state.conversation?.at(-1)?.content).toBe('你想改哪次出行？');
  });
  it('任务现场落盘并修复旧查账分类，不允许伪造授权或改成金融执行类型',()=>{
    let s=changeWorkspaces(emptyWorkspaces(),{type:'create',id:'b',title:'看支出',kind:'general',revision:0,requestId:'create'});
    s=changeWorkspaces(s,{type:'progress',id:'b',kind:'bills',progress:{goal:'看本月支出',stage:'waiting_authorization',bill:{period:'本月',provider:'alipay'},waitingFor:{field:'authorization',question:'需要平台确认账单读取范围'}},memoryRevision:0,revision:s.revision,requestId:'plan'} as WorkspaceCommand);
    expect(s.items[0]).toMatchObject({kind:'bills',progress:{bill:{provider:'alipay'}}});expect(validWorkspaces(s)).toBe(true);
    expect(()=>changeWorkspaces(s,{type:'progress',id:'b',kind:'transfer',progress:{goal:'转账',stage:'ready'},memoryRevision:0,revision:s.revision,requestId:'wrong'} as unknown as WorkspaceCommand)).toThrow();
    s=changeWorkspaces(s,{type:'turn',id:'b',user:'新问题',assistant:'收到',memoryRevision:1,revision:s.revision,requestId:'new'});
    expect(s.items[0].progress).toBeUndefined();
  });
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
