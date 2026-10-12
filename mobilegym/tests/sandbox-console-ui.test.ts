import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SandboxConsoleView } from '../sandbox/SandboxConsole';

const noop = vi.fn();

describe('SandboxConsoleView', () => {
  it('keeps the closed drawer out of the accessibility tree and focus order', () => {
    const html = renderToStaticMarkup(React.createElement(SandboxConsoleView, {
      isOpen: false,
      phase: 'idle',
      onOpen: noop,
      onClose: noop,
      onRequestReset: noop,
      onCancelReset: noop,
      onConfirmReset: noop,
    }));

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('inert=""');
  });

  it('presents a scoped WeChat chat reset from the open console', () => {
    const html = renderToStaticMarkup(React.createElement(SandboxConsoleView, {
      isOpen: true,
      phase: 'idle',
      onOpen: noop,
      onClose: noop,
      onRequestReset: noop,
      onCancelReset: noop,
      onConfirmReset: noop,
    }));

    expect(html).toContain('沙箱控制台');
    expect(html).toContain('模型配置');
    expect(html).toContain('实时语音');
    expect(html).toContain('财务测试');
    expect(html).toContain('聊天与数据');
    expect(html).toContain('知银管家');
    expect(html).toContain('重置宁宁');
    expect(html).toContain('<details class="sandbox-category"');
    expect(html).not.toContain('autocomplete="on"');
    expect(html).toContain('微信聊天');
    expect(html).toContain('恢复初始聊天');
    expect(html).toContain('aria-label="关闭沙箱控制台"');
    expect(html).toContain('测试场景');
    expect(html).toContain('修改测试余额');
    expect(html).toContain('推进时间与扣费');
    expect(html).toContain('不会自动授予知银权限');
    expect(html).toContain('操作记录');
    expect(html).not.toContain('1 项可用');
  });

  it('explains the exact reset boundary before confirmation', () => {
    const html = renderToStaticMarkup(React.createElement(SandboxConsoleView, {
      isOpen: true,
      phase: 'confirming',
      onOpen: noop,
      onClose: noop,
      onRequestReset: noop,
      onCancelReset: noop,
      onConfirmReset: noop,
    }));

    expect(html).toContain('仅恢复会话列表与消息');
    expect(html).toContain('不会影响微信零钱、账单、联系人和其他应用');
    expect(html).toContain('确认恢复');
    expect(html).toContain('取消');
    expect(html).toContain('aria-describedby="sandbox-reset-description"');
    expect(html).toContain('tabindex="-1"');
  });

  it('shows a verifiable completion summary', () => {
    const html = renderToStaticMarkup(React.createElement(SandboxConsoleView, {
      isOpen: true,
      phase: 'success',
      result: {
        conversations: 8,
        removedMessages: 12,
        restoredMessages: 34,
      },
      onOpen: noop,
      onClose: noop,
      onRequestReset: noop,
      onCancelReset: noop,
      onConfirmReset: noop,
    }));

    expect(html).toContain('微信聊天已恢复');
    expect(html).toContain('8 个会话');
    expect(html).toContain('34 条初始消息');
  });
});
