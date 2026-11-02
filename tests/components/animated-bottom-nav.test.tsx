import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {CreditCard, MessageCircle, PieChart, TrendingUp, UserRound} from 'lucide-react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {AnimatedBottomNav} from '../../src/components/animated-bottom-nav';

const items = [
  {page: 'home', label: '管家', icon: MessageCircle},
  {page: 'assets', label: '资产', icon: PieChart},
  {page: 'risk', label: '财富', icon: TrendingUp},
  {page: 'cards', label: '卡片', icon: CreditCard},
  {page: 'profile', label: '我的', icon: UserRound},
] as const;
const resizeCallbacks = new Set<() => void>();
let width = 400;
let visible = true;

beforeEach(() => {
  width = 400;
  visible = true;
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) { resizeCallbacks.add(callback); }
    observe() {}
    disconnect() { resizeCallbacks.delete(this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function(this: HTMLElement) {
    return this.tagName === 'NAV' && visible ? width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(64);
  vi.spyOn(HTMLElement.prototype, 'clientTop', 'get').mockImplementation(function(this: HTMLElement) {
    return this.tagName === 'NAV' ? 1 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const rect = (x: number, y: number, w: number, h: number) => ({
      x, y, left: x, top: y, right: x + w, bottom: y + h, width: w, height: h,
      toJSON: () => ({}),
    });
    if (this.tagName === 'NAV') return rect(100, 400, visible ? width / 2 : 0, 32);
    const button = this.parentElement;
    if (button?.tagName === 'BUTTON') {
      const index = Array.from(button.parentElement!.querySelectorAll('button')).indexOf(button as HTMLButtonElement);
      const cellWidth = (width - 20) / items.length;
      return rect(100 + (10 + cellWidth * index + (cellWidth - 44) / 2) / 2, 402.5, visible ? 22 : 0, 15);
    }
    return rect(0, 0, 0, 0);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); resizeCallbacks.clear(); });

it('选中胶囊从当前入口就位，导航保留原有语义与回调', () => {
  const navigate = vi.fn();
  render(<AnimatedBottomNav items={items} activePage="profile" onNavigate={navigate}/>);
  const nav = screen.getByRole('navigation', {name: '主导航'});
  expect(screen.getAllByRole('button')).toHaveLength(5);
  expect(screen.getByRole('button', {name: '我的'})).toHaveAttribute('aria-current', 'page');
  expect(nav.querySelector('.bottom-nav-indicator')).toHaveStyle({transform: 'translate3d(330px, 4px, 0)', width: '44px', height: '30px'});
  fireEvent.click(screen.getByRole('button', {name: '财富'}));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('risk');
});

it('快速切换复用同一个胶囊和按钮，保持焦点与可连续反向的 CSS 过渡', () => {
  const view = render(<AnimatedBottomNav items={items} activePage="home" onNavigate={vi.fn()}/>);
  const indicator = screen.getByRole('navigation').querySelector('.bottom-nav-indicator');
  const button = screen.getByRole('button', {name: '财富'});
  button.focus();
  view.rerender(<AnimatedBottomNav items={items} activePage="risk" onNavigate={vi.fn()}/>);
  expect(indicator).toHaveStyle({transform: 'translate3d(178px, 4px, 0)'});
  view.rerender(<AnimatedBottomNav items={items} activePage="assets" onNavigate={vi.fn()}/>);
  expect(screen.getByRole('navigation').querySelector('.bottom-nav-indicator')).toBe(indicator);
  expect(indicator).toHaveStyle({transform: 'translate3d(102px, 4px, 0)'});
  expect(screen.getByRole('button', {name: '财富'})).toBe(button);
  expect(button).toHaveFocus();
});

it('屏幕宽度和可见性变化重新对齐指示器，卸载清理尺寸监听', () => {
  const view = render(<AnimatedBottomNav items={items} activePage="profile" onNavigate={vi.fn()}/>);
  width = 360;
  act(() => resizeCallbacks.forEach(callback => callback()));
  expect(screen.getByRole('navigation').querySelector('.bottom-nav-indicator')).toHaveStyle({transform: 'translate3d(294px, 4px, 0)'});
  visible = false;
  act(() => resizeCallbacks.forEach(callback => callback()));
  expect(screen.getByRole('navigation').querySelector('.bottom-nav-indicator')).toBeNull();
  visible = true;
  act(() => resizeCallbacks.forEach(callback => callback()));
  expect(screen.getByRole('navigation').querySelector('.bottom-nav-indicator')).toHaveStyle({transform: 'translate3d(294px, 4px, 0)'});
  view.unmount();
  expect(resizeCallbacks.size).toBe(0);
});
