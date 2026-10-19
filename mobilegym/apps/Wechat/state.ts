import { createAppStoreWithActions, memoSelector } from '../../os/createAppStore';
import { getWechatConfig } from './data';
import * as TimeService from '../../os/TimeService';
import { buildContactChatMessages, getWechatContactChatBackend } from './chat-ai/backend';
import type { ContactChatReplyRequest } from './chat-ai/backend';
import {ensureNingningContact,requestNingningReply,NINGNING_WXID} from './chat-ai/zhiyin';
import {netJson} from '../../os/NetworkService';
import { createContactReplyQueue } from './chat-ai/reply-queue';
import { SmsGateway } from '../../os/SmsGateway';
import { getEffectiveBuildInfo } from '../../os/managers/registry';
import type {
  AppData,
  User,
  UserSettings,
  Address,
  Invoice,
  Message,
  ChatSession,
  MomentDraft,
  TextMomentDraft,
  ContactItem,
  WechatAuthState,
  WechatSubscription,
  WechatPayTransaction,
  WechatPayLedgerSettings,
  WechatWalletTransfer,
} from './types';

// --- Constants ---

const EMPTY_MOMENT_DRAFT: MomentDraft = { content: '', location: null, selectedImages: [] };
const EMPTY_TEXT_MOMENT_DRAFT: TextMomentDraft = { content: '', location: null };

// Auth state defaults to loggedIn: true.
const EMPTY_AUTH_STATE: WechatAuthState = {
  accounts: [],
  session: { loggedIn: true, phone: null, expiresAt: null },
  trustedDevicesByPhone: {},
  verificationCodes: [],
  verificationAttempts: [],
  loginAttempts: [],
  verificationCodeLength: 6,
  verificationCodeExpirySec: 60,
  captcha: { requiredAfterFailures: 3 },
  nextVerificationCodeOverride: null,
  pendingTrustDevice: null,
};

// --- RightAction type ---

export type RightAction = {
  /**
   * 用于 TopBar 右侧按钮打标 data-action。
   * - 若暂未迁移/不希望打标，可省略 id（仅执行 onTrigger，不生成 data-action-*）。
   */
  id?: string;
  /**
   * 执行回调。
   * 注意：此处允许在回调里执行副作用 + back/go（例如"完成/确定"本质是回退，回退目标由历史决定）。
   */
  onTrigger: () => void;
  /** 可选参数（用于 data-action-params 区分实例） */
  params?: Record<string, string | number | boolean>;
};

// --- Module-level ref for AI reply pending tracking (cannot go into Zustand state) ---

const aiReplyQueue = createContactReplyQueue();
let chatStateEpoch = 0;

let localSeq = 0;
function nextMomentId(): string {
  localSeq += 1;
  return `moment-${TimeService.now()}_${localSeq}`;
}

// --- Helper functions ---

