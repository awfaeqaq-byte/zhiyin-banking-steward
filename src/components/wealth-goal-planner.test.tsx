import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it} from 'vitest';
import {WealthGoalPlanner} from './wealth-goal-planner';

it('保存理财目标并在重新打开后恢复',async()=>{
  const user=userEvent.setup();
  const view=render(<WealthGoalPlanner/>);
  const amount=screen.getByRole('textbox',{name:'目标金额'});
  await user.clear(amount);
  await user.type(amount,'88000');
  await user.click(screen.getByRole('button',{name:'保存目标'}));
  expect(screen.getByRole('status')).toHaveTextContent('目标已保存');
  view.unmount();
  render(<WealthGoalPlanner/>);
  expect(screen.getByRole('textbox',{name:'目标金额'})).toHaveValue('88000');
});
