import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import App from './App';
import {emptyMemory} from './lib/steward-memory';

vi.mock('./components/steward-workspaces', () => ({
  StewardWorkspaces: ({submittedMessage}: {submittedMessage?: {text: string}}) =>
    <div role="status" aria-label="交给管家的原话">{submittedMessage?.text}</div>,
}));
beforeEach(() => {vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(emptyMemory())));});
afterEach(() => vi.restoreAllMocks());

it.each(['小店资金安排', '小店下周五房租3000元', '我的小店今天收入'])('经典款发送“%s”直接衔接管家并保留完整原话', async text => {
  render(<App/>);
  fireEvent.change(screen.getByRole('textbox', {name: '告诉宁宁你想办理的事'}), {target: {value: text}});
  fireEvent.click(screen.getByRole('button', {name: '发送给宁宁'}));
  expect(await screen.findByRole('status', {name: '交给管家的原话'})).toHaveTextContent(text);
  expect(screen.queryByText('已收到你的需求，可以从下方选择一个场景继续体验。')).not.toBeInTheDocument();
});

it('个人消费仍进入原收支页面，不误判为经营需求', async () => {
  render(<App/>);
  fireEvent.change(screen.getByRole('textbox', {name: '告诉宁宁你想办理的事'}), {target: {value: '今天吃饭花了30元'}});
  fireEvent.click(screen.getByRole('button', {name: '发送给宁宁'}));
  await waitFor(()=>expect(screen.getByRole('heading', {name: '我的账单'})).toBeInTheDocument());
  expect(screen.queryByRole('status', {name: '交给管家的原话'})).not.toBeInTheDocument();
});
