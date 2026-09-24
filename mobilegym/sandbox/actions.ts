import { resetWechatChatsToInitial, type WechatChatResetResult } from '../apps/Wechat/state';

export type SandboxActionResult = WechatChatResetResult;

export function resetWechatChats(): SandboxActionResult {
  return resetWechatChatsToInitial();
}
