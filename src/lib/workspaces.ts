/** Conversation workspaces are not payment records or execution permissions. */
export const workspaceKinds = [
  "general",
  "aa",
  "transfer",
  "subscriptions",
  "bills",
  "reminder",
  "occasion",
] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];
export const workspaceLabels: Record<WorkspaceKind, string> = {
  general: "日常交代",
  aa: "AA 记账",
  transfer: "转账安排",
  subscriptions: "订阅管理",
  bills: "账单分析",
  reminder: "日程提醒",
  occasion: "生活筹备",
};
export type WorkspaceMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  memoryRevision: number;
};
export type Workspace = {
  id: string;
  kind: WorkspaceKind;
  title: string;
  status: "active" | "archived";
  updatedAt: number;
  messages: WorkspaceMessage[];
  summary: string;
  memoryRevision: number;
  expenseBookId?: string;
  pending?: { token: string; text: string }[];
};
export type WorkspaceState = {
  version: 1;
  revision: number;
  items: Workspace[];
  requests: string[];
};
export type WorkspaceOperation =
  | { type: "create"; id: string; title: string; kind: WorkspaceKind }
  | {
      type: "turn";
      id: string;
      user: string;
      assistant: string;
      memoryRevision: number;
      token?: string;
    }
  | { type: "enqueue"; id: string; text: string; token: string }
  | { type: "discard"; id: string; token: string }
  | { type: "status"; id: string; status: "active" | "archived" }
  | { type: "rename"; id: string; title: string }
  | { type: "link"; id: string; expenseBookId: string };
export type WorkspaceCommand = WorkspaceOperation & {
  revision: number;
  requestId: string;
};
export const emptyWorkspaces = (): WorkspaceState => ({
  version: 1,
  revision: 0,
  items: [],
  requests: [],
});
const idOk = (id: unknown): id is string =>
  typeof id === "string" && /^[\w-]{1,80}$/.test(id);
