import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import App from '../../src/App';
import {emptyMemory} from '../../src/lib/steward-memory';

afterEach(()=>vi.restoreAllMocks());

it('从首页查看订阅、从资产查看账单时，导航保持对应入口且返回路径不变',async()=>{
  localStorage.setItem('zhiyin-mode','"native"');
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(emptyMemory())));
  const user=userEvent.setup();render(<App/>);
  const nav=()=>within(screen.getByRole('navigation',{name:'主导航'}));
  await user.click(screen.getByRole('button',{name:'订阅'}));
  expect(nav().getByRole('button',{name:'管家'})).toHaveAttribute('aria-current','page');
  await user.click(screen.getByRole('button',{name:'返回'}));
  expect(screen.getByRole('textbox',{name:'和宁宁说点什么'})).toBeInTheDocument();
  await user.click(nav().getByRole('button',{name:'资产'}));
  await user.click(screen.getByRole('button',{name:/授权账单报告/}));
  expect(nav().getByRole('button',{name:'资产'})).toHaveAttribute('aria-current','page');
  await user.click(screen.getByRole('button',{name:'返回'}));
  expect(screen.getByRole('heading',{name:'资产分布'})).toBeInTheDocument();
});
