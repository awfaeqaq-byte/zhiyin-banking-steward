import {StrictMode} from 'react';
import {render, screen, waitFor, fireEvent} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {StewardChatHome} from '../../src/components/steward-chat-home';

const props = {stewardName:'宁宁', stewardImage:'/n.png', connections:{}, disabledReminders:[], onToggleReminder:vi.fn(), onOpenSubscriptions:vi.fn(), onPrepareCancel:vi.fn()};

it('其他首页已发送的消息等待载入后只提交一次，不要求重新发送', async () => {
  const route=vi.fn().mockResolvedValue(undefined), consumed=vi.fn();
  const forwarded={submittedMessage:{token:'classic-message-1',text:'小店下周五房租3000元'},onSubmittedMessageConsumed:consumed};
  const view=(disabled:boolean)=><StrictMode><StewardChatHome {...props} {...forwarded} homePreview onRoutePrompt={route} submissionDisabled={disabled}/></StrictMode>;
  const {rerender}=render(view(true));
  expect(route).not.toHaveBeenCalled(); expect(consumed).not.toHaveBeenCalled();
  rerender(view(false));
  await waitFor(()=>expect(route).toHaveBeenCalledTimes(1));
  expect(route.mock.calls[0][0]).toBe(forwarded.submittedMessage.text);
  expect(consumed).toHaveBeenCalledTimes(1);
  rerender(view(false));
  expect(route).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toHaveValue('');
});

it('转交提交失败时恢复原话，用户可以编辑后重试',async()=>{
  const route=vi.fn().mockRejectedValue(new Error('网络断开'));
  const forwarded={submittedMessage:{token:'classic-message-fail',text:'小店下周五房租3000元'}};
  render(<StewardChatHome {...props} {...forwarded} homePreview onRoutePrompt={route}/>);
  const input=screen.getByRole('textbox',{name:'和宁宁说点什么'});
  await waitFor(()=>expect(input).toHaveValue(forwarded.submittedMessage.text));
  route.mockResolvedValue(undefined);
  fireEvent.change(input,{target:{value:'小店下周五房租2800元'}});
  fireEvent.click(screen.getByRole('button',{name:'发送给宁宁'}));
  await waitFor(()=>expect(route).toHaveBeenCalledTimes(2));
  expect(route.mock.calls[1][0]).toBe('小店下周五房租2800元');
});
