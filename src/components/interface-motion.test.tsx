import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useConversationArrival, usePageMotion} from '../lib/use-interface-motion';
import {MotionPresence} from './motion-presence';

const cancel = vi.fn();
const animate = vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => {cancel: typeof cancel}>(() => ({cancel}));
const listeners = new Set<() => void>();
let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.stubGlobal('matchMedia', () => ({matches: reduced,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{width: 100}] as unknown as DOMRectList);
  Object.defineProperty(HTMLElement.prototype, 'animate', {configurable: true, value: animate});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); animate.mockClear(); cancel.mockClear(); listeners.clear(); delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });

function Page({page, intent = 'forward'}: {page: string; intent?: 'forward' | 'back'}) {
  const ref = usePageMotion(page, intent);
  return <main ref={ref}><section className="steward-message"><input aria-label="草稿" defaultValue="保留原话"/>{page}</section><div data-page-persistent>后台处理</div></main>;
}
function Conversation({ids, ready = true, session = 'one'}: {ids: string[]; ready?: boolean; session?: string}) {
  const ref = useConversationArrival(ids, ready, session);
  return <div ref={ref}>{ids.map(id => <div key={id} data-message-id={id}>{id}</div>)}</div>;
}

it('切页按导航顺序移动内容，快速反向取消前次动画，保留输入实例和后台容器', () => {
  const view = render(<Page page="home"/>);
  const input = screen.getByLabelText('草稿');
  expect(animate).not.toHaveBeenCalled();
  view.rerender(<Page page="assets"/>);
  expect(animate).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('草稿')).toBe(input);
  view.rerender(<Page page="home"/>);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(animate).toHaveBeenCalledTimes(2);
  expect(animate.mock.calls[0][0][0].translate).toBe('26px 0');
  expect(animate.mock.calls[1][0][0].translate).toBe('-26px 0');
  expect(document.querySelector('main')?.style.transform).toBe('');
});
it('详情返回沿返回方向移动，有固定输入条的页面保持原位', () => {
  const view = render(<Page page="tasks"/>);
  view.rerender(<Page page="subscriptions" intent="back"/>);
  expect(animate.mock.calls[0][0][0].translate).toBe('-26px 0');
  document.querySelector('section')?.classList.add('occasion-planner');
  view.rerender(<Page page="occasions"/>);
  expect(animate.mock.calls[1][0][0].translate).toBe('none');
});
it('关闭动态偏好时不启动动画；运行期间更改偏好会停止动画', () => {
  const view = render(<Page page="home"/>);
  view.rerender(<Page page="assets"/>);
  act(() => { reduced = true; listeners.forEach(listener => listener()); });
  expect(cancel).toHaveBeenCalled();
  view.rerender(<Page page="wealth"/>);
  expect(animate).toHaveBeenCalledTimes(1);
});
it('恢复历史和更换会话不重播，只为新消息播放一次', () => {
  const view = render(<Conversation ids={[]} ready={false}/>);
  view.rerender(<Conversation ids={['old']} ready/>);
  expect(animate).not.toHaveBeenCalled();
  view.rerender(<Conversation ids={['old', 'new']}/>);
  expect(animate).toHaveBeenCalledTimes(1);
  view.rerender(<Conversation ids={['old', 'new']}/>);
  expect(animate).toHaveBeenCalledTimes(1);
  view.rerender(<Conversation ids={['older', 'old', 'new']}/>);
  expect(animate).toHaveBeenCalledTimes(1);
  view.rerender(<Conversation ids={['replacement']}/>);
  expect(animate).toHaveBeenCalledTimes(1);
  view.rerender(<Conversation ids={['other']} session="two"/>);
  expect(animate).toHaveBeenCalledTimes(1);
});
it('批量历史刷新、隐藏的后台消息和减少动态偏好都不播放入场', () => {
  const view = render(<Conversation ids={['one']}/>);
  view.rerender(<Conversation ids={['one', 'two', 'three', 'four', 'five']}/>);
  vi.mocked(HTMLElement.prototype.getClientRects).mockReturnValue([] as unknown as DOMRectList);
  view.rerender(<Conversation ids={['one', 'two', 'three', 'four', 'five', 'six']}/>);
  reduced = true;
  view.rerender(<Conversation ids={['one', 'two', 'three', 'four', 'five', 'six', 'seven']}/>);
  expect(animate).not.toHaveBeenCalled();
});
it('收起侧栏立即禁止输入，快速重开不会被旧退出计时器移除', () => {
  vi.useFakeTimers();
  const view = render(<MotionPresence open><button>会话入口</button></MotionPresence>);
  view.rerender(<MotionPresence open={false}><button>会话入口</button></MotionPresence>);
  expect(screen.getByText('会话入口').parentElement).toHaveAttribute('inert');
  act(() => vi.advanceTimersByTime(80));
  view.rerender(<MotionPresence open><button>会话入口</button></MotionPresence>);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('button', {name: '会话入口'})).toBeVisible();
  view.rerender(<MotionPresence open={false}><button>会话入口</button></MotionPresence>);
  act(() => vi.advanceTimersByTime(160));
  expect(screen.queryByText('会话入口')).not.toBeInTheDocument();
});
it('减少动态效果时立即收起侧栏', () => {
  reduced = true;
  const view = render(<MotionPresence open>会话</MotionPresence>);
  view.rerender(<MotionPresence open={false}>会话</MotionPresence>);
  expect(screen.queryByText('会话')).not.toBeInTheDocument();
});