const formatChatTimeline = (timestamp: number): string => {
  const date = TimeService.fromTimestamp(timestamp);
  const now = TimeService.getDate();
  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (isSameDay(date, now)) return timeStr;
  const yesterday = TimeService.fromTimestamp(now.getTime());
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return `昨天 ${timeStr}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
};

const FIVE_MINUTES = 5 * 60 * 1000;

function upsertChatMessages(
  prev: WechatState & WechatActions,
  targetWxid: string,
  now: number,
  outgoingMessages: Message[],
): ChatSession[] {
  const chatIndex = prev.chats.findIndex(c => c.id === targetWxid);
  const currentChat = chatIndex !== -1 ? prev.chats[chatIndex] : null;
  const messagesToAppend: Message[] = [];
  const lastMsg = currentChat?.messages?.[currentChat.messages.length - 1];

  if (!lastMsg || now - lastMsg.timestamp > FIVE_MINUTES) {
    messagesToAppend.push({
      id: `time-${now}`,
      type: 'time',
      content: formatChatTimeline(now),
      senderId: 'system',
      timestamp: now - 1,
    });
  }

  messagesToAppend.push(...outgoingMessages);

  const updatedChats = [...prev.chats];
  if (chatIndex !== -1) {
    updatedChats[chatIndex] = {
      ...updatedChats[chatIndex],
      messages: [...(updatedChats[chatIndex].messages || []), ...messagesToAppend],
    };
    return updatedChats;
  }

  const contact = targetWxid === prev.user.wxid ? prev.user : prev.contacts.find(c => c.wxid === targetWxid);
  if (!contact) return prev.chats;

  updatedChats.push({
    id: targetWxid,
    user: { wxid: contact.wxid, name: contact.name, avatar: contact.avatar },
    messages: messagesToAppend,
    isMuted: false,
    isSticky: false,
    isAlert: false,
  });
  return updatedChats;
}

type VerificationReason = 'ok' | 'wrong' | 'expired' | 'superseded' | 'used' | 'no_active';

function performCodeVerification(
  prevAuth: WechatAuthState,
  phone: string,
  code: string,
  now: number,
): {
  ok: boolean;
  reason: VerificationReason;
  updatedCodes: WechatAuthState['verificationCodes'];
  attempt: WechatAuthState['verificationAttempts'][number];
} {
  const codes = [...(prevAuth.verificationCodes || [])] as any[];
  const phoneCodes = codes.filter((c: any) => c.phone === phone);
  const active = [...phoneCodes].reverse().find((c: any) => !c.invalidatedByNewer && !c.used) as any;
  const inputCode = String(code);
  const matched = [...phoneCodes].reverse().find((c: any) => String(c.code) === inputCode) as any;

  let ok = false;
  let reason: VerificationReason = 'no_active';
  if (!active) {
    reason = matched?.used
      ? 'used'
      : matched?.invalidatedByNewer
        ? 'superseded'
        : matched && now > matched.issuedAt + matched.expiresInSec * 1000
          ? 'expired'
          : 'no_active';
  } else if (matched && matched.id !== active.id) {
    reason = matched.used
      ? 'used'
      : matched.invalidatedByNewer
        ? 'superseded'
        : now > matched.issuedAt + matched.expiresInSec * 1000
          ? 'expired'
          : 'superseded';
  } else if (now > active.issuedAt + active.expiresInSec * 1000) {
    reason = matched?.id === active.id
      ? 'expired'
      : matched?.invalidatedByNewer
        ? 'superseded'
        : matched?.used
          ? 'used'
          : 'expired';
  } else if (String(active.code) !== inputCode) {
    reason = matched?.invalidatedByNewer
      ? 'superseded'
      : matched?.used
        ? 'used'
        : matched && now > matched.issuedAt + matched.expiresInSec * 1000
          ? 'expired'
          : 'wrong';
  } else {
    ok = true;
    reason = 'ok';
    const idx = codes.findIndex((c: any) => c.id === active.id);
    if (idx >= 0) codes[idx] = { ...codes[idx], used: true };
  }

  return {
    ok,
    reason,
    updatedCodes: codes as any,
    attempt: {
      id: `vca-${now}-${Math.random().toString(16).slice(2)}`,
      phone,
      code: inputCode,
      at: now,
      ok,
      reason,
    },
  };
}

// 构建真实的微信用户系统提示词
const buildRealisticSystemPrompt = (contact: ContactItem, currentUser: User) => {
  const now = TimeService.getDate();
  const hour = now.getHours();
  const timeOfDay = hour < 6 ? '凌晨' : hour < 9 ? '早上' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 22 ? '晚上' : '深夜';
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 ${timeOfDay}${hour}点`;
  const relationship = contact.name.toLowerCase() === 'boss'
    ? `你是「${currentUser.name}」的直属上级，在工作微信中交流。`
    : `你和「${currentUser.name}」是熟悉的微信联系人。`;

  let prompt = `# 角色设定
你是「${contact.name}」，一个真实的微信用户，正在和「${currentUser.name}」聊天。
${relationship}

## 你的个人信息
- 姓名：${contact.name}
- 性别：${contact.gender || '未知'}
- 地区：${contact.region || '未知'}
${contact.signature ? `- 个性签名：${contact.signature}` : ''}

## 当前时间
${dateStr}

## 聊天对象
你的微信联系人「${currentUser.name}」，来自${currentUser.region || '未知'}。

## 重要规则
1. 你是一个真实的人，不是AI助手。绝对不要说"我是AI"、"我可以帮你"、"有什么可以帮助你的"这类话
2. 用口语化、随意的方式聊天，可以用网络用语、表情符号
3. 回复要简短自然，一般1-2句话，不要长篇大论
4. 根据时间调整语气，比如深夜可以问对方怎么还没睡
5. 可以有自己的情绪和态度，不用总是积极正面
6. 不要主动提供帮助或建议，保持符合双方关系的真实语气`;

  return prompt;
};

// 触发AI回复的异步函数
const triggerAIReply = async (
  targetWxid: string,
  contact: ContactItem,
  currentChats: ChatSession[],
  myWxid: string,
  currentUser: User,
  receiptEvent?: ContactChatReplyRequest['receiptEvent'],
  scheduledEpoch = chatStateEpoch,
) => {
  const aiConfig = contact.aiConfig!;

  try {
    const chat = currentChats.find(c => c.id === targetWxid);
    const maxMessages = aiConfig.maxContextMessages || 15;
    const messages = chat?.messages || [];
    const history = buildContactChatMessages(
      targetWxid === NINGNING_WXID ? messages.filter(message => message.type === 'text') : messages,
      myWxid,
      maxMessages,
    );

    const basePrompt = buildRealisticSystemPrompt(contact, currentUser);
    const customPersonality = aiConfig.systemPrompt ? `\n\n## 性格特点\n${aiConfig.systemPrompt}` : '';
    const systemPrompt = basePrompt + customPersonality;

    const reply = targetWxid===NINGNING_WXID ? await requestNingningReply(history,netJson) : await getWechatContactChatBackend().reply({
      contact,
      currentUserName: currentUser.name,
      systemPrompt,
      messages: history,
      receiptEvent,
    });
    if (scheduledEpoch !== chatStateEpoch) return;
    if (reply.text) addAIMessage(targetWxid, reply.text);
    if (targetWxid !== NINGNING_WXID && reply.incomingTransfer) {
      const { getWechatWalletBackend } = await import('./wallet/backend');
      await getWechatWalletBackend().createIncomingTransfer({
        peerWxid: contact.wxid,
        peerName: contact.name,
        amountCents: reply.incomingTransfer.amountCents,
        note: reply.incomingTransfer.note,
      });
    }
  } catch (error) {
    console.error('AI reply failed:', error);
    if(targetWxid===NINGNING_WXID&&scheduledEpoch===chatStateEpoch)storeAccessors.set(state=>({_temp:{...state._temp,ningningReplyFailed:true}}));
  } finally {
    if (scheduledEpoch !== chatStateEpoch) return;
    const { set, get } = storeAccessors;
    const nextReplyJob = aiReplyQueue.finish(targetWxid);
    const pending = { ...get()._temp.aiReplyPendingByWxid };
    delete pending[targetWxid];
    set(state => ({ _temp: { ...state._temp, aiReplyPendingByWxid: pending } }));

    if (nextReplyJob) {
      const latest = get();
      const latestContact = latest.contacts.find(item => item.wxid === targetWxid);
      if (latestContact) {
        scheduleAIReply(targetWxid, latestContact, latest.chats, latest.user, nextReplyJob.receiptEvent);
      }
    }
  }
};

