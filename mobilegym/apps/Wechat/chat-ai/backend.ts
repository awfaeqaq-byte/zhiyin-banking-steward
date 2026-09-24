import type { ContactItem, Message } from '../types';

export type ContactChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ContactChatReplyRequest = {
  contact: Pick<ContactItem, 'wxid' | 'name' | 'signature' | 'gender' | 'region'>;
  currentUserName: string;
  systemPrompt: string;
  messages: ContactChatMessage[];
  eventContext?: string;
  receiptEvent?: {
    type: 'contact_received_user_transfer';
    amountCents: number;
    note?: string;
  };
};

export type ContactChatReply = {
  text: string;
  incomingTransfer?: {
    amountCents: number;
    note?: string;
  };
};

export interface ContactChatBackend {
  reply(request: ContactChatReplyRequest): Promise<ContactChatReply>;
}

type FetchLike = typeof fetch;

function lastUserText(request: ContactChatReplyRequest): string {
  return [...request.messages].reverse().find(message => message.role === 'user')?.content.trim() || '';
}

function normalizeTransferLikeText(content: string, isCurrentUser: boolean): string {
  if (isCurrentUser) return content;
  const fakeTransfer = content.match(/\[微信转账：我向你转账¥\s*(\d+(?:\.\d{1,2})?)\s*\]/);
  if (!fakeTransfer) return content;

  const amount = Number(fakeTransfer[1]);
  if (!Number.isFinite(amount)) return content;
  return `[系统提示：你曾口头表示要向对方转账¥${amount.toFixed(2)}，但没有生成独立转账卡片，因此该转账并未实际发起。]`;
}

export function buildContactChatMessages(
  messages: Message[],
  currentUserWxid: string,
  maxMessages: number,
): ContactChatMessage[] {
  return messages
    .filter(message => message.type === 'text' || message.type === 'transfer')
    .slice(-maxMessages)
    .map(message => {
      const isCurrentUser = message.senderId === currentUserWxid;
      if (message.type === 'text') {
        return {
          role: isCurrentUser ? 'user' as const : 'assistant' as const,
          content: normalizeTransferLikeText(message.content, isCurrentUser),
        };
      }

      const amount = ((message.transferAmountCents || 0) / 100).toFixed(2);
      const direction = '我向你转账';
      const status = message.transferStatus === 'received'
        ? '你已收款'
        : message.transferStatus === 'refunded'
          ? '你已退还'
          : '等待你收款';
      return {
        role: isCurrentUser ? 'user' as const : 'assistant' as const,
        content: `[微信转账：${direction}¥${amount}；状态：${status}${message.transferNote ? `；备注：${message.transferNote}` : ''}]`,
      };
    });
}

function parseIncomingTransferIntent(text: string): ContactChatReply['incomingTransfer'] {
  const hasExplicitRequest = /(?:转我|转给我|给我转|还我|还给我|发我|发给我)/.test(text)
    || /AA.{0,16}给我/i.test(text);
  if (!hasExplicitRequest) return undefined;

  const amountMatch = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块)?/);
  if (!amountMatch) return undefined;
  const amountCents = Math.round(Number(amountMatch[1]) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 200000) return undefined;

  return {
    amountCents,
    note: /AA/i.test(text) ? 'AA收款' : /还/.test(text) ? '还款' : '转账给你',
  };
}

function parseContextualTransferAmount(text: string): number | undefined {
  const patterns = [
    /(?:转|还|发)(?:返|回|给)?[^\d]{0,8}(\d+(?:\.\d{1,2})?)/,
    /(\d+(?:\.\d{1,2})?)[^\d]{0,8}(?:转|还|发)(?:给|返|回)?你/,
  ];
  const rawAmount = patterns
    .map(pattern => text.match(pattern)?.[1])
    .find(Boolean);
  if (!rawAmount) return undefined;
  const amountCents = Math.round(Number(rawAmount) * 100);
  return Number.isSafeInteger(amountCents) && amountCents > 0 && amountCents <= 200000
    ? amountCents
    : undefined;
}

