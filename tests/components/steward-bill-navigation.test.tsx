import {render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {StewardChatHome} from '../../src/components/steward-chat-home';
import type {ConnectedFinancialSource} from '../../src/lib/financial-connections';
import type {StewardReplyFn} from '../../src/lib/steward-chat';

const source:ConnectedFinancialSource={
 provider:'wechat_pay',displayName:'微信支付',accountMasked:'测试',scopes:['transactions'],
 syncedAt:'2026-09-24',autopays:[],transactions:[
  {id:'lunch',title:'午餐',amount:-2500,category:'餐饮',occurredAt:'2026-09-20'},
  {id:'metro',title:'地铁',amount:-500,category:'交通',occurredAt:'2026-09-20'},
 ],
};
const base={seamless:true,homePreview:true,stewardName:'宁宁',stewardImage:'/n.png',disabledReminders:[],
 onToggleReminder:vi.fn(),onOpenSubscriptions:vi.fn(),onPrepareCancel:vi.fn(),now:Date.parse('2026-09-24')};

it('分类分析直接展示解读，改选另一分类后不复用旧分类解释',async()=>{
 const user=userEvent.setup();
 const reply=vi.fn<StewardReplyFn>(async request=>({text:request.billCategory==='餐饮'?'餐饮这部分主要来自午餐。':'我已整理当前账单。'}));
 render(<StewardChatHome {...base} connections={{wechat_pay:source}} reply={reply}/>);
 await user.type(screen.getByRole('textbox'),'本月支出');
 await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
 const initial=await screen.findByRole('region',{name:'账单分析'});
 expect(within(initial).getByRole('button',{name:'概览'})).toHaveAttribute('aria-pressed','true');
 await user.click(within(initial).getByRole('button',{name:'查看餐饮交易 ¥25'}));
 await user.click(within(initial).getByRole('button',{name:'解读'}));
 await user.click(within(initial).getByRole('button',{name:'重新分析当前账单'}));
 await waitFor(()=>expect(reply).toHaveBeenCalledTimes(2));
 expect(reply.mock.calls[1][0].billCategory).toBe('餐饮');
 const analyzed=screen.getByRole('region',{name:'账单分析'});
 expect(await within(analyzed).findByText('餐饮这部分主要来自午餐。')).toBeVisible();
 expect(within(analyzed).getByRole('button',{name:'解读'})).toHaveAttribute('aria-pressed','true');
 await user.click(within(analyzed).getByRole('button',{name:'概览'}));
 await user.click(within(analyzed).getByRole('button',{name:'查看交通交易 ¥5'}));
 await user.click(within(analyzed).getByRole('button',{name:'解读'}));
 expect(within(analyzed).queryByText('餐饮这部分主要来自午餐。')).not.toBeInTheDocument();
 expect(within(analyzed).getByRole('status')).toHaveTextContent('补充解读需重新生成');
 expect(within(analyzed).getByRole('button',{name:'重新分析当前账单'})).toBeEnabled();
 expect(reply).toHaveBeenCalledTimes(2);
});

it('首轮显示概览，明确点击交易解释后新回复直接打开解读',async()=>{
 const user=userEvent.setup();
 const reply=vi.fn<StewardReplyFn>(async request=>({text:request.billFocus?'这笔午餐发生在九月二十日，可以继续核对用途。':'我已整理当前账单。'}));
 render(<StewardChatHome {...base} connections={{wechat_pay:source}} reply={reply}/>);
 await user.type(screen.getByRole('textbox'),'本月支出');
 await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
 const initial=await screen.findByRole('region',{name:'账单分析'});
 expect(within(initial).getByRole('button',{name:'概览'})).toHaveAttribute('aria-pressed','true');
 expect(within(initial).queryByText('我已整理当前账单。')).not.toBeInTheDocument();
 await user.click(within(initial).getByRole('button',{name:'请宁宁解释午餐 ¥25'}));
 await waitFor(()=>expect(reply).toHaveBeenCalledTimes(2));
 expect(reply.mock.calls[1][0].billFocus).toEqual({provider:'wechat_pay',id:'lunch'});
 const analyzed=screen.getByRole('region',{name:'账单分析'});
 expect(await within(analyzed).findByText('这笔午餐发生在九月二十日，可以继续核对用途。')).toBeVisible();
 expect(within(analyzed).getByRole('button',{name:'解读'})).toHaveAttribute('aria-pressed','true');
 expect(within(analyzed).getByRole('button',{name:'概览'})).toHaveAttribute('aria-pressed','false');
 expect(screen.getAllByRole('region',{name:'账单分析'})).toHaveLength(1);
});