// 添加AI生成的消息（作为联系人发送）
const addAIMessage = (targetWxid: string, content: string) => {
  const { set, get } = storeAccessors;
  const prev = get();
  const now = TimeService.now();
  const FIVE_MINUTES = 5 * 60 * 1000;
  const chatIndex = prev.chats.findIndex(c => c.id === targetWxid);
  if (chatIndex === -1) return;

  const currentChat = prev.chats[chatIndex];
  const newMessages: Message[] = [];
  const lastMsg = currentChat.messages?.[currentChat.messages.length - 1];

  if (!lastMsg || (now - lastMsg.timestamp > FIVE_MINUTES)) {
    newMessages.push({
      id: `time-${now}`,
      type: 'time',
      content: formatChatTimeline(now),
      senderId: 'system',
      timestamp: now - 1,
    });
  }

  newMessages.push({
    id: `ai-${now}`,
    type: 'text',
    content,
    senderId: targetWxid,
    timestamp: now,
  });

  const updatedChats = [...prev.chats];
  updatedChats[chatIndex] = {
    ...updatedChats[chatIndex],
    messages: [...(updatedChats[chatIndex].messages || []), ...newMessages],
  };

  set({ chats: updatedChats });
};

// Store accessor for use in module-level helper functions.
// Initialized after store creation below.
const storeAccessors = {
  set: null as unknown as (partial: Partial<WechatState & WechatActions> | ((state: WechatState & WechatActions) => Partial<WechatState & WechatActions>)) => void,
  get: null as unknown as () => WechatState & WechatActions,
};

function scheduleAIReply(
  targetWxid: string,
  contact: ContactItem,
  currentChats: ChatSession[],
  currentUser: User,
  receiptEvent?: ContactChatReplyRequest['receiptEvent'],
) {
  if (!contact.aiConfig?.enabled || !aiReplyQueue.begin(targetWxid, receiptEvent)) return;
  const { set } = storeAccessors;
  set(state => ({
    _temp: {
      ...state._temp,
      aiReplyPendingByWxid: { ...state._temp.aiReplyPendingByWxid, [targetWxid]: true },
      ...(targetWxid===NINGNING_WXID?{ningningReplyFailed:false}:{}),
    },
  }));
  void triggerAIReply(targetWxid, contact, currentChats, currentUser.wxid, currentUser, receiptEvent);
}

export type WechatChatResetResult = {
  conversations: number;
  removedMessages: number;
  restoredMessages: number;
};

export function resetWechatChatsToInitial(): WechatChatResetResult {
  chatStateEpoch += 1;
  aiReplyQueue.clear();

  const currentState = useWechatStore.getState();
  const initialChats = structuredClone(getWechatConfig().chats);
  const currentMessageCount = currentState.chats.reduce((sum, chat) => sum + chat.messages.length, 0);
  const restoredMessageCount = initialChats.reduce((sum, chat) => sum + chat.messages.length, 0);

  useWechatStore.setState({
    chats: initialChats,
    _temp: {
      ...currentState._temp,
      aiReplyPendingByWxid: {},
    },
  });

  return {
    conversations: initialChats.length,
    removedMessages: Math.max(0, currentMessageCount - restoredMessageCount),
    restoredMessages: restoredMessageCount,
  };
}

// --- State & Actions interfaces ---

interface WechatState extends AppData {
  _temp: {
    rightAction: RightAction | null;
    aiReplyPendingByWxid: Record<string, boolean>;
    ningningReplyFailed?:boolean;
  };
}