function parseIncomingTransferRequest(messages: ContactChatMessage[]): ContactChatReply['incomingTransfer'] {
  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      latestUserIndex = index;
      break;
    }
  }
  if (latestUserIndex < 0) return undefined;
  const latestText = messages[latestUserIndex].content;
  const directRequest = parseIncomingTransferIntent(latestText);
  if (directRequest) return directRequest;

  const confirmsEarlierOffer = /(?:转我|转给我|给我转|还给我|发给我)/.test(latestText);
  if (!confirmsEarlierOffer) return undefined;
  const recentContext = messages.slice(Math.max(0, latestUserIndex - 6), latestUserIndex).reverse();
  for (const message of recentContext) {
    if (message.content.startsWith('[微信转账：')) continue;
    const amountCents = parseContextualTransferAmount(message.content);
    if (amountCents) return { amountCents, note: '转账给你' };
  }
  return undefined;
}

function receiptEventContext(request: ContactChatReplyRequest): string | undefined {
  if (request.receiptEvent) {
    const amount = (request.receiptEvent.amountCents / 100).toFixed(2);
    return `你刚刚确认收取了${request.currentUserName}发出的微信转账¥${amount}${request.receiptEvent.note ? `，备注“${request.receiptEvent.note}”` : ''}。`;
  }
  return request.eventContext;
}

function safeReceiptReply(request: ContactChatReplyRequest): string {
  const event = request.receiptEvent!;
  const amount = (event.amountCents / 100).toFixed(2);
  if (request.contact.name.toLowerCase() === 'boss') {
    const subject = event.note || '转账';
    return `收到，¥${amount} ${subject}${subject.endsWith('款') ? '' : '款'}已确认，后续按报销流程处理。`;
  }
  return `收到，¥${amount}${event.note ? ` ${event.note}` : ''}这笔我已经收款了。`;
}

function normalizeReceiptReply(content: string, request: ContactChatReplyRequest): string {
  if (!request.receiptEvent) return content;
  const reversesDirection = /(?:转|打|汇)(?:给|到)?你|给你(?:转|打|汇)/.test(content);
  const acknowledgesReceipt = /收到|收款|款项|已确认|到账/.test(content);
  const amount = (request.receiptEvent.amountCents / 100).toFixed(2);
  const noteAnchor = request.receiptEvent.note?.slice(0, 2);
  const hasTransactionContext = content.includes(amount)
    || Boolean(noteAnchor && content.includes(noteAnchor))
    || /这笔|款项|转账|费用|报销/.test(content);
  return reversesDirection || !acknowledgesReceipt || !hasTransactionContext
    ? safeReceiptReply(request)
    : content;
}

function safeIncomingTransferReply(incomingTransfer: NonNullable<ContactChatReply['incomingTransfer']>): string {
  return `好，¥${(incomingTransfer.amountCents / 100).toFixed(2)} 已经转给你了。`;
}

function normalizeIncomingTransferReply(
  content: string,
  incomingTransfer: ContactChatReply['incomingTransfer'],
): string {
  if (!incomingTransfer) return content;
  const confirmsTransfer = /(?:转|发|打|汇)(?:给|到)?你|转返(?:俾|给)你|给你(?:转|发|打|汇)|这就转|已经转|转过去|转咗|转了|发咗|打咗|收下/.test(content);
  return !confirmsTransfer
    ? safeIncomingTransferReply(incomingTransfer)
    : content;
}

const SEND_TRANSFER_ACTION = '[WECHAT_ACTION:SEND_TRANSFER]';
const SEND_TRANSFER_WITH_AMOUNT_PATTERN = /\[WECHAT_ACTION:SEND_TRANSFER:(\d+(?:\.\d{1,2})?)\]/g;

