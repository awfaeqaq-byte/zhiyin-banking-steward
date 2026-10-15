import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {WealthInlineCompare} from './wealth-inline-compare';

afterEach(()=>vi.restoreAllMocks());

it('测评更新后隐藏旧推荐，允许重新询问，并将新回复详情折叠',async()=>{
  const assessedAt=Date.now()-1000;
  vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
    const url=String(input);
    if(url.includes('/api/zhiyin/wealth'))return new Response(JSON.stringify({version:1,receipts:[],assessment:{version:1,risk:'low',assessedAt,expiresAt:Date.now()+86400000,answers:{experience:0,loss:0,term:0,liquidity:0,income:0}}}));
    if(url.includes('/market-context'))return new Response(JSON.stringify({provider:'akshare',status:'ready',fetchedAt:Date.now(),stale:false,message:'',indicators:[],capabilities:[]}));
    return new Response(JSON.stringify({provider:'issuer_akshare',message:'暂无样本',records:[]}));
  });
  const explain=vi.fn(),open=vi.fn(),user=userEvent.setup();
  const view=render(<WealthInlineCompare reply="旧测评下推荐高风险产品。" replyAssessedAt={assessedAt-1} stewardName="宁宁" onExplain={explain} onOpenWealth={open}/>);
  expect(await screen.findByText('谨慎型 · 产品比较')).toBeInTheDocument();
  expect(screen.queryByText('旧测评下推荐高风险产品。')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'按新测评重新询问'}));
  expect(explain).toHaveBeenCalledWith(expect.stringContaining('已完成或更新风险测评'));
  await user.click(screen.getByRole('button',{name:'调整风险偏好'}));
  expect(open).toHaveBeenCalledOnce();

  view.rerender(<WealthInlineCompare reply="先核对可动用金额。具体费用和赎回规则请看下面的对比工具。" replyAssessedAt={assessedAt} stewardName="宁宁" onExplain={explain} onOpenWealth={open}/>);
  expect(screen.getByText('先核对可动用金额。')).toBeInTheDocument();
  const detail=screen.getByText('查看管家完整分析').closest('details');
  expect(detail).not.toHaveAttribute('open');
  await user.click(screen.getByText('查看管家完整分析'));
  expect(detail).toHaveAttribute('open');
  expect(screen.getByText(/具体费用和赎回规则请看下面的对比工具/)).toBeInTheDocument();
});
