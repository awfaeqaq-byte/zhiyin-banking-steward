import { readGroupAA, revokeGroupAA } from "../Wechat/group-aa/backend";
export async function accessGroupAA(
  operation: string,
  payload: Record<string, unknown>,
) {
  if (operation === "records" || operation === "revoke") {
    if (typeof payload.groupId !== "string") throw new Error("未选择群");
    if (operation === "revoke") {
      revokeGroupAA(payload.groupId);
      return { status: "ok" };
    }
    const state = readGroupAA();
    if (!state.grants.includes(payload.groupId))
      throw new Error("此群授权已失效，请重新选择");
    return {
      status: "ok",
      collections: structuredClone(
        state.collections.filter((c) => c.groupId === payload.groupId),
      ),
    };
  }
  if (operation !== "choose" && operation !== "publish")
    throw new Error("不支持的群收款操作");
  return new Promise<Record<string, unknown>>((resolve) => {
    const launched = window.__OS__?.startActivityForResult(
      "wechat",
      {
        action: "ACTION_GROUP_AA",
        scheme: "weixin",
        data: { clientId: "zhiyin", operation, ...payload },
      },
      (result) =>
        resolve(
          result.resultCode === "OK"
            ? { status: "ok", ...result.data }
            : { status: "cancelled" },
        ),
    );
    if (!launched) resolve({ status: "error", message: "无法打开微信" });
  });
}