function transferFromModelAmount(rawAmount: string): NonNullable<ContactChatReply['incomingTransfer']> | undefined {
  const amountCents = Math.round(Number(rawAmount) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 200000) return undefined;
  return { amountCents, note: '转账给你' };
}

function extractModelTransferDecision(
  content: string,
  transferRequest: ContactChatReply['incomingTransfer'],
): { text: string; transfer?: NonNullable<ContactChatReply['incomingTransfer']> } {
  const proactiveAction = [...content.matchAll(SEND_TRANSFER_WITH_AMOUNT_PATTERN)]
    .map(match => transferFromModelAmount(match[1]))
    .find(Boolean);
  const transferRecordPattern = /\[微信转账：我向你转账¥\s*(\d+(?:\.\d{1,2})?)\s*\]/g;
  const transferRecords = [...content.matchAll(transferRecordPattern)];
  const recordTransfer = transferRecords
    .map(match => transferFromModelAmount(match[1]))
    .find(Boolean);
  const usesRequestedAmount = Boolean(transferRequest && (
    content.includes(SEND_TRANSFER_ACTION)
    || transferRecords.some(match => Math.round(Number(match[1]) * 100) === transferRequest.amountCents)
  ));
  return {
    text: content
      .replaceAll(SEND_TRANSFER_ACTION, '')
      .replace(SEND_TRANSFER_WITH_AMOUNT_PATTERN, '')
      .replace(transferRecordPattern, '')
      .trim(),
    transfer: proactiveAction || (usesRequestedAmount ? transferRequest : undefined) || recordTransfer,
  };
}

function localReply(request: ContactChatReplyRequest): ContactChatReply {
  const text = lastUserText(request);
  const eventContext = receiptEventContext(request);
  const incomingTransfer = parseIncomingTransferRequest(request.messages);
  let replyText: string;
  if (eventContext) {
    replyText = request.receiptEvent
      ? safeReceiptReply(request)
      : request.contact.name.toLowerCase() === 'boss'
        ? '收到。备注我看到了，后续按流程处理。'
        : '收到啦，谢谢。';
  }
  else if (incomingTransfer) replyText = '行，这就转你。';
  else if (/吃|饭|火锅|聚餐|餐厅/.test(text)) replyText = '可以啊，你定好时间和地方发我就行。';
  else if (/转账|钱|收款|红包/.test(text)) replyText = '好，按实际情况来，弄好跟我说一声。';
  else if (/在吗|忙吗|干嘛/.test(text)) replyText = '在呢，刚看到。怎么了？';
  else if (/谢谢|谢了/.test(text)) replyText = '客气啥，小事。';
  else if (/晚安|睡/.test(text)) replyText = '好，早点休息，晚安。';
  else if (/[?？]$/.test(text)) replyText = '我觉得可以，你要是确定了就跟我说一声。';
  else replyText = ['好，我知道了。', '行，没问题。', '哈哈可以，等你消息。'][text.length % 3];
  return { text: replyText, incomingTransfer };
}

export function createLocalContactChatBackend(options: { delayMs?: number } = {}): ContactChatBackend {
  return {
    async reply(request) {
      const delayMs = options.delayMs ?? 700;
      if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
      return localReply(request);
    },
  };
}

