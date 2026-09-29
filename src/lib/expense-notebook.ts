import {
  calculateGroupAA,
  validAAGroup,
  type AAGroup,
  type AAPlan,
  type AACollection,
} from "./group-aa";
import {collectionProgress} from './expense-follow-up';
export type ExpenseInput = {
  title: string;
  amount: number;
  payerId: string;
  fixed: { memberId: string; amount: number }[];
  shares: { memberId: string; weight: number }[];
};
export type ExpenseEntry = ExpenseInput & {
  id: string;
  at: number;
  batchId?: string;
};
export type ExpenseBatch = {
  id: string;
  entryIds: string[];
  plan: AAPlan;
  status: "prepared" | "published";
  collectionId?: string;
  receipt?: AACollection;
  at: number;
};
export type ExpenseBook = {
  id: string;
  title: string;
  group: AAGroup;
  participants: string[];
  defaultPayerId: string;
  entries: ExpenseEntry[];
  batches: ExpenseBatch[];
  at: number;
};
export type ExpenseState = {
  revision: number;
  books: ExpenseBook[];
  applied: { id: string; body: string }[];
};
export function isDefaultExpenseSplit(book: ExpenseBook, entry: ExpenseInput) {
  return entry.fixed.length === 0 &&
    entry.shares.length === book.participants.length &&
    book.participants.every(id => entry.shares.some(s => s.memberId === id)) &&
    entry.shares.every(s => s.weight === entry.shares[0]?.weight);
}

/** Describe actual stored allocations, never a model-generated financial summary. */
export function expenseSplitSummary(book: ExpenseBook, selected: string[]) {
  const entries = book.entries.filter(e => !e.batchId && selected.includes(e.id));
  const name = (id: string) => {
    const member = book.group.members.find(m => m.id === id);
    return member?.self ? "你" : member?.name || id;
  };
  return {
    people: book.participants.map(name).join("、"),
    equalCount: entries.filter(e => isDefaultExpenseSplit(book, e)).length,
    exceptions: entries.filter(e => !isDefaultExpenseSplit(book, e)).map(e => {
      const included = new Set([...e.fixed, ...e.shares].map(s => s.memberId));
      const excluded = book.participants.filter(id => !included.has(id));
      const amounts = entryAllocations(book.group, e)
        .filter(m => included.has(m.id))
        .map(m => `${name(m.id)} ¥${(m.amount / 100).toFixed(2)}`).join("，");
      return { id: e.id, title: e.title, text: `${amounts}${excluded.length ? `；${excluded.map(name).join("、")}不参与` : ""}` };
    }),
  };
}
type Operation =
  | { type: "sync-collections"; bookId: string; collections: AACollection[] }
  | {
      type: "create";
      bookId: string;
      title: string;
      group: AAGroup;
      participants: string[];
      defaultPayerId: string;
    }
  | {
      type: "add" | "edit";
      bookId: string;
      entryId: string;
      entry: ExpenseInput;
    }
  | { type: "delete"; bookId: string; entryId: string }
  | { type: "prepare"; bookId: string; batchId: string; entryIds: string[] }
  | { type: "published"; bookId: string; batchId: string; collectionId: string }
  | { type: "release"; bookId: string; batchId: string };
