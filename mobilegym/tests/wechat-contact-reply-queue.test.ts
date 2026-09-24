import { describe, expect, it } from 'vitest';
import { createContactReplyQueue } from '../apps/Wechat/chat-ai/reply-queue';

describe('Wechat contact reply queue', () => {
  it('keeps a transfer receipt event that arrives while the contact is already replying', () => {
    const queue = createContactReplyQueue();
    const receiptEvent = {
      type: 'contact_received_user_transfer' as const,
      amountCents: 5200,
      note: '晚餐AA',
    };

    expect(queue.begin('wxid_lina_lina')).toBe(true);
    expect(queue.begin('wxid_lina_lina', receiptEvent)).toBe(false);

    expect(queue.finish('wxid_lina_lina')).toEqual({ receiptEvent });
    expect(queue.begin('wxid_lina_lina')).toBe(true);
    expect(queue.finish('wxid_lina_lina')).toBeUndefined();
  });

  it('preserves the order of multiple transfer receipt events for one contact', () => {
    const queue = createContactReplyQueue();
    const first = {
      type: 'contact_received_user_transfer' as const,
      amountCents: 1800,
      note: '咖啡',
    };
    const second = {
      type: 'contact_received_user_transfer' as const,
      amountCents: 3500,
      note: '打车',
    };

    expect(queue.begin('wxid_lina_lina')).toBe(true);
    expect(queue.begin('wxid_lina_lina', first)).toBe(false);
    expect(queue.begin('wxid_lina_lina', second)).toBe(false);

    expect(queue.finish('wxid_lina_lina')).toEqual({ receiptEvent: first });
    expect(queue.begin('wxid_lina_lina')).toBe(true);
    expect(queue.finish('wxid_lina_lina')).toEqual({ receiptEvent: second });
  });

  it('schedules one follow-up reply for messages sent while a reply is in progress', () => {
    const queue = createContactReplyQueue();

    expect(queue.begin('wxid_lina_lina')).toBe(true);
    expect(queue.begin('wxid_lina_lina')).toBe(false);
    expect(queue.begin('wxid_lina_lina')).toBe(false);

    expect(queue.finish('wxid_lina_lina')).toEqual({});
    expect(queue.begin('wxid_lina_lina')).toBe(true);
    expect(queue.finish('wxid_lina_lina')).toBeUndefined();
  });

  it('cancels active and queued replies when chat state is reset', () => {
    const queue = createContactReplyQueue();

    expect(queue.begin('wxid_lina_lina')).toBe(true);
    expect(queue.begin('wxid_lina_lina')).toBe(false);

    queue.clear();

    expect(queue.finish('wxid_lina_lina')).toBeUndefined();
    expect(queue.begin('wxid_lina_lina')).toBe(true);
  });
});
