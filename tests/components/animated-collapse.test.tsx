import {useRef, useState} from 'react';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {AnimatedCollapse} from '../../src/components/animated-collapse';
import {CalendarDatePicker} from '../../src/components/calendar-components';

function Disclosure() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} aria-expanded={open} onClick={() => setOpen(!open)}>详情</button>
    <AnimatedCollapse open={open} returnFocusRef={trigger} data-testid="details">
      <label>备注<input defaultValue="已填写" /></label>
      <button onClick={() => setOpen(false)}>收起</button>
    </AnimatedCollapse>
  </>;
}

it('收起立即移除交互语义并归还焦点，快速反向展开保留输入和同一节点', async () => {
  const user = userEvent.setup();
  render(<Disclosure />);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', {name: '详情'}));
  const input = screen.getByRole('textbox');
  await user.type(input, '继续填写');
  await user.click(screen.getByRole('button', {name: '收起'}));
  expect(screen.getByTestId('details')).toHaveAttribute('inert');
  expect(screen.getByTestId('details')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByRole('button', {name: '详情'})).toHaveFocus();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', {name: '详情'}));
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveValue('已填写继续填写');
  expect(screen.getByTestId('details')).not.toHaveAttribute('inert');
});

it('月历收起保留选中日期与其节点，只让当前周日期参与交互', async () => {
  const user = userEvent.setup();
  const onPick = vi.fn();
  render(<CalendarDatePicker month="2026-10" selected="2026-10-20" today="2026-10-20" events={[]} onPick={onPick} onMove={vi.fn()} />);
  const dates = screen.getByRole('group', {name: '选择日期'});
  const selected = screen.getByRole('button', {name: '2026-10-20'});
  expect(within(dates).getAllByRole('button').length).toBeGreaterThan(7);
  await user.click(screen.getByRole('button', {name: '收起月历'}));
  expect(within(dates).getAllByRole('button')).toHaveLength(7);
  expect(screen.getByRole('button', {name: '2026-10-20'})).toBe(selected);
  expect(selected).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', {name: '展开月历'}));
  expect(within(dates).getAllByRole('button').length).toBeGreaterThan(7);
  expect(screen.getByRole('button', {name: '2026-10-20'})).toBe(selected);
  expect(onPick).not.toHaveBeenCalled();
});