export type ExpenseCommand = Operation & {
  revision: number;
  requestId: string;
};
export type ExpenseOperation = Operation;
export const emptyExpenseState = (): ExpenseState => ({
  revision: 0,
  books: [],
  applied: [],
});
export function validExpenseState(value: unknown): value is ExpenseState {
  try {
    const s = value as ExpenseState;
    if (
      !s ||
      !Number.isSafeInteger(s.revision) ||
      s.revision < 0 ||
      !Array.isArray(s.books) ||
      s.books.length > 30 ||
      !Array.isArray(s.applied)
    )
      return false;
    return (
      s.books.every(
        (b) =>
          validAAGroup(b.group) &&
          typeof b.id === "string" &&
          typeof b.title === "string" &&
          Array.isArray(b.participants) &&
          b.participants.every((id) =>
            b.group.members.some((m) => m.id === id),
          ) &&
          typeof b.defaultPayerId === "string" &&
          Array.isArray(b.entries) &&
          b.entries.length <= 300 &&
          b.entries.every((e) => {
            entryAllocations(b.group, e);
            return typeof e.id === "string" && Number.isFinite(e.at);
          }) &&
          Array.isArray(b.batches) &&
          b.batches.every((batch) => {
            calculateGroupAA(b.group, batch.plan);
            if(batch.receipt) collectionProgress(b,batch,batch.receipt);
            return (
              typeof batch.id === "string" &&
              ["prepared", "published"].includes(batch.status) &&
              Array.isArray(batch.entryIds)
            );
          }),
      ) &&
      s.applied.every(
        (a) => typeof a.id === "string" && typeof a.body === "string",
      )
    );
  } catch {
    return false;
  }
}
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const validId = (v: unknown) =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
function itemsFor(entry: ExpenseInput, id: string) {
  const fixed = entry.fixed.reduce((n, x) => n + x.amount, 0);
  const items: AAPlan["items"] = entry.fixed.map((x, i) => ({
    id: `${id}-fixed-${i}`,
    title: entry.title,
    amount: x.amount,
    shares: [{ memberId: x.memberId, weight: 1 }],
  }));
  if (entry.amount > fixed)
    items.push({
      id: `${id}-shared`,
      title: entry.title,
      amount: entry.amount - fixed,
      shares: entry.shares,
    });
  return items;
}
export function entryAllocations(group: AAGroup, entry: ExpenseInput) {
  assert(
    entry &&
      typeof entry.title === "string" &&
      entry.title.trim() &&
      entry.title.length <= 60,
    "请填写消费名称",
  );
  assert(
    Number.isSafeInteger(entry.amount) &&
      entry.amount > 0 &&
      entry.amount <= 10000000,
    "金额应为有效的正整数分",
  );
  assert(
    group.members.some((m) => m.id === entry.payerId),
    "垫付人不在群中",
  );
  assert(
    Array.isArray(entry.fixed) &&
      entry.fixed.length <= 19 &&
      Array.isArray(entry.shares),
    "分摊格式无效",
  );
  assert(
    new Set(entry.fixed.map((x) => x?.memberId)).size === entry.fixed.length,
    "固定金额参与人重复",
  );
  assert(
    entry.fixed.every(
      (x) =>
        x &&
        group.members.some((m) => m.id === x.memberId) &&
        Number.isSafeInteger(x.amount) &&
        x.amount > 0,
    ),
    "固定分摊金额无效",
  );
  const fixed = entry.fixed.reduce((n, x) => n + x.amount, 0);
  assert(fixed <= entry.amount, "指定金额超过本笔总额");
  assert(
    fixed !== entry.amount || entry.shares.length === 0,
    "金额已分完，请移除余款分摊人",
  );
  const result = calculateGroupAA(group, {
    title: entry.title,
    items: itemsFor(entry, "entry"),
  });
  return group.members.map((m) => ({
    ...m,
    amount: result.members.find((x) => x.id === m.id)?.amount ?? 0,
  }));
}
export function settlementPlan(book: ExpenseBook, entryIds: string[]): AAPlan {
  assert(
    Array.isArray(entryIds) &&
      entryIds.length &&
      new Set(entryIds).size === entryIds.length,
    "请选择尚未结算的消费",
  );
  const entries = entryIds.map((id) => {
    const e = book.entries.find((x) => x.id === id);
    assert(e && !e.batchId, "消费不存在或已进入结算");
    return e;
  });
  assert(
    entries.every(
      (e) => book.group.members.find((m) => m.id === e.payerId)?.self,
    ),
    "包含他人垫付，请分开处理；目前仅支持收回你垫付的费用",
  );
  const plan = {
    title: book.title,
    items: entries.flatMap((e) => itemsFor(e, e.id)),
  };
  assert(plan.items.length <= 20, "单次最多20个分摊项目，请分批选择消费");
  assert(
    calculateGroupAA(book.group, plan).collectAmount > 0,
    "没有需要向其他人收取的费用",
  );
  return plan;
}
export function changeExpenses(
  state: ExpenseState,
  command: ExpenseCommand,
  at = Date.now(),
): ExpenseState {
  assert(
    command && validId(command.requestId) && validId(command.bookId),
    "请求标识无效",
  );
  const body = JSON.stringify(command),
    seen = state.applied.find((x) => x.id === command.requestId);
  if (seen) {
    assert(seen.body === body, "同一请求标识不能用于不同操作");
    return state;
  }
  assert(command.revision === state.revision, "记录已变化，请刷新后重试");
  const next: ExpenseState = JSON.parse(JSON.stringify(state));
  if (command.type === "create") {
    assert(
      next.books.length < 30 &&
        !next.books.some((b) => b.id === command.bookId),
      "活动已存在或数量超过限制",
    );
    assert(
      typeof command.title === "string" &&
        command.title.trim() &&
        command.title.length <= 60 &&
        validAAGroup(command.group),
      "活动或群信息无效",
    );
    assert(
      Array.isArray(command.participants) &&
        command.participants.length &&
        new Set(command.participants).size === command.participants.length &&
        command.participants.every((id) =>
          command.group.members.some((m) => m.id === id),
        ),
      "请选择参与人",
    );
    assert(
      command.participants.includes(command.defaultPayerId),
      "垫付人应为参与人",
    );
    next.books.push({
      id: command.bookId,
      title: command.title,
      group: command.group,
      participants: command.participants,
      defaultPayerId: command.defaultPayerId,
      entries: [],
      batches: [],
      at,
    });
  } else {
    const book = next.books.find((b) => b.id === command.bookId);
    assert(book, "活动不存在");
    if (
      command.type === "add" ||
      command.type === "edit" ||
      command.type === "delete"
    ) {
      assert(validId(command.entryId), "消费标识无效");
      const i = book.entries.findIndex((e) => e.id === command.entryId);
      if (command.type === "add")
        assert(i < 0 && book.entries.length < 300, "消费已存在或记录过多");
      else
        assert(
          i >= 0 && !book.entries[i].batchId,
          "记录不存在或已进入结算，不能修改",
        );
      if (command.type === "delete") book.entries.splice(i, 1);
      else {
        entryAllocations(book.group, command.entry);
        const { title, amount, payerId, fixed, shares } = command.entry;
        const entry = {
          title,
          amount,
          payerId,
          fixed,
          shares,
          id: command.entryId,
          at: i >= 0 ? book.entries[i].at : at,
        };
        if (i < 0) book.entries.push(entry);
        else book.entries[i] = entry;
      }
    } else if (command.type === "prepare") {
      assert(
        validId(command.batchId) &&
          !book.batches.some((b) => b.id === command.batchId),
        "结算标识无效或重复",
      );
      const plan = settlementPlan(book, command.entryIds);
      book.batches.push({
        id: command.batchId,
        entryIds: command.entryIds,
        plan,
        status: "prepared",
        at,
      });
      book.entries.forEach((e) => {
        if (command.entryIds.includes(e.id)) e.batchId = command.batchId;
      });
    } else if (command.type === "release" || command.type === "published") {
      const batch = book.batches.find((b) => b.id === command.batchId);
      assert(batch && batch.status === "prepared", "结算不存在或已发布");
      if (command.type === "release") {
        book.entries.forEach((e) => {
          if (e.batchId === batch.id) delete e.batchId;
        });
        book.batches = book.batches.filter((b) => b.id !== batch.id);
      } else {
        assert(command.collectionId === batch.id, "收款结果与本次结算不一致");
        batch.status = "published";
        batch.collectionId = command.collectionId;
      }
    } else if(command.type === 'sync-collections') {
      assert(Array.isArray(command.collections)&&command.collections.length<=book.batches.length,'收款记录格式无效');
      assert(new Set(command.collections.map(c=>c?.id)).size===command.collections.length,'收款回执重复');
      for(const c of command.collections) {
        const batch=book.batches.find(b=>b.id===c?.id&&b.status==='published');
        assert(batch,'收款回执不属于本次已发布结算');
        collectionProgress(book,batch,c);
      }
      for(const batch of book.batches.filter(b=>b.status==='published')) {
        const receipt=command.collections.find(c=>c.id===batch.id);
        if(receipt)batch.receipt=receipt;
        else delete batch.receipt;
      }
    } else throw new Error("不支持的记录操作");
  }
  next.revision++;
  next.applied = [...next.applied, { id: command.requestId, body }].slice(-500);
  return next;
}
