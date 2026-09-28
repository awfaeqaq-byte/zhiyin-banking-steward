/* Operate: one editable plan, member selection and natural language share the same state.
 * Existing Zhiyin teal/ink, no new identity. WeChat alone confirms publication. */
import { useEffect, useRef, useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  Undo2,
  Send,
  ArrowUpRight,
  Check,
  Search,
} from "lucide-react";
import {
  calculateGroupAA,
  groupAARequest,
  requestGroupAAPlan,
  type AAGroup,
  type AAPlan,
  type AACollection,
} from "../lib/group-aa";
import { formatCny } from "../lib/financial-connections";
import "./group-aa.css";
export function GroupAA() {
  const [group, setGroup] = useState<AAGroup | null>(null);
  const [plan, setPlan] = useState<AAPlan>({ title: "聚餐AA", items: [] });
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ plan: AAPlan; selected: string[] } | null>(
    null,
  );
  const [review, setReview] = useState(false);
  const [records, setRecords] = useState<AACollection[]>([]);
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const id = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const version = useRef(0);
  let result: ReturnType<typeof calculateGroupAA> | null = null;
  let validation = "";
  if (group && plan.items.length)
    try {
      result = calculateGroupAA(group, plan);
    } catch (e) {
      validation = e instanceof Error ? e.message : "方案未完整";
    }
  function edit(next: AAPlan) {
    version.current++;
    id.current = crypto.randomUUID();
    setUndo({ plan, selected });
    setPlan(next);
    setReview(false);
  }
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成，请重试");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function choose() {
    await run(async () => {
      const response = await groupAARequest("choose");
      if (!response.group) throw new Error("未返回群成员");
      setGroup(response.group);
      setPlan({ title: "聚餐AA", items: [] });
      setSelected([response.group.members.find((m) => m.self)!.id]);
      setRecords([]);
      setUndo(null);
      setReview(false);
      history.current = [];
      version.current++;
      setMessage("选择实际参与的人，再添加费用；也可以直接告诉我分摊规则。");
    });
  }
  async function refresh() {
    if (!group) return;
    try {
      const response = await groupAARequest("records", { groupId: group.id });
      setRecords(response.collections ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "收款进度暂不可用");
    }
  }
  useEffect(() => {
    if (!group) return;
    const refreshRecords = () =>
      void groupAARequest("records", { groupId: group.id })
        .then((r) => setRecords(r.collections ?? []))
        .catch((e) => setError(e.message));
    refreshRecords();
    window.addEventListener("zhiyin-phone-foreground", refreshRecords);
    return () =>
      window.removeEventListener("zhiyin-phone-foreground", refreshRecords);
  }, [group]);
  function addItem() {
    if (!selected.length) {
      setError("先选择这笔费用的参与人");
      return;
    }
    edit({
      ...plan,
      items: [
        ...plan.items,
        {
          id: crypto.randomUUID(),
          title: "共同费用",
          amount: 0,
          shares: selected.map((memberId) => ({ memberId, weight: 2 })),
        },
      ],
    });
  }
  async function ask() {
    if (!group || !prompt.trim()) return;
    const text = prompt;
    const epoch = version.current;
    await run(async () => {
      const response = await requestGroupAAPlan(
        group,
        plan,
        text,
        history.current,
        selected,
      );
      if (epoch !== version.current)
        throw new Error("方案已经改变，请基于当前方案重新说明");
      if (response.plan) {
        edit(response.plan);
        setSelected([
          ...new Set(
            response.plan.items.flatMap((i) => i.shares.map((s) => s.memberId)),
          ),
        ]);
      }
      if (response.selectedMemberIds) {
        if (!response.plan) setUndo({ plan, selected });
        setSelected(response.selectedMemberIds);
      }
      setMessage(response.message);
      history.current = [
        ...history.current,
        { role: "user", content: text },
        { role: "assistant", content: response.message },
      ].slice(-6) as typeof history.current;
      setPrompt("");
    });
  }
  async function publish() {
    if (!group || !result || !review) return;
    await run(async () => {
      const response = await groupAARequest("publish", {
        id: id.current,
        groupId: group.id,
        revision: group.revision,
        plan,
      });
      if (!response.collection)
        throw new Error("尚未收到微信的收款回执，请刷新记录核对");
      setRecords((current) => [
        response.collection!,
        ...current.filter((c) => c.id !== response.collection!.id),
      ]);
      setMessage("微信已发起群收款。等待成员付款，不代表已经到账。");
      setReview(false);
      setPlan({ title: "聚餐AA", items: [] });
      setUndo(null);
      id.current = crypto.randomUUID();
    });
  }
  return (
    <section className="group-aa" aria-label="微信群智能AA">
      <p className="aa-intro">
        点选参与人，把复杂的分摊交给宁宁。<span>沙箱联动 · 不读取真实微信</span>
      </p>
      {!group ? (
        <div className="aa-connect">
          <Users size={36} />
          <h2>从已有微信群开始</h2>
          <p>
            在微信里选择一个群，确认共享该群成员。无需加好友，也不用在知银登记。
          </p>
          <button
            className="aa-primary"
            disabled={busy}
            onClick={() => void choose()}
          >
            {busy ? "等待微信确认…" : "从微信选择群"}
            <ArrowUpRight size={17} />
          </button>
        </div>
      ) : (
        <>
          <div className="aa-group-heading">
            <span>
              <strong>{group.name}</strong>
              <small>{group.members.length} 位群成员 · 仅授权此群</small>
            </span>
            <button disabled={busy} onClick={() => void choose()}>
              换群
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await groupAARequest("revoke", { groupId: group.id });
                  setGroup(null);
                  setRecords([]);
                })
              }
            >
              断开
            </button>
          </div>
          <fieldset disabled={busy} className="aa-editor">
            <legend className="sr-only">配置AA方案</legend>
            <div className="aa-members-heading">
              <h2>谁参与这次费用？</h2>
              <span>
                <button
                  type="button"
                  onClick={() => setSelected(group.members.map((m) => m.id))}
                >
                  全选
                </button>
                <button type="button" onClick={() => setSelected([])}>
                  清空
                </button>
              </span>
            </div>
            <p className="aa-selected-count">已选 {selected.length} 人{selected.some(id=>group.members.find(m=>m.id===id)?.self)?'（含自己）':''}</p>
            <label className="aa-search">
              <Search size={16} />
              <input
                aria-label="搜索群成员"
                placeholder="搜索群昵称或身份"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="aa-members">
              {group.members
                .filter((m) => `${m.name} ${m.note ?? ""}`.includes(search))
                .map((m) => (
                  <label
                    key={m.id}
                    className={selected.includes(m.id) ? "chosen" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(m.id)
                            ? current.filter((id) => id !== m.id)
                            : [...current, m.id],
                        )
                      }
                    />
                    <span className="aa-avatar" aria-hidden="true">
                      {m.name.slice(0, 1)}
                    </span>
                    <span>
                      {m.self ? "我（自己）" : m.name}
                      <small>
                        {m.self
                          ? "可参与分摊，不向自己收款"
                          : m.note || "群成员"}
                      </small>
                    </span>
                  </label>
                ))}
            </div>
            <p className="aa-hint">
              上方选择用于新增费用；已有费用的参与人可逐项调整。
            </p>
            <div className="aa-section-heading">
              <h2>费用与分摊</h2>
              <button onClick={addItem} disabled={plan.items.length >= 20}>
                <Plus size={16} />
                添加费用
              </button>
            </div>
            {!!plan.items.length && (
              <label className="aa-title">
                活动名称
                <input
                  value={plan.title}
                  maxLength={60}
                  onChange={(e) => edit({ ...plan, title: e.target.value })}
                />
              </label>
            )}
            {!plan.items.length && (
              <p className="aa-empty">
                还没有费用。添加一项，或在下方告诉宁宁怎么分。
              </p>
            )}
            {plan.items.map((item, index) => (
              <div className="aa-item" key={item.id}>
                <div className="aa-item-fields">
                  <label>
                    费用名称
                    <input
                      aria-label={`费用${index + 1}名称`}
                      maxLength={60}
                      value={item.title}
                      onChange={(e) =>
                        edit({
                          ...plan,
                          items: plan.items.map((i) =>
                            i.id === item.id
                              ? { ...i, title: e.target.value }
                              : i,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    金额（元）
                    <input
                      aria-label={`费用${index + 1}金额`}
                      inputMode="decimal"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.amount ? item.amount / 100 : ""}
                      onChange={(e) =>
                        edit({
                          ...plan,
                          items: plan.items.map((i) =>
                            i.id === item.id
                              ? {
                                  ...i,
                                  amount: Math.round(
                                    Number(e.target.value) * 100,
                                  ),
                                }
                              : i,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    aria-label={`删除费用${index + 1}`}
                    onClick={() =>
                      edit({
                        ...plan,
                        items: plan.items.filter((i) => i.id !== item.id),
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <details>
                  <summary>{item.shares.length} 人参与 · 点选修改份数</summary>
                  <div className="aa-share-picker">
                    {group.members.map((m) => {
                      const share = item.shares.find(
                        (s) => s.memberId === m.id,
                      );
                      return (
                        <label key={m.id}>
                          <input
                            type="checkbox"
                            checked={!!share}
                            onChange={() =>
                              edit({
                                ...plan,
                                items: plan.items.map((i) =>
                                  i.id === item.id
                                    ? {
                                        ...i,
                                        shares: share
                                          ? i.shares.filter(
                                              (s) => s.memberId !== m.id,
                                            )
                                          : [
                                              ...i.shares,
                                              { memberId: m.id, weight: 2 },
                                            ],
                                      }
                                    : i,
                                ),
                              })
                            }
                          />
                          <span>
                            {m.self ? "我" : m.name}
                            <small>{m.note}</small>
                          </span>
                          {share && (
                            <select
                              aria-label={`${item.title} ${m.name} ${m.note ?? ""}份数`}
                              value={share.weight}
                              onChange={(e) =>
                                edit({
                                  ...plan,
                                  items: plan.items.map((i) =>
                                    i.id === item.id
                                      ? {
                                          ...i,
                                          shares: i.shares.map((s) =>
                                            s.memberId === m.id
                                              ? {
                                                  ...s,
                                                  weight: Number(
                                                    e.target.value,
                                                  ),
                                                }
                                              : s,
                                          ),
                                        }
                                      : i,
                                  ),
                                })
                              }
                            >
                              {[...new Set([1, 2, 4, 6, share.weight])]
                                .sort((a, b) => a - b)
                                .map((w) => (
                                  <option key={w} value={w}>
                                    {w / 2} 份
                                  </option>
                                ))}
                            </select>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </details>
              </div>
            ))}
            <div className="aa-ask">
              <label htmlFor="aa-prompt">告诉宁宁怎么调整</label>
              <textarea
                id="aa-prompt"
                rows={2}
                maxLength={1000}
                placeholder="例如：晚饭600元，刚才选的人均摊；酒水180元只算我和李娜"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <button
                className="aa-primary"
                disabled={!prompt.trim()}
                onClick={() => void ask()}
              >
                <Send size={16} />
                整理方案
              </button>
            </div>
          </fieldset>
          {busy && <p role="status">正在处理，请在微信确认或等待宁宁回复…</p>}
          {message && (
            <div className="aa-message" role="status">
              {message}
              {undo && (
                <button
                  disabled={busy}
                  onClick={() => {
                    const previous = undo;
                    setUndo(null);
                    setPlan(previous.plan);
                    setSelected(previous.selected);
                    version.current++;
                    setReview(false);
                    id.current = crypto.randomUUID();
                    setMessage("已撤销上一次方案修改。");
                  }}
                >
                  <Undo2 size={15} />
                  撤销修改
                </button>
              )}
            </div>
          )}
          {validation && <p className="aa-validation">{validation}</p>}
          {result && (
            <section className="aa-result" aria-label="AA分摊结果">
              <h2>每个人承担多少</h2>
              {result.members.map((m) => (
                <div key={m.id}>
                  <span>
                    {m.self ? "我（自己承担）" : m.name}
                    <small>{m.note}</small>
                  </span>
                  <strong>{formatCny(m.amount)}</strong>
                </div>
              ))}
              <div className="aa-total">
                <span>
                  总费用 {formatCny(result.total)}
                  <small>自己承担 {formatCny(result.selfAmount)}</small>
                </span>
                <strong>待收 {formatCny(result.collectAmount)}</strong>
              </div>
              <p>按每项份数计算；不足一分的尾差按固定规则分配，总额不变。</p>
              {!review ? (
                <button
                  className="aa-primary"
                  disabled={busy || result.collectAmount <= 0}
                  onClick={() => setReview(true)}
                >
                  核对群收款
                  <Check size={16} />
                </button>
              ) : (
                <>
                  <p>
                    将向「{group.name}
                    」内上列其他参与人收取各自金额，不向全群收款。
                  </p>
                  <button
                    className="aa-primary"
                    disabled={busy}
                    onClick={() => void publish()}
                  >
                    去微信确认发起
                    <ArrowUpRight size={16} />
                  </button>
                  <button disabled={busy} onClick={() => setReview(false)}>
                    返回修改
                  </button>
                </>
              )}
            </section>
          )}
          <section className="aa-records">
            <div className="aa-section-heading">
              <h2>这个群的收款</h2>
              <button disabled={busy} onClick={() => void refresh()}>
                刷新进度
              </button>
            </div>
            {!records.length ? (
              <p>暂无已发起的收款。</p>
            ) : (
              records.map((c) => (
                <details key={c.id}>
                  <summary>
                    {c.plan.title}
                    <span>
                      {c.status === "completed"
                        ? "已收齐"
                        : c.status === "cancelled"
                          ? "已停止收款"
                          : `${c.members.filter((m) => !m.self && m.paid).length}/${c.members.filter((m) => !m.self).length} 人已付`}
                    </span>
                  </summary>
                  {c.members
                    .filter((m) => !m.self)
                    .map((m) => (
                      <div className="aa-record-row" key={m.id}>
                        <span>
                          {m.name} · {m.note}
                        </span>
                        <span>
                          {formatCny(m.amount)} · {m.paid ? "已付" : "未付"}
                        </span>
                      </div>
                    ))}
                  <p>到账以微信沙箱回执为准，可在微信该群内模拟成员付款。</p>
                </details>
              ))
            )}
          </section>
        </>
      )}
      {error && (
        <p className="aa-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
