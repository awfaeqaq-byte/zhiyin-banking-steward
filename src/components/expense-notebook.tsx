import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { BookOpen, ChevronDown, Plus, ArrowUpRight } from "lucide-react";
import {
  calculateGroupAA,
  groupAARequest,
  type AAGroup,
  type AACollection,
} from "../lib/group-aa";
import {
  emptyExpenseState,
  entryAllocations,
  isDefaultExpenseSplit,
  expenseSplitSummary,
  settlementPlan,
  type ExpenseOperation,
  type ExpenseState,
  type ExpenseBook,
  type ExpenseBatch,
} from "../lib/expense-notebook";
import {
  expenseRequest,
  requestExpenseReply,
  type ExpenseReply,
  isExpenseReviewPrompt,
} from "../lib/expense-service";
import "./expense-notebook.css";
export type ExpenseNotebookHandle = {
  handle: (prompt: string) => Promise<string | null>;
};
const money = (c: number) => `¥${(c / 100).toFixed(2)}`;
const startPattern =
  /随手记|零散消费|记个账|帮我记|开始记|新活动|我先[付垫]|最后一起算|先垫付/;
export const ExpenseNotebook = forwardRef<
  ExpenseNotebookHandle,
  { onPrompt: (text: string) => void }
>(function ExpenseNotebook({ onPrompt }, ref) {
  const [state, setState] = useState<ExpenseState>(emptyExpenseState);
  const current = useRef(state),
    busyRef = useRef(false);
  const [active, setActive] = useState(
    () => localStorage.getItem("zhiyin-expense-active") || "",
  );
  const [setup, setSetup] = useState(false),
    [pending, setPending] = useState(""),
    [group, setGroup] = useState<AAGroup | null>(null),
    [people, setPeople] = useState<string[]>([]),
    [title, setTitle] = useState("今晚聚餐");
  const [expanded, setExpanded] = useState(false),
    [review, setReview] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<AACollection[]>([]),
    [removing, setRemoving] = useState("");
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const book = state.books.find((b) => b.id === active);
  function accept(s: ExpenseState) {
    current.current = s;
    setState(s);
    return s;
  }
  function activate(id: string) {
    setActive(id);
    localStorage.setItem("zhiyin-expense-active", id);
    history.current = [];
    setReview(false);
    setExpanded(false);
    setRecords([]);
  }
  async function load() {
    return accept(await expenseRequest());
  }
  async function save(op: ExpenseOperation) {
    return accept(await expenseRequest(op, current.current.revision));
  }
  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "记录未完成，请重试");
      await load().catch(() => {});
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    void expenseRequest()
      .then((s) => {
        if (live) {
          current.current = s;
          setState(s);
        }
      })
      .catch(() => {
        /* Report on explicit use, not an unsolicited home alert. */
      });
    return () => {
      live = false;
    };
  }, []);
  async function interpret(b: ExpenseBook, prompt: string) {
    // Opening the review is not a financial execution and must not depend on
    // whether the model mistakes the existing collection bridge for a payment.
    const result: ExpenseReply = isExpenseReviewPrompt(prompt)
      ? { action: "review" as const }
      : await requestExpenseReply(b, prompt, history.current);
    if (
      /群收款|一起算|结算/.test(prompt) &&
      /\d|[一二两三四五六七八九十百千万]+[元块]/.test(prompt) &&
      !["add", "edit"].includes(result.action)
    )
      return "这句话同时提到了消费和结算，这笔还没有记入。请先单独告诉我消费金额和分摊方式，记好后再一起结算。";
    if (result.action === "unrelated") return null;
    let text = result.message || "请补充这笔消费的信息。";
    if (result.action === "review") {
      setExpanded(true);
      setReview(true);
      const today = new Date().toLocaleDateString("zh-CN");
      setSelected(
        b.entries
          .filter(
            (e) =>
              !e.batchId &&
              (!/今天|今晚/.test(prompt) ||
                new Date(e.at).toLocaleDateString("zh-CN") === today),
          )
          .map((e) => e.id),
      );
      text =
        "明细已展开。勾选这次要结算的消费，核对每个人的金额后，再去微信确认。";
    }
    if (result.action === "add" || result.action === "edit") {
      const entry = result.entry!;
      entryAllocations(b.group, entry);
      await save({
        type: result.action,
        bookId: b.id,
        entryId:
          result.action === "edit" ? result.entryId! : crypto.randomUUID(),
        entry,
      });
      const allocations = entryAllocations(b.group, entry).filter(
        (m) => m.amount > 0,
      );
      text = `${result.action === "edit" ? "已更正" : "记下了"}：${entry.title} ${money(entry.amount)}。${isDefaultExpenseSplit(b, entry) ? "按这次参与人平分" : allocations.length <= 4 ? allocations.map((m) => `${m.self ? "你" : m.name} ${money(m.amount)}`).join("，") : `共 ${allocations.length} 人分摊，可展开明细核对`}。`;
      setReview(false);
      setExpanded(false);
      setNotice("");
      if (
        /群收款|一起算|结算/.test(prompt) &&
        !/不要|不用|别|取消/.test(prompt)
      ) {
        const updated = current.current.books.find((x) => x.id === b.id)!;
        setSelected(updated.entries.filter((e) => !e.batchId).map((e) => e.id));
        setReview(true);
        setExpanded(true);
        text += " 已展开结算，去微信前请核对。";
      }
    }
    if (result.action === "delete") {
      const target = b.entries.find((e) => e.id === result.entryId);
      if (!target) throw new Error("没有找到这笔记录，请在明细中选择");
      setExpanded(true);
      setRemoving(target.id);
      text = `要删除「${target.title} ${money(target.amount)}」吗？请在明细里确认。`;
    }
    history.current = [
      ...history.current,
      { role: "user", content: prompt },
      { role: "assistant", content: text },
    ].slice(-6) as typeof history.current;
    return text;
  }
  useImperativeHandle(ref, () => ({
    async handle(prompt) {
      if (busyRef.current) throw new Error("上一笔记录正在处理，请稍后再说");
      if (
        startPattern.test(prompt) &&
        (!book || /新活动|重新开始/.test(prompt))
      ) {
        setPending(prompt);
        setSetup(true);
        setExpanded(true);
        setError("");
        return "好，我帮你把零散消费记在一起。先选择微信群和这次参与人，默认由你垫付；单笔有例外直接告诉我。";
      }
      if (!book || setup) return null;
      if (/^(结束记录|暂停记账|停止记账)$/.test(prompt)) {
        activate("");
        return "先收起了，记录还在。下次从“继续记录”打开即可。";
      }
      // Do not intercept ordinary banking requests just because an activity exists.
      if (
        !/\d|一半|半份|平分|均摊|[aA]{2}|收款|结算|记下|记录|刚才|上一笔|那笔|没吃|没喝|删除|算一下/.test(
          prompt,
        ) &&
        history.current.at(-1)?.role !== "assistant"
      )
        return null;
      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        const latest = await load();
        const b = latest.books.find((x) => x.id === active);
        if (!b) throw new Error("活动不存在，请重新选择");
        return await interpret(b, prompt);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
  }));
  async function create() {
    await run(async () => {
      if (!group) throw new Error("请先选择微信群");
      const self = group.members.find((m) => m.self)!;
      await load();
      const id = crypto.randomUUID();
      await save({
        type: "create",
        bookId: id,
        title,
        group,
        participants: people,
        defaultPayerId: self.id,
      });
      activate(id);
      setSetup(false);
      setExpanded(true);
      setNotice("已开始，直接在下面告诉我每笔消费。");
      // Keep the initiating request visible so its expense is never silently dropped.
      if (/\d/.test(pending)) onPrompt(pending);
    });
  }
  async function publish(batch: ExpenseBatch, b: ExpenseBook) {
    const response = await groupAARequest("publish", {
      id: batch.id,
      groupId: b.group.id,
      revision: b.group.revision,
      plan: batch.plan,
    });
    if (!response.collection || response.collection.id !== batch.id)
      throw new Error("尚未收到微信回执，请核对结果，不要重新建一笔");
    await save({
      type: "published",
      bookId: b.id,
      batchId: batch.id,
      collectionId: response.collection.id,
    });
    setRecords((r) => [
      response.collection!,
      ...r.filter((c) => c.id !== batch.id),
    ]);
    setReview(false);
    setNotice("群收款已发起，等待成员付款；不是已经到账。");
  }
  async function submitSettlement() {
    if (!book) return;
    await run(async () => {
      await load();
      const id = crypto.randomUUID();
      const next = await save({
        type: "prepare",
        bookId: book.id,
        batchId: id,
        entryIds: selected,
      });
      const b = next.books.find((x) => x.id === book.id)!;
      await publish(
        b.batches.find((x) => x.id === id)!,
        b,
      );
    });
  }
  async function reconcile(batch: ExpenseBatch, release = false) {
    if (!book) return;
    await run(async () => {
      const result = await groupAARequest("records", {
        groupId: book.group.id,
      });
      if (!Array.isArray(result.collections))
        throw new Error("未取得微信记录，暂不解锁");
      setRecords(result.collections);
      const found = result.collections.find((c) => c.id === batch.id);
      await load();
      if (found) {
        await save({
          type: "published",
          bookId: book.id,
          batchId: batch.id,
          collectionId: found.id,
        });
        setNotice("已核对，微信中已发起这笔群收款。");
      } else if (release) {
        await save({ type: "release", bookId: book.id, batchId: batch.id });
        setNotice("微信中尚未发布，已恢复修改。");
      } else setNotice("微信中尚未发布，可继续确认或返回修改。");
    });
  }
  let totals: ReturnType<typeof calculateGroupAA> | null = null,
    reviewError = "";
  if (book && review && selected.length) {
    try {
      totals = calculateGroupAA(book.group, settlementPlan(book, selected));
    } catch (e) {
      reviewError = e instanceof Error ? e.message : "无法结算";
    }
  }
  const outstanding = book?.entries.filter((e) => !e.batchId) ?? [];
  return (
    <section
      className="expense-notebook"
      aria-label="随手记消费"
      aria-busy={busy}
    >
      <fieldset disabled={busy}>
        {!book && !setup && (
          <div className="expense-launch">
            <button
              onClick={() => {
                setPending("");
                setSetup(true);
              }}
            >
              <Plus size={15} />
              随手记消费
            </button>
            {state.books.length > 0 && (
              <select
                aria-label="继续记录"
                value=""
                onChange={(e) => activate(e.target.value)}
              >
                <option value="">继续记录…</option>
                {state.books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {book && !setup && (
          <>
            <button
              className="expense-heading"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <BookOpen size={18} />
              <span>
                <strong>{book.title}</strong>
                <small>
                  {outstanding.length
                    ? `${outstanding.length} 笔待结算 · ${money(outstanding.reduce((n, e) => n + e.amount, 0))}`
                    : "随时告诉我下一笔消费"}
                </small>
              </span>
              <ChevronDown size={17} />
            </button>
            {expanded && (
              <div className="expense-body">
                <div className="expense-tools">
                  <span>
                    {book.group.name} · {book.participants.length} 人
                  </span>
                  <button
                    onClick={() => {
                      activate("");
                      setExpanded(false);
                    }}
                  >
                    收起活动
                  </button>
                </div>
                {!book.entries.length && (
                  <p>比如“卤味42”，或“饮料10，李娜3元，剩下我和小王平分”。</p>
                )}
                {book.entries.map((e) => (
                  <div className="expense-row" key={e.id}>
                    <div className="expense-row-main">
                      {review && !e.batchId && (
                        <label className="expense-row-choice">
                          <input
                            type="checkbox"
                            aria-label={`结算${e.title}`}
                            checked={selected.includes(e.id)}
                            onChange={(v) =>
                              setSelected(
                                v.target.checked
                                  ? [...selected, e.id]
                                  : selected.filter((id) => id !== e.id),
                              )
                            }
                          />
                        </label>
                      )}
                      <span>
                        <strong>{e.title}</strong>
                        <small>
                          {new Date(e.at).toLocaleDateString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                          })}{" "}
                          ·{" "}
                          {book.group.members.find((m) => m.id === e.payerId)
                            ?.self
                            ? "你"
                            : book.group.members.find((m) => m.id === e.payerId)
                                ?.name}
                          垫付{e.batchId ? " · 已进入结算" : ""}
                        </small>
                      </span>
                      <b>{money(e.amount)}</b>
                    </div>
                    <details>
                      <summary>分摊依据</summary>
                      <p>
                        {entryAllocations(book.group, e)
                          .filter((m) => m.amount)
                          .map(
                            (m) =>
                              `${m.self ? "你" : m.name} ${money(m.amount)}`,
                          )
                          .join(" · ")}
                      </p>
                    </details>
                    {!e.batchId && (
                      <div className="expense-row-actions">
                        <button
                          onClick={() =>
                            onPrompt(`修改「${e.title}」（记录 ${e.id}）：`)
                          }
                        >
                          修改
                        </button>
                        <button onClick={() => setRemoving(e.id)}>删除</button>
                      </div>
                    )}
                    {removing === e.id && !e.batchId && (
                      <div className="expense-confirm">
                        删除这笔记录？
                        <button
                          onClick={() =>
                            void run(async () => {
                              await save({
                                type: "delete",
                                bookId: book.id,
                                entryId: e.id,
                              });
                              setRemoving("");
                              setSelected((ids) =>
                                ids.filter((id) => id !== e.id),
                              );
                            })
                          }
                        >
                          确认删除
                        </button>
                        <button onClick={() => setRemoving("")}>保留</button>
                      </div>
                    )}
                  </div>
                ))}
                {outstanding.length > 0 && !review && (
                  <button
                    className="expense-primary"
                    onClick={() => {
                      setSelected(outstanding.map((e) => e.id));
                      setReview(true);
                    }}
                  >
                    核对并结算
                  </button>
                )}
                {review && (
                  <div className="expense-review">
                    <h3>这样分可以吗？</h3>
                    <p>仅结算上方勾选的消费，未选记录留待下次。</p>
                    {expenseSplitSummary(book, selected).equalCount > 0 && (
                      <p>{expenseSplitSummary(book, selected).equalCount} 笔按{expenseSplitSummary(book, selected).people}平分。</p>
                    )}
                    {expenseSplitSummary(book, selected).exceptions.map(e => (
                      <p key={e.id}><strong>{e.title}</strong>：{e.text}</p>
                    ))}
                    {totals && (
                      <>
                        <p>
                          合计 {money(totals.total)} · 你承担{" "}
                          {money(totals.selfAmount)}
                        </p>
                        {totals.members
                          .filter((m) => !m.self && m.amount > 0)
                          .map((m) => (
                            <div className="expense-person" key={m.id}>
                              <span>{m.name}</span>
                              <strong>{money(m.amount)}</strong>
                            </div>
                          ))}
                        <button
                          className="expense-primary"
                          onClick={() => void submitSettlement()}
                        >
                          没问题，去微信确认收款 {money(totals.collectAmount)}
                          <ArrowUpRight size={16} />
                        </button>
                      </>
                    )}
                    {reviewError && <p role="alert">{reviewError}</p>}
                    <button onClick={() => onPrompt("调整这次分摊：")}>调整分摊</button>
                    <button onClick={() => setReview(false)}>继续记录</button>
                  </div>
                )}
                {book.batches.map((batch) => (
                  <div className="expense-batch" key={batch.id}>
                    <strong>
                      {batch.entryIds.length} 笔消费 ·{" "}
                      {batch.status === "prepared"
                        ? "等待微信确认"
                        : "已发起群收款"}
                    </strong>
                    {batch.status === "prepared" ? (
                      <>
                        <p>这些记录已锁定，避免重复发起。</p>
                        <button
                          onClick={() =>
                            void run(async () => {
                              await load();
                              await publish(batch, book);
                            })
                          }
                        >
                          继续微信确认
                        </button>
                        <button onClick={() => void reconcile(batch)}>
                          核对结果
                        </button>
                        <button onClick={() => void reconcile(batch, true)}>
                          返回修改
                        </button>
                      </>
                    ) : (
                      <>
                        <p>
                          {(() => {
                            const c = records.find((r) => r.id === batch.id);
                            return c
                              ? c.status === "cancelled"
                                ? "微信已取消；未自动重新收费"
                                : `${money(c.members.filter((m) => !m.self && m.paid).reduce((n, m) => n + m.amount, 0))} / ${money(c.collectAmount)} 已收`
                              : "收款进度以微信回执为准";
                          })()}
                        </p>
                        <button
                          onClick={() =>
                            void run(async () => {
                              const r = await groupAARequest("records", {
                                groupId: book.group.id,
                              });
                              setRecords(r.collections ?? []);
                            })
                          }
                        >
                          查看收款进度
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {setup && (
          <div className="expense-setup">
            <h3>把这次消费记在一起</h3>
            <p>选好参与人，接下来只要说消费。默认由你垫付，单笔可单独说明。</p>
            {pending && <p className="expense-original">你的交代：{pending}</p>}
            <label>
              活动名称
              <input
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                void run(async () => {
                  const r = await groupAARequest("choose");
                  if (r.group) {
                    setGroup(r.group);
                    setPeople(
                      r.group.members.filter((m) => m.self).map((m) => m.id),
                    );
                  }
                })
              }
            >
              从微信选择群
            </button>
            {group && (
              <>
                <strong>{group.name}</strong>
                <div className="expense-people">
                  {group.members.map((m) => (
                    <label key={m.id}>
                      <input
                        type="checkbox"
                        checked={people.includes(m.id)}
                        disabled={m.self}
                        onChange={(e) =>
                          setPeople(
                            e.target.checked
                              ? [...people, m.id]
                              : people.filter((id) => id !== m.id),
                          )
                        }
                      />
                      {m.avatar && <img src={m.avatar} alt="" />}
                      {m.self ? "我（垫付人）" : m.name}
                    </label>
                  ))}
                </div>
                <button
                  className="expense-primary"
                  disabled={!people.length || !title.trim()}
                  onClick={() => void create()}
                >
                  开始记录
                </button>
              </>
            )}
            <button onClick={() => setSetup(false)}>暂不开始</button>
          </div>
        )}
      </fieldset>
      {busy && <p role="status">正在处理，请稍候…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">
          {error}
          <button
            onClick={() =>
              void run(async () => {
                await load();
              })
            }
          >
            重新读取
          </button>
        </p>
      )}
    </section>
  );
});