interface WechatActions {
  updateUser: (updates: Partial<User>) => void;
  updateSettings: (settings: UserSettings) => void;
  addAddress: (address: Address) => void;
  addInvoice: (invoice: Invoice) => void;
  retryNingningReply:()=>void;
  sendMessage: (targetWxid: string, content: string) => void;
  sendImages: (targetWxid: string, imagePaths: string[]) => void;
  sendFiles: (targetWxid: string, files: { path: string; name: string; size: number; mimeType?: string }[]) => void;
  sendPat: (targetWxid: string) => void;
  updateChatSettings: (targetWxid: string, updates: Partial<Pick<ChatSession, 'isMuted' | 'isSticky' | 'isAlert'>>) => void;
  updateContactState: (wxid: string, updates: Partial<Pick<ContactItem, 'isBlacklisted' | 'isStarred' | 'permissionMode' | 'hideMyMoments' | 'hideTheirMoments'>>) => void;
  postMoment: (content: string, images?: string[], location?: string) => void;
  updateMomentDraft: (updates: Partial<MomentDraft>) => void;
  clearMomentDraft: () => void;
  updateTextMomentDraft: (updates: Partial<TextMomentDraft>) => void;
  clearTextMomentDraft: () => void;
  setRightAction: (action: RightAction | null) => void;
  deauthorizeApp: (appId: string) => void;
  addSubscription: (sub: WechatSubscription) => void;
  updateSubscription: (id: string, updates: Partial<WechatSubscription>) => void;
  addPayLedgerTransaction: (transaction: WechatPayTransaction) => void;
  updatePayLedgerSettings: (updates: Partial<WechatPayLedgerSettings>) => void;
  addWalletTransfer: (transfer: WechatWalletTransfer) => void;
  updateWalletTransfer: (transfer: WechatWalletTransfer) => void;
  // Auth actions
  requestVerificationCode: (phone: string, length: number, expiresInSec: number) => string;
  registerAccount: (args: { phone: string; password: string; code: string; realName: string; idNumber: string; expiresInSec: number }) => { ok: boolean; reason?: string };
  loginWithPassword: (args: { phone: string; password: string; captchaPassed?: boolean }) => { ok: boolean; needsTrust?: boolean; reason?: string };
  loginWithCode: (args: { phone: string; code: string; captchaPassed?: boolean }) => { ok: boolean; needsTrust?: boolean; reason?: string };
  trustCurrentDevice: (phone: string) => void;
  resetPassword: (args: { phone: string; code: string; newPassword: string; expiresInSec: number }) => { ok: boolean; reason?: string };
  logout: () => void;
  cancelAccount: () => void;
  dismissLoginExpiredModal: () => void;
}

// --- Initial state ---

function createInitialWechatState(): WechatState {
  const config = getWechatConfig() as any;
  return ensureNingningContact({
    ...config,
    settings: config.settings,
    auth: config.auth ?? EMPTY_AUTH_STATE,
    subscriptions: config.subscriptions ?? [],
    _temp: { rightAction: null, aiReplyPendingByWxid: {} },
  },TimeService.now());
}

const initialState: WechatState = createInitialWechatState();

// --- Store ---

