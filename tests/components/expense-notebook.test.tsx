import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  ExpenseNotebook,
  type ExpenseNotebookHandle,
} from "../../src/components/expense-notebook";
import * as service from "../../src/lib/expense-service";
import * as aa from "../../src/lib/group-aa";
import * as tasks from '../../src/lib/task-calendar';
import {
  changeExpenses,
  entryAllocations,
  emptyExpenseState,
  type ExpenseCommand,
} from "../../src/lib/expense-notebook";
afterEach(() => vi.restoreAllMocks());
it('首页收起 AA 账本后仍保留原活动和待核对的消费选择',async()=>{
  const group:aa.AAGroup={id:'collapse-group',name:'饭搭子',revision:1,members:[
    {id:'me',name:'我',self:true},{id:'li',name:'李娜'},
  ]};
  let state=changeExpenses(emptyExpenseState(),{type:'create',bookId:'collapse-book',title:'周末聚餐',group,participants:['me','li'],defaultPayerId:'me',revision:0,requestId:'create'});
  for(const [id,title,amount] of [['dinner','晚饭',10000],['drink','饮料',2000]] as const){
    state=changeExpenses(state,{type:'add',bookId:'collapse-book',entryId:id,entry:{title,amount,payerId:'me',fixed:[],shares:[{memberId:'me',weight:1},{memberId:'li',weight:1}]},revision:state.revision,requestId:`add-${id}`});
  }
  localStorage.setItem('zhiyin-expense-active','collapse-book');
  const persistence=vi.spyOn(service,'expenseRequest').mockResolvedValue(state);
  const bridge=vi.spyOn(aa,'groupAARequest').mockResolvedValue({collections:[]});
  const model=vi.spyOn(service,'requestExpenseReply').mockResolvedValue({action:'clarify',message:'这笔怎么分？'});
  const onBookSelected=vi.fn<(id:string)=>Promise<void>>().mockResolvedValue(undefined);
  const ref=createRef<ExpenseNotebookHandle>();
  render(<ExpenseNotebook ref={ref} conversation initialBookId="collapse-book" initialHistory={[{role:'user',content:'这次饭钱我先垫'}]} onBookSelected={onBookSelected} onPrompt={vi.fn()}/>);
  await userEvent.click(await screen.findByRole('button',{name:'核对并结算'}));
  await userEvent.click(screen.getByRole('checkbox',{name:'结算饮料'}));
  await userEvent.click(screen.getByRole('button',{name:'收起活动'}));

  expect(screen.getByRole('button',{name:'周末聚餐 · 展开账本'})).toHaveAttribute('aria-expanded','false');
  expect(localStorage.getItem('zhiyin-expense-active')).toBe('collapse-book');
  expect(onBookSelected).not.toHaveBeenCalled();
  expect(bridge).not.toHaveBeenCalled();
  expect(persistence.mock.calls.every(([operation])=>!operation)).toBe(true);
  await userEvent.click(screen.getByRole('button',{name:'继续核对分摊'}));
  expect(screen.getByRole('checkbox',{name:'结算晚饭'})).toBeChecked();
  expect(screen.getByRole('checkbox',{name:'结算饮料'})).not.toBeChecked();

  await act(async()=>{await ref.current!.handle('刚才这笔怎么分？');});
  expect(model.mock.calls[0][0].id).toBe('collapse-book');
  expect(model.mock.calls[0][2]).toEqual([{role:'user',content:'这次饭钱我先垫'}]);
});
it('女生半价不能按总额一半固定分配，真实解析后只回传一次正确分摊',async()=>{
  const prompt='夜宵220元，女生半价，其他人通a';
  const group:aa.AAGroup={id:'half-price-group',name:'夜宵搭子',revision:1,members:[
    {id:'self',name:'我',self:true,gender:'male'},
    {id:'group-li',name:'李娜',gender:'female'},
    {id:'group-wang',name:'小王',gender:'male'},
  ]};
  let state=emptyExpenseState();
  const persistence=vi.spyOn(service,'expenseRequest').mockImplementation(async(operation,revision)=>{
    if(operation)state=changeExpenses(state,{...operation,revision,requestId:crypto.randomUUID()} as ExpenseCommand);
    return state;
  });
  const bridge=vi.spyOn(aa,'groupAARequest').mockResolvedValue({group});
  const modelMessage='记下了：你55元，李娜110元，小王55元。';
  const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>{
    const url=String(input);
    if(url.startsWith('/api/zhiyin/scene-expenses'))return new Response(JSON.stringify({sources:[],state}));
    if(url==='/api/zhiyin/steward-reply')return new Response(JSON.stringify({output_text:JSON.stringify({
      action:'add',message:modelMessage,entry:{title:'夜宵',amount:22000,payerId:'self',
        fixed:[{memberId:'group-li',amount:11000}],
        shares:[{memberId:'self',weight:1},{memberId:'group-wang',weight:1}]},
    })}));
    throw new Error(`此集成测试不允许访问其他接口：${url}`);
  });
  const parser=vi.spyOn(service,'requestExpenseReply');
  const onRecorded=vi.fn<(prompt:string,text:string)=>Promise<void>>().mockResolvedValue(undefined);
  const ref=createRef<ExpenseNotebookHandle>();
  render(<ExpenseNotebook ref={ref} conversation activityKey="half-price-regression" activityTitle="夜宵 AA" onPrompt={vi.fn()} onRecorded={onRecorded}/>);
  await act(async()=>{await ref.current!.handle(prompt);});
  await userEvent.click(screen.getByRole('button',{name:'从微信选择群'}));
  await userEvent.click(screen.getByRole('checkbox',{name:'李娜'}));
  await userEvent.click(screen.getByRole('checkbox',{name:'小王'}));
  await userEvent.click(screen.getByRole('button',{name:'开始记录'}));
  await waitFor(()=>expect(onRecorded).toHaveBeenCalledOnce());
  expect(parser).toHaveBeenCalledOnce();
  expect(parser.mock.calls[0][1]).toBe(prompt);
  expect(fetcher.mock.calls.filter(([url])=>url==='/api/zhiyin/steward-reply')).toHaveLength(1);
  expect(persistence.mock.calls.filter(([operation])=>operation?.type==='add')).toHaveLength(1);
  expect(state.books).toHaveLength(1);
  expect(state.books[0].entries).toHaveLength(1);
  const entry=state.books[0].entries[0];
  expect(entry).toMatchObject({amount:22000,fixed:[],shares:[
    {memberId:'self',weight:2},{memberId:'group-li',weight:1},{memberId:'group-wang',weight:2},
  ]});
  expect(entryAllocations(group,entry).map(({id,amount})=>({id,amount}))).toEqual([
    {id:'self',amount:8800},{id:'group-li',amount:4400},{id:'group-wang',amount:8800},
  ]);
  expect(onRecorded).toHaveBeenCalledWith(prompt,expect.stringMatching(/你 ¥88\.00，李娜 ¥44\.00，小王 ¥88\.00/));
  expect(onRecorded.mock.calls[0]?.[1]).not.toMatch(/55|110/);
  expect(screen.queryByText(modelMessage)).not.toBeInTheDocument();
  expect(bridge).toHaveBeenCalledOnce();
  expect(bridge).toHaveBeenCalledWith('choose');
});
it('AA工作区恢复自己的追问上下文，读取共享偏好而不读取另一活动',async()=>{
  const group={id:'g',name:'饭搭子',revision:1,members:[{id:'me',name:'我',self:true}]};
  const state=changeExpenses(emptyExpenseState(),{type:'create',bookId:'book',title:'晚餐',group,participants:['me'],defaultPayerId:'me',revision:0,requestId:'create'});
  localStorage.setItem('zhiyin-expense-active','other');
  vi.spyOn(service,'expenseRequest').mockResolvedValue(state);
  const model=vi.spyOn(service,'requestExpenseReply').mockResolvedValue({action:'clarify',message:'哪瓶饮料？'});
  const ref=createRef<ExpenseNotebookHandle>();
  render(<ExpenseNotebook ref={ref} activityKey="dinner" initialBookId="book" initialHistory={[{role:'user',content:'两瓶饮料一瓶给李娜'}]} getMemoryContext={async()=> '喜欢简短说明'} onPrompt={vi.fn()}/>);
  await act(async()=>{await ref.current!.handle('刚才那瓶3元');});
  expect(model.mock.calls[0][0].id).toBe('book');
  expect(model.mock.calls[0][2]).toEqual([{role:'user',content:'两瓶饮料一瓶给李娜'}]);
  expect(model.mock.calls[0][3]?.memoryContext).toContain('喜欢简短说明');
});
it('查收款使用微信实付回执，支持本人提醒、前台更新和结清归档', async()=>{
  const group={id:'g',name:'饭搭子',revision:1,members:[{id:'me',name:'我',self:true},{id:'li',name:'李娜'},{id:'wang',name:'小王'}]};
  let state=emptyExpenseState();
  const apply=(op:object)=>state=changeExpenses(state,{...op,bookId:'book',revision:state.revision,requestId:crypto.randomUUID()} as ExpenseCommand);
  apply({type:'create',title:'今晚聚餐',group,participants:['me','li','wang'],defaultPayerId:'me'});
  apply({type:'add',entryId:'e',entry:{title:'晚饭',amount:9000,payerId:'me',fixed:[],shares:group.members.map(m=>({memberId:m.id,weight:1}))}});
  apply({type:'prepare',batchId:'batch',entryIds:['e']});
  apply({type:'published',batchId:'batch',collectionId:'batch'});
  const plan=state.books[0].batches[0].plan;
  let collection:aa.AACollection={...aa.calculateGroupAA(group,plan),id:'batch',groupId:'g',groupName:'饭搭子',createdAt:Date.now(),plan,status:'pending',members:aa.calculateGroupAA(group,plan).members.map(m=>({...m,paid:m.id!=='wang'}))};
  localStorage.setItem('zhiyin-expense-active','book');
  vi.spyOn(service,'expenseRequest').mockImplementation(async(op,revision)=>{
    if(op)state=changeExpenses(state,{...op,revision,requestId:crypto.randomUUID()} as ExpenseCommand);
    return state;
  });
  const bridge=vi.spyOn(aa,'groupAARequest').mockImplementation(async()=>({collections:[collection]}));
  const model=vi.spyOn(service,'requestExpenseReply').mockResolvedValue({action:'unrelated'});
  let calendar:tasks.TaskState={revision:0,tasks:[]};
  vi.spyOn(tasks,'taskRequest').mockImplementation(async command=>{
    if(command)calendar=tasks.updateTasks(calendar,command);
    return calendar;
  });
  const ref=createRef<ExpenseNotebookHandle>();
  render(<ExpenseNotebook ref={ref} onPrompt={vi.fn()}/>);
  await screen.findByRole('button',{name:/今晚聚餐/});
  await act(async()=>{expect(await ref.current!.handle('今晚那笔收齐了吗？')).toContain('小王 ¥30.00');});
  expect(model).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button',{name:'明天提醒我'}));
  await waitFor(()=>expect(calendar.tasks).toHaveLength(1));
  expect(calendar.tasks[0].status).toBe('pending');
  collection={...collection,status:'completed',members:collection.members.map(m=>({...m,paid:true}))};
  await act(async()=>{window.dispatchEvent(new Event('zhiyin-phone-foreground'));});
  await waitFor(()=>expect(calendar.tasks[0].status).toBe('completed'));
  expect(screen.queryByText(/已安排明天上午9点/)).not.toBeInTheDocument();
  expect(screen.getAllByText(/已结清归档/).length).toBeGreaterThan(0);
  expect(bridge.mock.calls.every(c=>c[0]==='records')).toBe(true);
  expect(state.books[0].batches[0].receipt?.status).toBe('completed');
});
it("可以修改活动名称、暂停再继续，无关问题交还普通管家", async () => {
  let state = emptyExpenseState();
  vi.spyOn(service, "expenseRequest").mockImplementation(
    async (op, revision) => {
      if (op)
        state = changeExpenses(state, {
          ...op,
          revision,
          requestId: crypto.randomUUID(),
        } as ExpenseCommand);
      return state;
    },
  );
  vi.spyOn(aa, "groupAARequest").mockResolvedValue({
    group: {
      id: "g",
      name: "群",
      revision: 1,
      members: [
        { id: "me", name: "我", self: true },
        { id: "li", name: "李娜" },
      ],
    },
  });
  vi.spyOn(service, "requestExpenseReply").mockResolvedValue({
    action: "unrelated",
  });
  const ref = createRef<ExpenseNotebookHandle>();
  render(<ExpenseNotebook ref={ref} onPrompt={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "随手记消费" }));
  await userEvent.clear(screen.getByRole("textbox", { name: "活动名称" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "活动名称" }),
    "周末出游",
  );
  await userEvent.click(screen.getByRole("button", { name: "从微信选择群" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "李娜" }));
  await userEvent.click(screen.getByRole("button", { name: "开始记录" }));
  await screen.findByRole("button", { name: /周末出游/ });
  await act(async () =>
    expect(await ref.current!.handle("本月花了300吗")).toBeNull(),
  );
  await act(async () =>
    expect(await ref.current!.handle("暂停记账")).toContain("记录还在"),
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "继续记录" }),
    state.books[0].id,
  );
  await screen.findByRole("button", { name: /周末出游/ });
  await userEvent.click(screen.getByRole("button", { name: /周末出游/ }));
  await userEvent.click(screen.getByRole("button", { name: "收起活动" }));
  expect(screen.getByRole("button", { name: "周末出游 · 展开账本" })).toBeInTheDocument();
  await act(async () =>
    expect(await ref.current!.handle("暂停记账")).toContain("记录还在"),
  );
  await userEvent.click(screen.getByRole("button", { name: "随手记消费" }));
  await userEvent.click(screen.getByRole("button", { name: "暂不开始" }));
  expect(screen.queryByText("把这次消费记在一起")).not.toBeInTheDocument();
});
it("选群确认参与人后，首页短句追加并能纠正上一笔，记录不触发支付", async () => {
  let state = emptyExpenseState();
  vi.spyOn(service, "expenseRequest").mockImplementation(
    async (op, revision) => {
      if (op)
        state = changeExpenses(state, {
          ...op,
          revision,
          requestId: crypto.randomUUID(),
        } as ExpenseCommand);
      return state;
    },
  );
  const bridge = vi.spyOn(aa, "groupAARequest").mockResolvedValue({
    group: {
      id: "g",
      name: "饭搭子",
      revision: 1,
      members: [
        { id: "me", name: "我", self: true },
        { id: "li", name: "李娜" },
      ],
    },
  });
  const model = vi.spyOn(service, "requestExpenseReply").mockResolvedValue({
    action: "add",
    entry: {
      title: "卤味",
      amount: 4200,
      payerId: "me",
      fixed: [],
      shares: [
        { memberId: "me", weight: 1 },
        { memberId: "li", weight: 1 },
      ],
    },
  });
  const ref = createRef<ExpenseNotebookHandle>();
  render(<ExpenseNotebook ref={ref} onPrompt={vi.fn()} />);
  await act(async () => {
    expect(await ref.current!.handle("今晚吃饭我先付，最后一起算")).toContain(
      "参与人",
    );
  });
  await userEvent.click(screen.getByRole("button", { name: "从微信选择群" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "李娜" }));
  await userEvent.click(screen.getByRole("button", { name: "开始记录" }));
  await waitFor(() => expect(state.books).toHaveLength(1));
  await act(async () => {
    expect(await ref.current!.handle("卤味42")).toContain("按这次参与人平分");
  });
  expect(state.books[0].entries).toHaveLength(1);
  model.mockResolvedValue({
    action: "edit",
    entryId: state.books[0].entries[0].id,
    entry: { ...state.books[0].entries[0], amount: 4500 },
  });
  await act(async () => {
    await ref.current!.handle("刚才说错了，45元");
  });
  expect(state.books[0].entries[0].amount).toBe(4500);
  model.mockResolvedValue({
    action: "add",
    entry: {
      title: "饮料",
      amount: 1600,
      payerId: "me",
      fixed: [],
      shares: [
        { memberId: "me", weight: 1 },
        { memberId: "li", weight: 1 },
      ],
    },
  });
  await act(async () => {
    expect(await ref.current!.handle("饮料16，最后一起算")).toContain("记下了");
  });
  expect(state.books[0].entries).toHaveLength(2);
  expect(screen.getByText(/2 笔按你、李娜平分/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "调整分摊" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /去微信确认收款/ }),
  ).toBeInTheDocument();
  model.mockResolvedValue({ action: "review" });
  await act(async () => {
    expect(
      await ref.current!.handle("烧烤236，小王没吃，记完一起算"),
    ).toContain("还没有记入");
  });
  expect(state.books[0].entries).toHaveLength(2);
  expect(bridge).toHaveBeenCalledTimes(1);
});
it("微信回执丢失后锁定费用，核对找到原收款即恢复，不会再建一笔", async () => {
  const group = {
    id: "g",
    name: "饭搭子",
    revision: 1,
    members: [
      { id: "me", name: "我", self: true },
      { id: "li", name: "李娜" },
    ],
  };
  let state = changeExpenses(emptyExpenseState(), {
    type: "create",
    bookId: "b",
    title: "聚餐",
    group,
    participants: ["me", "li"],
    defaultPayerId: "me",
    revision: 0,
    requestId: "c",
  });
  state = changeExpenses(state, {
    type: "add",
    bookId: "b",
    entryId: "e",
    entry: {
      title: "晚饭",
      amount: 1000,
      payerId: "me",
      fixed: [],
      shares: [
        { memberId: "me", weight: 1 },
        { memberId: "li", weight: 1 },
      ],
    },
    revision: 1,
    requestId: "a",
  });
  localStorage.setItem("zhiyin-expense-active", "b");
  vi.spyOn(service, "expenseRequest").mockImplementation(
    async (op, revision) => {
      if (op)
        state = changeExpenses(state, {
          ...op,
          revision,
          requestId: crypto.randomUUID(),
        } as ExpenseCommand);
      return state;
    },
  );
  const bridge = vi
    .spyOn(aa, "groupAARequest")
    .mockImplementation(async (op) => {
      if (op === "publish") throw new Error("微信操作超时");
      const batch = state.books[0].batches[0];
      return {
        collections: [
          {
            id: batch.id,
            groupId: "g",
            groupName: "饭搭子",
            createdAt: Date.now(),
            plan: batch.plan,
            status: "pending",
            total: 1000,
            selfAmount: 500,
            collectAmount: 500,
            members: [
              { ...group.members[0], amount: 500, paid: true },
              { ...group.members[1], amount: 500, paid: false },
            ],
          },
        ],
      };
    });
  render(<ExpenseNotebook onPrompt={vi.fn()} />);
  await screen.findByRole("button", { name: /聚餐/ });
  expect(screen.queryByText("分摊依据")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "核对并结算" }));
  expect(screen.getByRole("checkbox", { name: "结算晚饭" })).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: /去微信确认收款/ }));
  await screen.findByText("微信操作超时");
  expect(state.books[0].batches[0].status).toBe("prepared");
  expect(state.books[0].entries[0].batchId).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "核对结果" }));
  await screen.findByText("1 笔消费 · 已发起群收款");
  expect(state.books[0].batches).toHaveLength(1);
  expect(bridge.mock.calls.filter((c) => c[0] === "publish")).toHaveLength(1);
});
it("未发布的结算核对后可恢复修改，删除需要再次确认", async () => {
  const group = {
    id: "g",
    name: "饭搭子",
    revision: 1,
    members: [
      { id: "me", name: "我", self: true },
      { id: "li", name: "李娜" },
    ],
  };
  let state = changeExpenses(emptyExpenseState(), {
    type: "create",
    bookId: "b",
    title: "聚餐",
    group,
    participants: ["me", "li"],
    defaultPayerId: "me",
    revision: 0,
    requestId: "c",
  });
  state = changeExpenses(state, {
    type: "add",
    bookId: "b",
    entryId: "e",
    entry: {
      title: "晚饭",
      amount: 1000,
      payerId: "me",
      fixed: [],
      shares: [
        { memberId: "me", weight: 1 },
        { memberId: "li", weight: 1 },
      ],
    },
    revision: 1,
    requestId: "a",
  });
  state = changeExpenses(state, {
    type: "prepare",
    bookId: "b",
    batchId: "x",
    entryIds: ["e"],
    revision: 2,
    requestId: "p",
  });
  localStorage.setItem("zhiyin-expense-active", "b");
  vi.spyOn(service, "expenseRequest").mockImplementation(
    async (op, revision) => {
      if (op)
        state = changeExpenses(state, {
          ...op,
          revision,
          requestId: crypto.randomUUID(),
        } as ExpenseCommand);
      return state;
    },
  );
  vi.spyOn(aa, "groupAARequest").mockResolvedValue({ collections: [] });
  render(<ExpenseNotebook onPrompt={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: /聚餐/ }));
  await userEvent.click(screen.getByRole("button", { name: "返回修改" }));
  await screen.findByText("微信中尚未发布，已恢复修改。");
  await userEvent.click(screen.getByRole("button", { name: "删除" }));
  expect(state.books[0].entries).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
  await waitFor(() => expect(state.books[0].entries).toHaveLength(0));
});
