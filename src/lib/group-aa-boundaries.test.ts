import { it, expect, vi, afterEach } from "vitest";
import {
  calculateGroupAA,
  parseGroupAAReply,
  requestGroupAAPlan,
  groupAARequest,
  validAAGroup,
  type AAGroup,
} from "./group-aa";
const group: AAGroup = {
  id: "g",
  name: "聚餐群",
  revision: 1,
  members: [
    { id: "me", name: "我", self: true },
    { id: "w", name: "小王" },
  ],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("rejects malformed data, invalid amounts and oversized totals", () => {
  expect(validAAGroup(null)).toBe(false);
  expect(validAAGroup({ ...group, members: [] })).toBe(false);
  for (const amount of [0, -1, 1.2, NaN, 10000001])
    expect(() =>
      calculateGroupAA(group, {
        title: "a",
        items: [
          {
            id: "a",
            title: "a",
            amount,
            shares: [{ memberId: "w", weight: 1 }],
          },
        ],
      }),
    ).toThrow();
  expect(() => parseGroupAAReply("not json", group)).toThrow();
  expect(() => parseGroupAAReply("[]", group)).toThrow();
  expect(() =>
    calculateGroupAA(group, {
      title: "a",
      items: [
        {
          id: "a",
          title: "a",
          amount: 6000000,
          shares: [{ memberId: "w", weight: 1 }],
        },
        {
          id: "b",
          title: "b",
          amount: 6000000,
          shares: [{ memberId: "w", weight: 1 }],
        },
      ],
    }),
  ).toThrow();
});
it("sends current plan and selected IDs; model failure has no execution effects", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: '{"message":"请问是哪位小王？"}' }),
    });
  vi.stubGlobal("fetch", fetcher);
  const reply = await requestGroupAAPlan(
    group,
    { title: "聚餐", items: [] },
    "小王参加",
    [],
    ["w", "fake"],
  );
  expect(reply.plan).toBeUndefined();
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.instructions).toContain('当前点选的成员id：["w"]');
  await expect(
    requestGroupAAPlan(group, { title: "a", items: [] }, ""),
  ).rejects.toThrow();
  await expect(
    requestGroupAAPlan(
      { ...group, name: "x".repeat(5000) },
      { title: "a", items: [] },
      "分摊",
    ),
  ).rejects.toThrow("较大");
  fetcher.mockResolvedValue({
    ok: false,
    json: async () => ({ error: "模型暂不可用" }),
  });
  await expect(
    requestGroupAAPlan(group, { title: "a", items: [] }, "分摊"),
  ).rejects.toThrow("模型暂不可用");
});
it("bridge ignores forged origins and handles cancellation, bad data and timeout", async () => {
  await expect(groupAARequest("choose")).rejects.toThrow("手机沙箱");
  const peer = { postMessage: vi.fn() };
  vi.stubGlobal("parent", peer);
  const pending = groupAARequest("choose");
  const request = peer.postMessage.mock.calls[0][0];
  const reply = {
    channel: "zhiyin-phone",
    version: 1,
    type: "group-aa-result",
    requestId: request.requestId,
    status: "ok",
    group,
  };
  window.dispatchEvent(
    new MessageEvent("message", {
      source: peer as unknown as Window,
      origin: "https://wrong.test",
      data: reply,
    }),
  );
  window.dispatchEvent(
    new MessageEvent("message", {
      source: peer as unknown as Window,
      origin: window.location.origin,
      data: reply,
    }),
  );
  expect((await pending).group).toEqual(group);
  const cancelled = groupAARequest("choose");
  const id = peer.postMessage.mock.calls.at(-1)![0].requestId;
  window.dispatchEvent(
    new MessageEvent("message", {
      source: peer as unknown as Window,
      origin: window.location.origin,
      data: { ...reply, requestId: id, status: "cancelled" },
    }),
  );
  await expect(cancelled).rejects.toThrow("取消");
  const bad = groupAARequest("choose");
  window.dispatchEvent(
    new MessageEvent("message", {
      source: peer as unknown as Window,
      origin: window.location.origin,
      data: {
        ...reply,
        requestId: peer.postMessage.mock.calls.at(-1)![0].requestId,
        group: null,
      },
    }),
  );
  await expect(bad).rejects.toThrow("有效");
  vi.useFakeTimers();
  const timed = groupAARequest("records");
  const assertion = expect(timed).rejects.toThrow("超时");
  await vi.advanceTimersByTimeAsync(180001);
  await assertion;
});
