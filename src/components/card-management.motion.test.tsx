import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {type BankCardId} from '../lib/bank-transfer';
import {CardManagement} from './card-management';

const directories: string[] = [];
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  for (const directory of directories.splice(0)) rmSync(directory, {recursive: true, force: true});
});

it('快速选卡从当前画面位置接续且保持焦点，隐藏、减弱动态和卸载均停止动画', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'zhiyin-wallet-motion-'));
  directories.push(directory);
  const bank = createBankStore(join(directory, 'bank.json'));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = new URL(String(input), 'http://localhost');
    if (url.searchParams.get('view') === 'cards') return new Response(JSON.stringify(bank.getCards()));
    const cardId = url.searchParams.get('cardId') as BankCardId | null;
    return new Response(JSON.stringify(cardId ? bank.forCard(cardId).get() : bank.get()));
  });

  let hidden = false, reduced = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const preferenceListeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    media: query,
    get matches() { return reduced; },
    addEventListener: (_type: string, listener: () => void) => preferenceListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => preferenceListeners.delete(listener),
  } as unknown as MediaQueryList));

  const visibleTransforms = new Map<string, string>();
  const readStyle = globalThis.getComputedStyle;
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    const style = readStyle(element, pseudoElement);
    if (element.classList.contains('card-wallet')) style.setProperty('--wallet-slot', '54px');
    if (element instanceof HTMLElement && element.dataset.cardId) {
      const transform = visibleTransforms.get(element.dataset.cardId) ?? `translateY(${Number(element.style.getPropertyValue('--wallet-position')) * 54}px)`;
      Object.defineProperty(style, 'transform', {configurable: true, value: transform});
    }
    return style;
  });
  const motions: {id: string; frames: Keyframe[]; cancel: ReturnType<typeof vi.fn>}[] = [];
  Object.defineProperty(HTMLElement.prototype, 'animate', {configurable: true, value: function (this: HTMLElement, frames: Keyframe[]) {
    const id = this.dataset.cardId!;
    const cancel = vi.fn(() => {visibleTransforms.delete(id);});
    motions.push({id, frames, cancel});
    return {cancel};
  }});

  const view = render(<CardManagement onAsk={vi.fn()} onTransfer={vi.fn()}/>);
  await within(await screen.findByLabelText('尾号 8888 的卡片详情')).findByText('¥42,300.00');
  const primary = screen.getByRole('button', {name: '日常支付卡，尾号 8888，正常'});
  const living = screen.getByRole('button', {name: '生活备用卡，尾号 6216，正常'});
  const reserve = screen.getByRole('button', {name: '储蓄备用卡，尾号 9073，正常'});
  fireEvent.click(living);
  expect(living).toHaveFocus();
  expect(motions).toHaveLength(3);

  // The second selection interrupts each card at a visible intermediate frame.
  const interruptedFrames = {primary: 'matrix(1, 0, 0, 1, 0, 72)', living: 'matrix(1, 0, 0, 1, 0, 36)', reserve: 'matrix(1, 0, 0, 1, 0, 81)'};
  for (const [id, transform] of Object.entries(interruptedFrames)) visibleTransforms.set(id, transform);
  fireEvent.click(reserve);
  expect(reserve).toHaveFocus();
  expect(reserve).toHaveAttribute('aria-pressed', 'true');
  expect(motions).toHaveLength(6);
  for (const motion of motions.slice(0, 3)) expect(motion.cancel).toHaveBeenCalledTimes(1);
  for (const motion of motions.slice(3, 6)) {
    expect(motion.frames[0].transform).toBe(interruptedFrames[motion.id as BankCardId]);
  }
  expect(motions.slice(3, 6).find(motion => motion.id === 'reserve')?.frames[1].transform).toBe('translateY(108px)');

  act(() => {reduced = true; preferenceListeners.forEach(listener => listener());});
  for (const motion of motions.slice(3, 6)) expect(motion.cancel).toHaveBeenCalledTimes(1);
  fireEvent.click(primary);
  expect(primary).toHaveFocus();
  expect(motions).toHaveLength(6);

  act(() => {reduced = false; preferenceListeners.forEach(listener => listener());});
  fireEvent.click(living);
  expect(motions).toHaveLength(9);
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  for (const motion of motions.slice(6, 9)) expect(motion.cancel).toHaveBeenCalledTimes(1);
  fireEvent.click(reserve);
  expect(motions).toHaveLength(9);

  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  fireEvent.click(primary);
  expect(motions).toHaveLength(12);
  view.unmount();
  for (const motion of motions.slice(9)) expect(motion.cancel).toHaveBeenCalledTimes(1);
  expect(preferenceListeners.size).toBe(0);
});
