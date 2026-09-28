import { createServer } from "vite";
import assert from "node:assert/strict";
const loader = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) =>
  originalFetch(
    typeof url === "string" && url.startsWith("/")
      ? `http://localhost:3000${url}`
      : url,
    init,
  );
try {
  const { requestGroupAAPlan, calculateGroupAA } = await loader.ssrLoadModule(
    "/src/lib/group-aa.ts",
  );
  const group = {
    id: "test-only",
    name: "模型测试群",
    revision: 1,
    members: [
      { id: "self", name: "我", self: true, gender: "male" },
      { id: "li", name: "李娜", gender: "female" },
      { id: "wang", name: "小王", gender: "male" },
    ],
  };
  const response = await requestGroupAAPlan(
    group,
    { title: "聚餐", items: [] },
    "晚饭600元，刚才选中的人均摊。另有酒水180元只算我和李娜，李娜喝半份我喝整份。",
    [],
    ["self", "li", "wang"],
  );
  assert.ok(response.plan, "Expected a plan");
  const result = calculateGroupAA(group, response.plan);
  assert.equal(result.total, 78000);
  assert.equal(result.members.find((m) => m.id === "wang").amount, 20000);
  assert.equal(result.members.find((m) => m.id === "li").amount, 26000);
  assert.equal(result.selfAmount, 32000);
  const selected = await requestGroupAAPlan(
    group,
    { title: "聚餐", items: [] },
    "先只帮我选李娜和小王，不含我，还没确定费用。",
    [],
    ["self"],
  );
  assert.equal(selected.plan, undefined);
  assert.deepEqual([...selected.selectedMemberIds].sort(), ["li", "wang"]);
  const half = await requestGroupAAPlan(
    {
      ...group,
      members: [
        ...group.members,
        { id: "chen", name: "陈晨", gender: "unknown" },
      ],
    },
    { title: "聚餐", items: [] },
    "600元，女生a一半",
    [],
    ["self", "li", "wang"],
  );
  assert.ok(
    half.plan,
    `Female half share must produce a plan for selected known profiles: ${half.message}`,
  );
  assert.deepEqual(
    calculateGroupAA(group, half.plan).members.map((m) => m.amount),
    [24000, 12000, 24000],
  );
  const unknown = await requestGroupAAPlan(
    {
      ...group,
      members: group.members.map((m) =>
        m.id === "li" ? { ...m, gender: "unknown" } : m,
      ),
    },
    { title: "聚餐", items: [] },
    "600元，女生a一半",
    [],
    ["self", "li", "wang"],
  );
  assert.equal(
    unknown.plan,
    undefined,
    "Unknown gender must clarify, not guess",
  );
  console.log(
    JSON.stringify({
      result: "PASS",
      message: response.message,
      members: result.members.map((m) => ({ name: m.name, cents: m.amount })),
      noFinancialMutation: true,
      selectionOnly: true,
      halfShares: half.message,
      unknownGenderClarified: unknown.message,
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
  await loader.close();
}