export function createResponsesContactChatBackend(options: {
  endpoint: string;
  model?: string;
  fetcher?: FetchLike;
  failureMode?: 'fallback' | 'throw';
  retryDelayMs?: number;
}): ContactChatBackend {
  const endpoint = options.endpoint.trim();
  if (!endpoint) throw new Error('联系人回复服务地址不能为空');
  const fetcher = options.fetcher || fetch;
  const retryDelayMs = options.retryDelayMs ?? 350;

  return {
    async reply(request) {
      const transferRequest = parseIncomingTransferRequest(request.messages);
      const eventContext = receiptEventContext(request);
      const instructionSections = [request.systemPrompt, `## 交易事实规则
微信转账记录是已经发生的真实系统事实。对话中的“[微信转账：…]”记录优先级高于普通聊天内容；你必须正确理解其中的“我”和“你”，不得否认、反转或虚构这些交易。`, `## 自主转账能力
你可以根据关系和上下文主动发起转账，不需要等待对方明确提出请求。如果你确实决定转账，请自然回复，并只在回复末尾附加 [WECHAT_ACTION:SEND_TRANSFER:金额]，例如 [WECHAT_ACTION:SEND_TRANSFER:88.00]。金额必须在0.01至2000元之间。这个标记仅供系统执行动作，不能向对方解释或展示；如果只是讨论、考虑、承诺稍后再转，绝不能附加标记。`];
      if (eventContext) {
        instructionSections.push(`## 本轮必须回应的真实事件
${eventContext}
你必须直接回应这个事件，结合金额、备注和双方关系给出简短自然的回复。资金方向是“对方转给你，你已收款”，绝不能说成“你已转给对方”。不要转换话题，不要虚构新的交易。`);
      }
      if (transferRequest) {
        instructionSections.push(`## 可自主决定的转账请求
对方请求你转账¥${(transferRequest.amountCents / 100).toFixed(2)}。是否转账由你根据关系和上下文自主决定：
- 如果同意，请自然回复，并只在回复末尾附加 ${SEND_TRANSFER_ACTION}
- 如果拒绝、犹豫或暂缓，就正常说明，不要附加该标记
标记仅供系统执行动作，不能向对方解释或展示。不得修改金额。`);
      }
      const requestInit: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          instructions: instructionSections.join('\n\n'),
          input: request.messages,
          store: false,
          metadata: {
            surface: 'mobilegym-wechat-contact',
            contact_id: request.contact.wxid,
          },
        }),
      };
      let response: Response | undefined;
      let networkError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await fetcher(endpoint, requestInit);
          networkError = undefined;
          if (response.ok || response.status < 500) break;
        } catch (error) {
          networkError = error;
        }
        if (attempt === 0 && retryDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }

      if (!response?.ok) {
        if (options.failureMode === 'throw' || (response && response.status < 500)) {
          throw new Error('联系人回复服务暂时不可用', { cause: networkError });
        }
        return {
          text: request.receiptEvent
            ? safeReceiptReply(request)
            : '刚刚网络有点卡，我看到你的消息了，等下再聊。',
        };
      }
      const data = await response.json() as { output_text?: unknown; text?: unknown; response?: unknown };
      const content = [data.output_text, data.text, data.response]
        .find(value => typeof value === 'string' && value.trim()) as string | undefined;
      if (!content) throw new Error('联系人回复服务未返回内容');
      const decision = extractModelTransferDecision(content.trim(), transferRequest);
      const decidedTransfer = decision.transfer;
      const reply: ContactChatReply = {
        text: decidedTransfer
          ? normalizeIncomingTransferReply(decision.text, decidedTransfer)
          : normalizeReceiptReply(decision.text, request),
      };
      if (decidedTransfer) reply.incomingTransfer = decidedTransfer;
      return reply;
    },
  };
}

let backendOverride: ContactChatBackend | null = null;

export function configureWechatContactChatBackend(backend: ContactChatBackend | null) {
  backendOverride = backend;
}

function buildDefaultBackend(): ContactChatBackend {
  const endpoint = String(import.meta.env.VITE_WECHAT_CONTACT_CHAT_ENDPOINT || '').trim();
  if (endpoint) {
    return createResponsesContactChatBackend({
      endpoint,
      model: String(import.meta.env.VITE_WECHAT_CONTACT_CHAT_MODEL || '').trim() || undefined,
    });
  }
  return createLocalContactChatBackend();
}

let defaultBackend: ContactChatBackend | null = null;

export function getWechatContactChatBackend(): ContactChatBackend {
  if (backendOverride) return backendOverride;
  if (!defaultBackend) defaultBackend = buildDefaultBackend();
  return defaultBackend;
}
