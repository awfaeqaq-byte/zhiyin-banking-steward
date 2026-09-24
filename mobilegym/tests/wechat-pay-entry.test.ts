import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../apps/Wechat/hooks/useWechatStrings', () => ({
  useWechatStrings: () => ({
    chat_image_placeholder: '[图片]',
    chat_file_placeholder: '[文件]',
    time_yesterday: '昨天',
    chat_list_date_format_month_day: '{{m}}月{{d}}日',
  }),
}));

vi.mock('../apps/Wechat/hooks/useWechatGestures', () => ({
  useWechatGestures: () => ({
    bindTap: (id: string) => ({ 'data-test-transition': id }),
  }),
}));

vi.mock('../apps/Wechat/state', () => ({
  useWechatStore: (selector: (state: { chats: never[]; contacts: never[] }) => unknown) =>
    selector({ chats: [], contacts: [] }),
}));

describe('WeChat Pay service conversation entry', () => {
  it('appears beside normal conversations and opens the payment message feed', async () => {
    const { default: ChatList } = await import('../apps/Wechat/pages/ChatList');
    const markup = renderToStaticMarkup(React.createElement(ChatList));

    expect(markup).toContain('微信支付');
    expect(markup).toContain('9月记账日报已生成');
    expect(markup).toContain('data-test-transition="wechatPay.open"');
  });
});