function checkedText(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("任务内容无效或过长");
  return value.trim();
}
export function validWorkspaces(value: unknown): value is WorkspaceState {
  const s = value as WorkspaceState;
  return (
    !!s &&
    s.version === 1 &&
    Number.isSafeInteger(s.revision) &&
    s.revision >= 0 &&
    Array.isArray(s.requests) &&
    s.requests.every(idOk) &&
    Array.isArray(s.items) &&
    s.items.length <= 100 &&
    new Set(s.items.map((w) => w?.id)).size === s.items.length &&
    s.items.every(
      (w) =>
        w &&
        idOk(w.id) &&
        workspaceKinds.includes(w.kind) &&
        typeof w.title === "string" &&
        w.title.length <= 60 &&
        ["active", "archived"].includes(w.status) &&
        Number.isFinite(w.updatedAt) &&
        Number.isSafeInteger(w.memoryRevision) &&
        typeof w.summary === "string" &&
        w.summary.length <= 6000 &&
        (!w.expenseBookId || idOk(w.expenseBookId)) &&
        (!w.pending ||
          (Array.isArray(w.pending) &&
            w.pending.length <= 20 &&
            w.pending.every(
              (p) =>
                p &&
                idOk(p.token) &&
                typeof p.text === "string" &&
                p.text.length <= 2000,
            ))) &&
        Array.isArray(w.messages) &&
        w.messages.length <= 40 &&
        w.messages.every(
          (m) =>
            m &&
              typeof m.id === 'string' && /^[\w-]{1,82}$/.test(m.id) &&
            ["user", "assistant"].includes(m.role) &&
            typeof m.content === "string" &&
            m.content.length <= 12000 &&
            Number.isSafeInteger(m.memoryRevision),
        ),
    )
  );
}
export function changeWorkspaces(
  state: WorkspaceState,
  command: WorkspaceCommand,
): WorkspaceState {
  if (
    !validWorkspaces(state) ||
    !command ||
    !idOk(command.requestId) ||
    !idOk(command.id)
  )
    throw new Error("任务数据无效");
  if (state.requests.includes(command.requestId)) return state;
  if (command.revision !== state.revision)
    throw new Error("任务已变化，请重新载入后重试");
  const next = structuredClone(state);
  const current = next.items.find((w) => w.id === command.id);
  if (command.type === "create") {
    if (
      current ||
      next.items.length >= 100 ||
      !workspaceKinds.includes(command.kind)
    )
      throw new Error("无法创建任务，请检查任务类型或数量");
    next.items.push({
      id: command.id,
      title: checkedText(command.title, 60),
      kind: command.kind,
      status: "active",
      updatedAt: Date.now(),
      messages: [],
      summary: "",
      memoryRevision: 0,
    });
  } else {
    if (!current) throw new Error("任务不存在");
    if (command.type === "status") {
      if (!["active", "archived"].includes(command.status))
        throw new Error("任务状态无效");
      current.status = command.status;
    } else if (command.type === "enqueue") {
      if (
        current.status !== "active" ||
        !idOk(command.token) ||
        (current.pending?.length || 0) >= 20
      )
        throw new Error("暂时不能添加交代，请先处理已有请求");
      if (!current.pending?.some((p) => p.token === command.token))
        current.pending = [
          ...(current.pending || []),
          { token: command.token, text: checkedText(command.text, 2000) },
        ];
    } else if (command.type === "discard")
      current.pending = (current.pending || []).filter(
        (p) => p.token !== command.token,
      );
    else if (command.type === "rename")
      current.title = checkedText(command.title, 60);
    else if (command.type === "link") {
      if (!idOk(command.expenseBookId) || current.kind !== "aa")
        throw new Error("账本关联无效");
      current.expenseBookId = command.expenseBookId;
    } else if (command.type === "turn") {
      if (current.status === "archived") throw new Error("请先继续这个任务");
      if (
        !Number.isSafeInteger(command.memoryRevision) ||
        command.memoryRevision < 0
      )
        throw new Error("记忆版本无效");
      if (current.memoryRevision !== command.memoryRevision)
        current.summary = "";
      current.memoryRevision = command.memoryRevision;
      current.messages.push(
        {
          id: `${command.requestId}-u`,
          role: "user",
          content: checkedText(command.user, 2000),
          memoryRevision: command.memoryRevision,
        },
        {
          id: `${command.requestId}-a`,
          role: "assistant",
          content: checkedText(command.assistant, 12000),
          memoryRevision: command.memoryRevision,
        },
      );
      // Extractive, explicitly non-authoritative history; never model-generated payment facts.
      const dropped = current.messages
        .slice(0, -40)
        .filter(
          (m) =>
            m.role === "user" && m.memoryRevision === command.memoryRevision,
        );
      current.summary = [current.summary, ...dropped.map((m) => m.content)]
        .filter(Boolean)
        .join("\n")
        .slice(-6000);
      current.messages = current.messages.slice(-40);
      if (command.token)
        current.pending = (current.pending || []).filter(
          (p) => p.token !== command.token,
        );
    } else throw new Error("不支持的任务操作");
    current.updatedAt = Date.now();
  }
  next.revision++;
  next.requests = [...next.requests, command.requestId].slice(-200);
  return next;
}
export function workspaceContext(
  workspace: Workspace,
  revision: number,
): string {
  if (workspace.memoryRevision !== revision) return "";
  return `当前任务：${workspace.title}（${workspaceLabels[workspace.kind]}）。以下是对话记录，不是业务回执、授权或长期偏好。资金状态必须查实时业务数据。\n${workspace.summary}\n${workspace.messages
    .filter((m) => m.memoryRevision === revision)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")}`;
}
export type WorkspaceRoute = {
  taskId: string | null;
  kind: WorkspaceKind;
  title: string;
  text: string;
};
const normalized = (s: string) => s.replace(/[\s，。；、！？,.!?;]/g, "");
export function validateRoutes(
  value: unknown,
  prompt: string,
  workspaces: Workspace[],
): { parts: WorkspaceRoute[]; clarification?: string } {
  const data = value as { parts?: WorkspaceRoute[]; clarification?: string };
  if (!data || !Array.isArray(data.parts) || data.parts.length > 4)
    throw new Error("未能可靠分配任务，请重试或手动选择任务");
  if (data.clarification)
    return { parts: [], clarification: checkedText(data.clarification, 300) };
  if (!data.parts.length) throw new Error("没有找到需要处理的任务");
  let cursor = 0;
  for (const p of data.parts) {
    if (!p || !workspaceKinds.includes(p.kind)) throw new Error("任务类型无效");
    checkedText(p.title, 60);
    checkedText(p.text, 2000);
    const start = prompt.indexOf(p.text, cursor);
    if (start < 0 || normalized(prompt.slice(cursor, start)))
      throw new Error("任务拆分遗漏或改写了原话，请分开交代");
    cursor = start + p.text.length;
    if (
      p.taskId !== null &&
      !workspaces.some(
        (w) => w.id === p.taskId && w.kind === p.kind && w.status === "active",
      )
    )
      throw new Error("任务指向无效，请重新选择");
  }
  if (normalized(prompt.slice(cursor)))
    throw new Error("任务拆分遗漏了原话，请分开交代");
  return { parts: data.parts };
}