export const useWechatStore = createAppStoreWithActions<WechatState, WechatActions>(
  'wechat',
  initialState,
  (set, get) => {
    // Expose set/get for module-level helpers (addAIMessage, triggerAIReply)
    storeAccessors.set = set;
    storeAccessors.get = get;

    return {
      updateUser(updates: Partial<User>) {
        const prev = get();
        set({ user: { ...prev.user, ...updates } });
      },

      updateSettings(settings: UserSettings) {
        set({ settings });
      },

      addAddress(address: Address) {
        const prev = get();
        set({ user: { ...prev.user, addresses: [...prev.user.addresses, address] } });
      },

      addInvoice(invoice: Invoice) {
        const prev = get();
        set({ user: { ...prev.user, invoices: [...prev.user.invoices, invoice] } });
      },

      retryNingningReply(){
        const state=get(),contact=state.contacts.find(c=>c.wxid===NINGNING_WXID);
        const last=state.chats.find(c=>c.id===NINGNING_WXID)?.messages.filter(m=>m.type==='text').at(-1);
        if(contact&&last?.senderId===state.user.wxid&&!state._temp.aiReplyPendingByWxid[NINGNING_WXID])scheduleAIReply(NINGNING_WXID,contact,state.chats,state.user);
      },
      sendMessage(targetWxid: string, content: string) {
        const prev = get();
        if(targetWxid===NINGNING_WXID&&(prev._temp.aiReplyPendingByWxid[targetWxid]||!content.trim()||content.length>2000))return;
        const now = TimeService.now();
        const updatedChats = upsertChatMessages(prev, targetWxid, now, [
          {
            id: now.toString(),
            type: 'text',
            content,
            senderId: prev.user.wxid,
            timestamp: now,
          },
        ]);

        set({ chats: updatedChats });

        // 检查联系人是否配置了AI回复，异步触发AI响应
        const contact = prev.contacts.find(c => c.wxid === targetWxid);
        if (contact) scheduleAIReply(targetWxid, contact, updatedChats, prev.user);
      },

      sendImages(targetWxid: string, imagePaths: string[]) {
        const prev = get();
        const picked = imagePaths.filter(Boolean);
        if (picked.length === 0) return;

        const now = TimeService.now();
        const outgoingMessages: Message[] = picked.map((path, index) => ({
          id: `image-${now}-${index}`,
          type: 'image',
          content: path,
          senderId: prev.user.wxid,
          timestamp: now + index,
        }));

        set({ chats: upsertChatMessages(prev, targetWxid, now, outgoingMessages) });
      },

      sendFiles(targetWxid: string, files: { path: string; name: string; size: number; mimeType?: string }[]) {
        const prev = get();
        const picked = files.filter(f => f && f.path);
        if (picked.length === 0) return;

        const now = TimeService.now();
        const outgoingMessages: Message[] = picked.map((f, index) => ({
          id: `file-${now}-${index}`,
          type: 'file',
          content: f.path,
          fileName: f.name,
          fileSize: f.size,
          mimeType: f.mimeType,
          senderId: prev.user.wxid,
          timestamp: now + index,
        }));

        set({ chats: upsertChatMessages(prev, targetWxid, now, outgoingMessages) });
      },

      sendPat(targetWxid: string) {
        const prev = get();
        const now = TimeService.now();
        const contact = (targetWxid === prev.user.wxid) ? prev.user : prev.contacts.find(c => c.wxid === targetWxid);
        if (!contact) return;

        const contactName = (contact as any).alias || contact.name;
        const content = `我拍了拍"${contactName}"`;
        set({
          chats: upsertChatMessages(prev, targetWxid, now, [
            {
              id: `pat-${now}`,
              type: 'system',
              content,
              senderId: 'system',
              timestamp: now,
            },
          ]),
        });
      },

      updateChatSettings(targetWxid: string, updates: Partial<Pick<ChatSession, 'isMuted' | 'isSticky' | 'isAlert'>>) {
        const prev = get();
        const chatIndex = prev.chats.findIndex(c => c.id === targetWxid);
        if (chatIndex === -1) return;
        const updatedChats = [...prev.chats];
        updatedChats[chatIndex] = { ...updatedChats[chatIndex], ...updates };
        set({ chats: updatedChats });
      },

      updateContactState(wxid: string, updates: Partial<Pick<ContactItem, 'isBlacklisted' | 'isStarred' | 'permissionMode' | 'hideMyMoments' | 'hideTheirMoments'>>) {
        const prev = get();
        const contactIndex = prev.contacts.findIndex(c => c.wxid === wxid);
        if (contactIndex === -1) return;
        const updatedContacts = [...prev.contacts];
        updatedContacts[contactIndex] = { ...updatedContacts[contactIndex], ...updates };
        set({ contacts: updatedContacts });
      },

      postMoment(content: string, images?: string[], location?: string) {
        const prev = get();
        set({
          moments: [
            {
              id: nextMomentId(),
              wxid: prev.user.wxid,
              userName: prev.user.name,
              userAvatar: prev.user.avatar,
              content,
              images,
              location,
              timestamp: TimeService.now(),
            },
            ...prev.moments,
          ],
        });
      },

      updateMomentDraft(updates: Partial<MomentDraft>) {
        const prev = get();
        set({
          momentDraft: { ...(prev.momentDraft ?? EMPTY_MOMENT_DRAFT), ...updates },
        });
      },

      clearMomentDraft() {
        set({ momentDraft: EMPTY_MOMENT_DRAFT });
      },

      updateTextMomentDraft(updates: Partial<TextMomentDraft>) {
        const prev = get();
        set({
          textMomentDraft: { ...(prev.textMomentDraft ?? EMPTY_TEXT_MOMENT_DRAFT), ...updates },
        });
      },

      clearTextMomentDraft() {
        set({ textMomentDraft: EMPTY_TEXT_MOMENT_DRAFT });
      },

      setRightAction(action: RightAction | null) {
        set((s) => ({ _temp: { ...s._temp, rightAction: action } }));
      },

      deauthorizeApp(appId: string) {
        const prev = get();
        set({
          authorizedApps: prev.authorizedApps.filter(app => app.id !== appId),
        });
      },

      addSubscription(sub: WechatSubscription) {
        const list = get().subscriptions.filter(s => s.id !== sub.id);
        set({ subscriptions: [sub, ...list] });
      },

      updateSubscription(id: string, updates: Partial<WechatSubscription>) {
        set({ subscriptions: get().subscriptions.map(s => s.id === id ? { ...s, ...updates } : s) });
      },

      addPayLedgerTransaction(transaction: WechatPayTransaction) {
        const prev = get();
        set({
          payLedger: {
            ...prev.payLedger,
            transactions: [transaction, ...prev.payLedger.transactions],
          },
        });
      },

      updatePayLedgerSettings(updates: Partial<WechatPayLedgerSettings>) {
        const prev = get();
        set({
          payLedger: {
            ...prev.payLedger,
            settings: { ...prev.payLedger.settings, ...updates },
          },
        });
      },

      addWalletTransfer(transfer: WechatWalletTransfer) {
        const prev = get();
        if (prev.wallet.transfers.some(item => item.id === transfer.id)) return;
        const now = TimeService.now();
        const transferMessage: Message = {
          id: `message-${transfer.id}`,
          type: 'transfer',
          content: transfer.note || '转账',
          senderId: transfer.direction === 'outgoing' ? prev.user.wxid : transfer.peerWxid,
          timestamp: now,
          transferId: transfer.id,
          transferAmountCents: transfer.amountCents,
          transferStatus: transfer.status,
          transferNote: transfer.note,
        };
        const shouldApplyFunds = transfer.direction === 'outgoing' || transfer.status === 'received';
        const balanceDelta = transfer.direction === 'outgoing'
          ? -transfer.amountCents
          : transfer.status === 'received' ? transfer.amountCents : 0;
        const ledgerTransaction: WechatPayTransaction = {
          id: `ledger-${transfer.id}`,
          direction: transfer.direction === 'outgoing' ? 'expense' : 'income',
          amountCents: transfer.amountCents,
          category: transfer.direction === 'outgoing' ? 'transfer' : 'income',
          merchant: transfer.direction === 'outgoing' ? `转账给${transfer.peerName}` : `${transfer.peerName}转账`,
          occurredAt: transfer.createdAt,
          note: transfer.note,
          linkedId: transfer.id,
          source: 'wechat_pay',
        };

        set({
          wallet: {
            balanceCents: prev.wallet.balanceCents + balanceDelta,
            transfers: [transfer, ...prev.wallet.transfers],
          },
          payLedger: {
            ...prev.payLedger,
            transactions: shouldApplyFunds
              ? [ledgerTransaction, ...prev.payLedger.transactions]
              : prev.payLedger.transactions,
          },
          chats: upsertChatMessages(prev, transfer.peerWxid, now, [transferMessage]),
        });
      },

      updateWalletTransfer(transfer: WechatWalletTransfer) {
        const prev = get();
        const previous = prev.wallet.transfers.find(item => item.id === transfer.id);
        if (!previous) return;
        const isNewIncomingReceipt = previous.direction === 'incoming'
          && previous.status === 'pending'
          && transfer.status === 'received';
        const alreadyInLedger = prev.payLedger.transactions.some(item => item.linkedId === transfer.id);
        const incomingLedgerTransaction: WechatPayTransaction = {
          id: `ledger-${transfer.id}`,
          direction: 'income',
          amountCents: transfer.amountCents,
          category: 'income',
          merchant: `${transfer.peerName}转账`,
          occurredAt: transfer.receivedAt || transfer.createdAt,
          note: transfer.note,
          linkedId: transfer.id,
          source: 'wechat_pay',
        };
        set({
          wallet: {
            balanceCents: prev.wallet.balanceCents + (isNewIncomingReceipt ? transfer.amountCents : 0),
            transfers: prev.wallet.transfers.map(item => item.id === transfer.id ? transfer : item),
          },
          payLedger: isNewIncomingReceipt && !alreadyInLedger
            ? { ...prev.payLedger, transactions: [incomingLedgerTransaction, ...prev.payLedger.transactions] }
            : prev.payLedger,
          chats: prev.chats.map(chat => ({
            ...chat,
            messages: chat.messages.map(message => message.transferId === transfer.id
              ? { ...message, transferStatus: transfer.status }
              : message),
          })),
        });

        const isNewOutgoingReceipt = previous.direction === 'outgoing'
          && previous.status === 'pending'
          && transfer.status === 'received';
        if (isNewOutgoingReceipt) {
          const contact = prev.contacts.find(item => item.wxid === transfer.peerWxid);
          if (contact) {
            const updatedChats = get().chats;
            scheduleAIReply(
              transfer.peerWxid,
              contact,
              updatedChats,
              prev.user,
              {
                type: 'contact_received_user_transfer',
                amountCents: transfer.amountCents,
                note: transfer.note,
              },
            );
          }
        }
      },

      // --- Auth actions ---

      requestVerificationCode(phone: string, length: number, expiresInSec: number) {
        const now = TimeService.now();
        const l = Math.max(4, Math.min(8, Number(length) || 6));
        const prev = get();
        const prevAuth = prev.auth ?? EMPTY_AUTH_STATE;
        const digits = (s: string) => s.replace(/\D/g, '');
        const override = digits(String(prevAuth.nextVerificationCodeOverride || ''));
        const code = override && override.length === l
          ? override
          : Array.from({ length: l }).map(() => Math.floor(Math.random() * 10)).join('');
        const id = `vc-${now}-${Math.random().toString(16).slice(2)}`;
        SmsGateway.receiveMessage({ from: '腾讯科技', body: `【腾讯科技】验证码：${code}，5分钟内有效` });
        const codes = (prevAuth.verificationCodes || []).map(c => (c.phone === phone ? { ...c, invalidatedByNewer: true } : c));
        set({
          auth: {
            ...prevAuth,
            nextVerificationCodeOverride: null,
            verificationCodes: [
              ...codes,
              { id, phone, code, issuedAt: now, expiresInSec: Math.max(5, Number(expiresInSec) || 60), invalidatedByNewer: false, used: false },
            ],
          },
        });
        return code;
      },

      registerAccount({ phone, password, code, realName, idNumber, expiresInSec }) {
        const now = TimeService.now();
        const prev = get();
        const prevAuth = prev.auth ?? EMPTY_AUTH_STATE;
        const v = performCodeVerification(prevAuth, phone, String(code || '').trim(), now);
        const verificationAttempts = [...(prevAuth.verificationAttempts || []), v.attempt];
        if (!v.ok) {
          return { ok: false, reason: `code_${v.reason}` };
        }
        // Check if account already exists
        const existing = prevAuth.accounts.find(a => a.phone === phone);
        if (existing) return { ok: false, reason: 'account_exists' };
        // Create account
        const newAccount = { phone, password, createdAt: now, activated: true, realName, idNumber };
        const deviceId = getEffectiveBuildInfo().serialNumber || 'unknown-device';
        const token = `tok-${now}-${Math.random().toString(16).slice(2)}`;
        const sessionExpires = expiresInSec > 0 ? now + expiresInSec * 1000 : null;
        const updatedCodes = v.updatedCodes;
        set({
          auth: {
            ...prevAuth,
            accounts: [...prevAuth.accounts, newAccount],
            session: { loggedIn: true, phone, token, expiresAt: sessionExpires, currentDeviceId: deviceId },
            verificationCodes: updatedCodes,
            verificationAttempts,
          },
        });
        return { ok: true };
      },

      loginWithPassword({ phone, password, captchaPassed }) {
        const now = TimeService.now();
        const prev = get();
        const prevAuth = prev.auth ?? EMPTY_AUTH_STATE;
        const account = prevAuth.accounts.find(a => a.phone === phone);
        const attemptId = `la-${now}-${Math.random().toString(16).slice(2)}`;
        const deviceId = getEffectiveBuildInfo().serialNumber || 'unknown-device';
        if (!account) {
          set({ auth: { ...prevAuth, loginAttempts: [...prevAuth.loginAttempts, { id: attemptId, phone, password, at: now, ok: false, reason: 'no_account', deviceId }] } });
          return { ok: false, reason: 'no_account' };
        }
        // Check if locked
        if (account.lockedUntil && now < account.lockedUntil) {
          set({ auth: { ...prevAuth, loginAttempts: [...prevAuth.loginAttempts, { id: attemptId, phone, password, at: now, ok: false, reason: 'locked', deviceId }] } });
          return { ok: false, reason: 'locked' };
        }
        // Check captcha if required
        if (account.requireCaptcha && !captchaPassed) {
          set({ auth: { ...prevAuth, loginAttempts: [...prevAuth.loginAttempts, { id: attemptId, phone, password, captchaPassed: false, at: now, ok: false, reason: 'captcha_required', deviceId }] } });
          return { ok: false, reason: 'captcha_required' };
        }
        // Check password
        if (account.password !== password) {
          const failures = (account.failedAttempts || 0) + 1;
          const needsCaptcha = failures >= prevAuth.captcha.requiredAfterFailures;
          const updatedAccounts = prevAuth.accounts.map(a => a.phone === phone ? { ...a, failedAttempts: failures, requireCaptcha: needsCaptcha } : a);
          set({ auth: { ...prevAuth, accounts: updatedAccounts, loginAttempts: [...prevAuth.loginAttempts, { id: attemptId, phone, password, at: now, ok: false, reason: 'wrong_password', deviceId }] } });
          return { ok: false, reason: 'wrong_password' };
        }
        // Check device trust
        const trustedDevices = prevAuth.trustedDevicesByPhone[phone] || [];
        const isTrusted = trustedDevices.some(d => d.deviceId === deviceId);
        if (!isTrusted) {
          set({
            auth: {
              ...prevAuth,
              pendingTrustDevice: { phone, deviceId, shownAt: now },
              loginAttempts: [...prevAuth.loginAttempts, { id: attemptId, phone, password, at: now, ok: false, reason: 'untrusted_device', deviceId }],
            },
          });
          return { ok: false, needsTrust: true, reason: 'untrusted_device' };
        }
        // Success
        const token = `tok-${now}-${Math.random().toString(16).slice(2)}`;
        const updatedAccounts = prevAuth.accounts.map(a => a.phone === phone ? { ...a, failedAttempts: 0, requireCaptcha: false } : a);
        set({
          auth: {
            ...prevAuth,
            accounts: updatedAccounts,
            session: { loggedIn: true, phone, token, expiresAt: null, currentDeviceId: deviceId },
            loginAttempts: [...prevAuth.loginAttempts, { id: attemptId, phone, password, at: now, ok: true, reason: 'ok', deviceId }],
          },
        });
        return { ok: true };
      },

      loginWithCode({ phone, code, captchaPassed }) {
        const now = TimeService.now();
        const prev = get();
        const prevAuth = prev.auth ?? EMPTY_AUTH_STATE;
        const deviceId = getEffectiveBuildInfo().serialNumber || 'unknown-device';
        const attemptId = `la-${now}-${Math.random().toString(16).slice(2)}`;
        const v = performCodeVerification(prevAuth, phone, String(code || '').trim(), now);
        const verificationAttempts = [...(prevAuth.verificationAttempts || []), v.attempt];
        if (!v.ok) {
          const mappedReason: 'code_wrong' | 'code_expired' | 'code_superseded' | 'code_used' | 'code_no_active' =
            v.reason === 'expired'
              ? 'code_expired'
              : v.reason === 'superseded'
                ? 'code_superseded'
                : v.reason === 'used'
                  ? 'code_used'
                  : v.reason === 'no_active'
                    ? 'code_no_active'
                    : 'code_wrong';
          set({
            auth: {
              ...prevAuth,
              verificationCodes: v.updatedCodes,
              verificationAttempts,
              loginAttempts: [...prevAuth.loginAttempts, { id: attemptId, phone, password: '', code, at: now, ok: false, reason: mappedReason, deviceId }],
            },
          });
          return { ok: false, reason: mappedReason };
        }
        // Check device trust
        const trustedDevices = prevAuth.trustedDevicesByPhone[phone] || [];
        const isTrusted = trustedDevices.some(d => d.deviceId === deviceId);
        if (!isTrusted) {
          set({
            auth: {
              ...prevAuth,
              verificationCodes: v.updatedCodes,
              verificationAttempts,
              pendingTrustDevice: { phone, deviceId, shownAt: now },
              loginAttempts: [...prevAuth.loginAttempts, { id: attemptId, phone, password: '', code, at: now, ok: false, reason: 'untrusted_device', deviceId }],
            },
          });
          return { ok: false, needsTrust: true, reason: 'untrusted_device' };
        }
        // Success
        const token = `tok-${now}-${Math.random().toString(16).slice(2)}`;
        set({
          auth: {
            ...prevAuth,
            verificationCodes: v.updatedCodes,
            verificationAttempts,
            session: { loggedIn: true, phone, token, expiresAt: null, currentDeviceId: deviceId },
            loginAttempts: [...prevAuth.loginAttempts, { id: attemptId, phone, password: '', code, at: now, ok: true, reason: 'ok', deviceId }],
          },
        });
        return { ok: true };
      },

      trustCurrentDevice(phone: string) {
        const now = TimeService.now();
        const prev = get();
        const prevAuth = prev.auth ?? EMPTY_AUTH_STATE;
        const pending = prevAuth.pendingTrustDevice;
        if (!pending || pending.phone !== phone) return;
        const deviceId = pending.deviceId;
        const deviceName = getEffectiveBuildInfo().marketName || 'Unknown Device';
        const existingDevices = prevAuth.trustedDevicesByPhone[phone] || [];
        const newDevice = { deviceId, deviceName, trustedAt: now };
        const token = `tok-${now}-${Math.random().toString(16).slice(2)}`;
        set({
          auth: {
            ...prevAuth,
            trustedDevicesByPhone: {
              ...prevAuth.trustedDevicesByPhone,
              [phone]: [...existingDevices, newDevice],
            },
            session: { loggedIn: true, phone, token, expiresAt: null, currentDeviceId: deviceId },
            pendingTrustDevice: null,
          },
        });
      },

      resetPassword({ phone, code, newPassword, expiresInSec }) {
        const now = TimeService.now();
        const prev = get();
        const prevAuth = prev.auth ?? EMPTY_AUTH_STATE;
        const v = performCodeVerification(prevAuth, phone, String(code || '').trim(), now);
        const verificationAttempts = [...(prevAuth.verificationAttempts || []), v.attempt];
        if (!v.ok) return { ok: false, reason: `code_${v.reason}` };
        // Find account
        const account = prevAuth.accounts.find(a => a.phone === phone);
        if (!account) return { ok: false, reason: 'no_account' };
        // Update password
        const updatedAccounts = prevAuth.accounts.map(a => a.phone === phone ? { ...a, password: newPassword, failedAttempts: 0, lockedUntil: undefined, requireCaptcha: false } : a);
        set({
          auth: {
            ...prevAuth,
            accounts: updatedAccounts,
            verificationCodes: v.updatedCodes,
            verificationAttempts,
          },
        });
        return { ok: true };
      },

      logout() {
        const prev = get();
        const prevAuth = prev.auth ?? EMPTY_AUTH_STATE;
        set({
          auth: {
            ...prevAuth,
            session: { loggedIn: false, phone: null, expiresAt: null },
            pendingTrustDevice: null,
          },
        });
      },

      cancelAccount() {
        const prev = get();
        const prevAuth = prev.auth ?? EMPTY_AUTH_STATE;
        set({
          user: { ...prev.user, accountStatus: 'cancelled' },
          auth: {
            ...prevAuth,
            session: { ...(prevAuth.session || EMPTY_AUTH_STATE.session), loggedIn: false },
            pendingTrustDevice: null,
          },
        });
      },

      dismissLoginExpiredModal() {
        const prev = get();
        const prevAuth = prev.auth ?? EMPTY_AUTH_STATE;
        set({
          auth: {
            ...prevAuth,
            showLoginExpiredModal: false,
          },
        });
      },
    };
  },
  {
    partialize: (state) => {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(state)) {
        if (typeof v !== 'function' && !k.startsWith('_')) result[k] = v;
      }
      return result as Partial<WechatState>;
    },
  },
);

const ensureNingning=()=>{const state=useWechatStore.getState(),next=ensureNingningContact(state,TimeService.now());if(next!==state)useWechatStore.setState({contacts:next.contacts,chats:next.chats});};
if(useWechatStore.persist.hasHydrated())ensureNingning();else useWechatStore.persist.onFinishHydration(ensureNingning);

// --- Memoized selectors ---

/** Derived: momentDraft with safe defaults */
export const selectMomentDraft = memoSelector(
  (state: WechatState & WechatActions) => state.momentDraft,
  (draft) => draft ?? EMPTY_MOMENT_DRAFT,
);

/** Derived: textMomentDraft with safe defaults */
export const selectTextMomentDraft = memoSelector(
  (state: WechatState & WechatActions) => state.textMomentDraft,
  (draft) => draft ?? EMPTY_TEXT_MOMENT_DRAFT,
);
