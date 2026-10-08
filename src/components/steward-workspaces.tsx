import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { ChevronDown, Archive, Layers, Plus, ArrowUpRight, Check } from "lucide-react";
import { Dialog } from "./ui/dialog";
import { StewardChatHome } from "./steward-chat-home";
import {
  emptyWorkspaces,
  workspaceKinds,
  workspaceLabels,
  type WorkspaceOperation,
  type WorkspaceKind,
} from "../lib/workspaces";
import {
  workspaceRequest,
  routeWorkspacePrompt,
} from "../lib/workspace-service";
import "./steward-workspaces.css";
type Props = ComponentProps<typeof StewardChatHome> & {
  route?: typeof routeWorkspacePrompt;
};
type Queued = { id: string; text: string; token: string };
/** Existing-world extension: quiet task switcher, one task's conversation at a time.
 * Task archive never cancels bank schedules or settles AA collections. */
export function StewardWorkspaces({
  route = routeWorkspacePrompt,
  ...props
}: Props) {
  const [state, setState] = useState(emptyWorkspaces);
  const current = useRef(state);
  const [active, setActive] = useState(
    () => localStorage.getItem("zhiyin-workspace-active") || "",
  );
  const [loaded, setLoaded] = useState(false),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [title, setTitle] = useState(""),
    [kind, setKind] = useState<WorkspaceKind>("general");
  const [manual, setManual] = useState(false),
    [archived, setArchived] = useState(false);
  const [management,setManagement] = useState(false);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [injected, setInjected] = useState<Queued>();
  const clarify = useRef("");
  const receiptOwner = useRef(
    localStorage.getItem("zhiyin-transfer-workspace") || "",
  );
  const work = state.items.find(
    (w) => w.id === active && w.status === "active",
  );
  const accept = useCallback((next: typeof state) => {
    current.current = next;
    setState(next);
    return next;
  }, []);
  const load = useCallback(async () => {
    try {
      accept(await workspaceRequest());
      setLoaded(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "任务暂时无法载入");
    }
  }, [accept]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(operation: WorkspaceOperation) {
    const latest = await workspaceRequest();
    accept(latest);
    return accept(await workspaceRequest(operation, latest.revision));
  }
  function select(id: string) {
    setActive(id);
    localStorage.setItem("zhiyin-workspace-active", id);
    setOpen(false);
    setManagement(false);
    setNotice("");
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "任务操作失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    await run(async () => {
      const id = crypto.randomUUID();
      await save({ type: "create", id, title, kind });
      select(id);
      setTitle("");
    });
  }
  async function arrange(text: string) {
    if (busy || injected || !loaded) return;
    setBusy(true);
    setError("");
    setNotice("正在整理到对应任务…");
    try {
      const latest = await workspaceRequest();
      accept(latest);
      const source = clarify.current
        ? `${clarify.current}；补充：${text}`
        : text;
      if (clarify.current && /^(取消|不用了|算了)[。！! ]*$/.test(text)) {
        clarify.current = "";
        setNotice("好，刚才的请求没有执行。");
        return;
      }
      const result =
        manual && work
          ? {
              parts: [
                {
                  taskId: work.id,
                  title: work.title,
                  kind: work.kind,
                  text: source,
                },
              ],
            }
          : await route(source, latest.items, work?.id || "");
      if (result.clarification) {
        clarify.current = source;
        setNotice(result.clarification);
        return;
      }
      clarify.current = "";
      const items: Queued[] = [];
      for (const part of result.parts) {
        const id = part.taskId || crypto.randomUUID();
        if (!part.taskId)
          await save({
            type: "create",
            id,
            title: part.title,
            kind: part.kind,
          });
        const token = crypto.randomUUID();
        await save({ type: "enqueue", id, token, text: part.text });
        items.push({ id, text: part.text, token });
      }
      select(items[0].id);
      setQueue(items.slice(1));
      setInjected(items[0]);
      setNotice(
        items.length > 1
          ? `已分到 ${items.length} 个任务，逐项整理；付款仍需你确认。`
          : "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能整理任务");
      setNotice("原请求未执行。可以重试，或打开任务窗口手动选择。");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function completed(
    user: string,
    assistant: string,
    revision: number,
    failed: boolean,
  ) {
    setBusy(true);
    try {
      if (!work) throw new Error("当前任务已关闭，未能保存对话");
      await save({
        type: "turn",
        id: work.id,
        user,
        assistant,
        memoryRevision: revision,
        token: injected?.token,
      });
      setInjected(undefined);
      // Keep each result visible. A second task runs only when the user continues.
      if (queue.length)
        setNotice(
          failed
            ? "这一项未完成；其余任务还在等待，你可以先处理错误。"
            : "这一项已整理。还有其他任务，准备好后继续。",
        );
    } catch (e) {
      setInjected(undefined);
      setError(
        `${e instanceof Error ? e.message : "对话未保存"}。当前答复仍在此页，请勿重复提交资金操作。`,
      );
    } finally {
      setBusy(false);
    }
  }
  const blocked = busy || !!injected;
  return (
    <div className="steward-workspaces">
      <nav className="workspace-bar" aria-label="当前任务">
        <button
          onClick={() => setOpen(!open)}
          disabled={blocked || !loaded}
          aria-expanded={open}
          aria-label="任务窗口"
        >
          <Layers size={17} />
          <span>{work?.title || "任务窗口"}</span>
          <ChevronDown size={15} />
        </button>
        {work && (
          <button disabled={blocked} onClick={() => select("")}>
            回到首页
          </button>
        )}
      </nav>
      {error && (
        <div className="workspace-feedback" role="alert">
          {error}
          {!loaded && <button onClick={() => void load()}>重新载入</button>}
        </div>
      )}
      {notice && (
        <p className="workspace-feedback" role="status">
          {notice}
        </p>
      )}
      {queue.length > 0 && !injected && !busy && (
        <div className="workspace-next">
          <button
            onClick={() => {
              const [next, ...rest] = queue;
              select(next.id);
              setQueue(rest);
              setInjected(next);
            }}
          >
            继续：{state.items.find((w) => w.id === queue[0].id)?.title}
          </button>
          <button
            onClick={() => {
              setQueue([]);
              setNotice("其余交代已保留在各自任务里，尚未执行。");
            }}
          >
            稍后处理
          </button>
        </div>
      )}
      {!queue.length &&
        !injected &&
        !busy &&
        work?.pending?.map((p) => (
          <div className="workspace-pending" key={p.token}>
            <p>待处理：{p.text}</p>
            <div className="workspace-next">
              <button onClick={() => setInjected({ id: work.id, ...p })}>
                继续这条交代
              </button>
              <button
                onClick={() =>
                  void run(async () => {
                    await save({
                      type: "discard",
                      id: work.id,
                      token: p.token,
                    });
                  })
                }
              >
                不再处理
              </button>
            </div>
          </div>
        ))}
      <Dialog open={open} onOpenChange={value=>{setOpen(value);if(!value)setManagement(false);}} title="手头的事情" description="挑一件继续，之前的交代留在各自任务里。" className="workspace-dialog">
        <section className="workspace-list" aria-label="任务窗口列表">
          <button className="workspace-new-intent" disabled={blocked} onClick={()=>select("")}><Plus size={18} aria-hidden="true"/><span><strong>交代一件新事情</strong><small>直接说，{props.stewardName}来整理</small></span><ArrowUpRight size={18} aria-hidden="true"/></button>
          <div className="workspace-tabs">
            <button aria-pressed={!archived} onClick={() => setArchived(false)}>
              进行中
            </button>
            <button aria-pressed={archived} onClick={() => setArchived(true)}>
              已收起
            </button>
          </div>
          <ul>
            {state.items
              .filter((w) =>
                archived ? w.status === "archived" : w.status === "active",
              )
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((w) => (
                <li key={w.id}>
                  <button
                    aria-label={`打开${w.title}`}
                    onClick={() =>
                      void run(async () => {
                        if (w.status === "archived")
                          await save({
                            type: "status",
                            id: w.id,
                            status: "active",
                          });
                        select(w.id);
                      })
                    }
                    disabled={blocked}
                  >
                    <span className="workspace-item-heading"><strong>{w.title}</strong>{active===w.id&&<span className="workspace-current"><Check size={13} aria-hidden="true"/>当前</span>}</span>
                    <small className="workspace-preview">{w.pending?.[0]?.text || [...w.messages].reverse().find(m=>m.role==='user')?.content || '还没交代细节，打开后告诉我。'}</small>
                    <span className="workspace-resume">{w.status==='archived'?'恢复并继续':w.pending?.length?'有交代等你继续':'接着处理'}<ArrowUpRight size={14} aria-hidden="true"/></span>
                  </button>
                  {w.status === "active" && (
                    <button
                      className="workspace-archive"
                      aria-label={`收起${w.title}`}
                      disabled={blocked}
                      onClick={() =>
                        void run(async () => {
                          await save({
                            type: "status",
                            id: w.id,
                            status: "archived",
                          });
                          if (active === w.id) select("");
                        })
                      }
                    >
                      <Archive size={18} />
                    </button>
                  )}
                </li>
              ))}
          </ul>
          {!state.items.some((w) =>
            archived ? w.status === "archived" : w.status === "active",
          ) && (
            <p>
              {archived
                ? "还没有收起的任务。"
                : "还没有进行中的事情。直接说想做什么，我来整理。"}
            </p>
          )}
          <details className="workspace-management" open={management}>
          <summary onClick={e=>{e.preventDefault();setManagement(v=>!v);}}>更多管理</summary>
          {management&&<>
          <label className="workspace-routing"><input type="checkbox" checked={!manual} onChange={e=>setManual(!e.target.checked)}/>让{props.stewardName}自动分配到对应任务</label>
          <p>通常不用建立窗口。需要时，也可以自己命名。</p>
          <form
            className="workspace-create"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label>
              任务名称
              <input
                required
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：周末旅行 AA"
              />
            </label>
            <label>
              任务类型
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as WorkspaceKind)}
              >
                {workspaceKinds.map((k) => (
                  <option key={k} value={k}>
                    {workspaceLabels[k]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={blocked || !title.trim()}>
              <Plus size={17} />
              开始任务
            </button>
          </form>
          <p className="workspace-footnote">
            收起只整理对话，不取消预约、不结束收款。历史答复不是实时回执。
          </p>
          </>}
          </details>
        </section>
      </Dialog>
        <StewardChatHome
          {...props}
          bankReceipt={
            receiptOwner.current === work?.id ? props.bankReceipt : null
          }
          onPrepareTransfer={
            props.onPrepareTransfer
              ? (intent) => {
                  receiptOwner.current = work?.id || "";
                  localStorage.setItem(
                    "zhiyin-transfer-workspace",
                    receiptOwner.current,
                  );
                  props.onPrepareTransfer?.(intent);
                }
              : undefined
          }
          key={work?.id || "lobby"}
          workspace={work || null}
          onRoutePrompt={arrange}
          externalBusy={blocked || !loaded}
          injectedPrompt={injected?.id === work?.id ? injected : undefined}
          onTurnComplete={completed}
          onWorkspaceBook={async (expenseBookId) => {
            if (work) await save({ type: "link", id: work.id, expenseBookId });
          }}
        />
    </div>
  );
}
