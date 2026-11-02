import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, expect, it, vi} from 'vitest';
import {StewardChatHome} from '../../src/components/steward-chat-home';

const props = {
  stewardName: '宁宁', stewardImage: '/n.png', connections: {}, disabledReminders: [],
  onToggleReminder: vi.fn(), onOpenSubscriptions: vi.fn(), onPrepareCancel: vi.fn(),
};
const originalMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
afterEach(() => {
  if (originalMedia) Object.defineProperty(navigator, 'mediaDevices', originalMedia);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

it('长辈输入可以换行，发送时整段提交一次并清空输入', async () => {
  const route = vi.fn<(text: string) => Promise<void>>(async () => {});
  const user = userEvent.setup();
  render(<StewardChatHome {...props} elderMode homePreview seamless onRoutePrompt={route}/>);
  const input = screen.getByRole('textbox', {name: '和宁宁说点什么'});
  expect(input.tagName).toBe('TEXTAREA');
  await user.type(input, '饮料总共20元{Enter}我的可乐4元，啤酒16元大家平分');
  expect(route).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', {name: '发送给宁宁'}));
  await waitFor(() => expect(route).toHaveBeenCalledOnce());
  expect(route.mock.calls[0][0]).toBe('饮料总共20元\n我的可乐4元，啤酒16元大家平分');
  expect(input).toHaveValue('');
});

it('长辈语音有可见文字，打开只展示准备页，不自动调用麦克风', async () => {
  const media = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {configurable: true, value: {getUserMedia: media}});
  const user = userEvent.setup();
  const onVoiceRequest = vi.fn();
  const view = render(<StewardChatHome {...props} elderMode homePreview voiceEnabled={false} onVoiceRequest={onVoiceRequest}/>);
  view.rerender(<StewardChatHome {...props} elderMode homePreview voiceEnabled onVoiceRequest={onVoiceRequest}/>);
  const entry = screen.getByRole('button', {name: '和宁宁语音对话'});
  expect(entry).toHaveTextContent('语音聊天');
  await user.click(entry);
  expect(screen.getByRole('button', {name: '开始语音对话'})).toBeInTheDocument();
  expect(screen.getByRole('button', {name: '收起语音面板'})).toHaveTextContent('回到对话');
  expect(screen.queryByText(/已离开.*收音已停止/)).not.toBeInTheDocument();
  expect(media).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('region', {name: '语音对话'}), {key: 'Escape'});
  await waitFor(() => expect(entry).toHaveFocus());
  view.unmount();
});
