import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {AgentAutomationCenter} from './agent-automation-center';
import type {AutomationServerSnapshot} from '../lib/agent-automations';
import type {ConnectedFinancialSource} from '../lib/financial-connections';

afterEach(()=>vi.restoreAllMocks());

it('通过 Mastra 服务设置并立即运行账单任务',async()=>{
  const source:ConnectedFinancialSource={provider:'wechat_pay',displayName:'微信支付',accountMasked:'叶先生',scopes:['transactions'],syncedAt:'2026-09-30',autopays:[],transactions:[{id:'1',title:'午餐',amount:-2500,category:'餐饮',kind:'payment',occurredAt:'2026-09-30'}]};
  let snapshot:AutomationServerSnapshot={version:1,engine:'mastra',tasks:[],runs:[]};
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    if(String(input).includes('/api/zhiyin/market-context'))return new Response(JSON.stringify({provider:'akshare',status:'connected',message:'测试市场数据',indicators:[],capabilities:[]}),{status:200});
    const body=init?.body?JSON.parse(String(init.body)):null;
    if(body?.type==='start')snapshot={...snapshot,tasks:[{kind:body.kind,enabled:true,createdAt:Date.now(),mastraScheduleId:'schedule-test'}]};
    if(body?.type==='run'){
      const run={id:'run-test',kind:body.kind,status:'completed' as const,summary:'已核对 1 个授权来源、1 条本月记录；消费支出 ¥25.00。',evidence:[],startedAt:Date.now(),completedAt:Date.now(),trigger:'manual' as const,engine:'mastra' as const};
      snapshot={...snapshot,tasks:[{kind:body.kind,enabled:true,createdAt:Date.now(),mastraScheduleId:'schedule-test',lastRun:run}],runs:[run]};
    }
    return new Response(JSON.stringify(snapshot),{status:200});
  });
  const user=userEvent.setup();
  const discuss=vi.fn();
  const changed=vi.fn();
  render(<AgentAutomationCenter connections={{wechat_pay:source}} availableBalance={4030000} onOpenBills={vi.fn()} onOpenWealth={vi.fn()} onDiscussRun={discuss} onSnapshotChange={changed}/>);
  await user.click((await screen.findAllByRole('button',{name:'设置任务'}))[0]);
  expect(await screen.findByRole('status')).toHaveTextContent('已启用后台守护');
  await user.click(screen.getAllByRole('button',{name:'立即运行'})[0]);
  expect(await screen.findAllByText(/¥25.00/)).not.toHaveLength(0);
  expect(screen.getByText('运行与确认记录')).toBeVisible();
  await user.click(screen.getByRole('button',{name:'继续问宁宁'}));
  expect(discuss).toHaveBeenCalledWith(expect.objectContaining({id:'run-test'}));
  expect(changed).toHaveBeenCalled();
});
