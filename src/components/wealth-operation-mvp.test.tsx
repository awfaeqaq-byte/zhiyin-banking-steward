import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWealthStore} from '../../server/wealth-store';
import {createBankStore} from '../../server/bank-store';
import {WealthOperationMvp} from './wealth-operation-mvp';

let directory='';
afterEach(()=>{vi.restoreAllMocks();if(directory)rmSync(directory,{recursive:true,force:true});directory='';});
function mockServer(){directory=mkdtempSync(join(tmpdir(),'wealth-ui-'));const store=createWealthStore(createBankStore(join(directory,'bank.json')));vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
 if(String(_url).includes('/market-context'))return new Response(JSON.stringify({provider:'akshare',status:'ready',fetchedAt:Date.now(),stale:false,message:'已更新',indicators:[{key:'csi300',label:'沪深300',date:'20261008',value:4310.28,unit:'point',change:-1.0864},{key:'shibor_3m',label:'Shibor 3个月',date:'20261008',value:1.43,unit:'percent'}],capabilities:[]}));
 if(String(_url).includes('/fund-samples'))return new Response(JSON.stringify({provider:'issuer_akshare',message:'3 项有数据',records:[{code:'110006',metric:'per_10k_income',status:'ready',date:'2026-10-08',value:0.2437,sevenDayAnnualizedPct:1.002,source:'https://www.efunds.com.cn/fund/110006.shtml',crossCheck:'issuer_only'},{code:'026197',metric:'unit_nav',status:'ready',date:'2026-10-08',value:0.9852,changePct:-0.36,source:'https://www.efunds.com.cn/fund/026197.shtml',crossCheck:'matched'},{code:'510330',metric:'unit_nav',status:'ready',date:'2026-10-08',value:4.5699,changePct:-1.1,source:'https://www.chinaamc.com/fund/510330/index.shtml',crossCheck:'matched'}]}));
 const body=options?.body?JSON.parse(String(options.body)):null;
 try{const data=!body?store.get():body.type==='assess'?store.assess(body.answers):body.type==='prepare'?store.prepare(body):body.type==='confirm'?store.confirm(body.draftId):body.type==='prepare-redemption'?store.prepareRedemption(body.holdingId):store.confirmRedemption(body.draftId);return new Response(JSON.stringify(data));}
 catch(error){return new Response(JSON.stringify({error:(error as Error).message}),{status:400});}
});return store;}
async function answer(user:ReturnType<typeof userEvent.setup>,choice='0'){
 await user.click(screen.getByRole('button',{name:'开始风险测评'}));
 const options=choice==='2'?['经验较多','可接受较大波动','三年以上','短期无需动用','较稳定']:['没有经验','不能接受本金亏损','一年内需要','随时可能用钱','不稳定'];
 for(let index=0;index<options.length;index++){
  await user.click(screen.getByRole('button',{name:options[index]}));
  await user.click(screen.getByRole('button',{name:index===options.length-1?'保存风险测评':'下一题'}));
 }
}

describe('理财操作页面端到端沙箱场景',()=>{
 it('未填投入计划也能浏览基金目录，通过宁宁对话补全条件',async()=>{
  mockServer();render(<WealthOperationMvp amount="" term=""/>);
  expect(screen.queryByRole('spinbutton',{name:'试算投入金额'})).not.toBeInTheDocument();
  expect(screen.queryByRole('slider',{name:'试算持有期限'})).not.toBeInTheDocument();
  expect(screen.getByRole('region',{name:'基金目录'})).toBeInTheDocument();
  expect(within(screen.getByRole('region',{name:'基金目录'})).getAllByRole('article')).toHaveLength(11);
  expect(screen.getByRole('textbox',{name:'和宁宁聊财富计划'})).toBeInTheDocument();
 });
 it('真实市场样本只作背景；交互比较会同步费用、期限和余额约束',async()=>{
  mockServer();const user=userEvent.setup();render(<WealthOperationMvp amount="30000" term="12"/>);
  expect(screen.getByText(/完成并保存风险测评后/)).toBeInTheDocument();
  expect(screen.queryByRole('region',{name:'真实市场观察'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/稳健固收组合/})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'生成待确认申购方案'})).not.toBeInTheDocument();
  await answer(user,'2');
  await user.click(screen.getByText('展开对比分析与市场资料'));
  expect(await within(screen.getByRole('region',{name:'真实市场观察'})).findByText(/沪深300/)).toBeInTheDocument();
  expect(screen.getAllByText(/数据日 2026-10-08/)).toHaveLength(2);
  expect(await screen.findByRole('button',{name:/稳健固收组合，本次申购费 60 元/})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'最短持有'}));
  expect(screen.getByRole('button',{name:/稳健固收组合，最短持有 6 个月/})).toBeInTheDocument();
  await user.click(within(screen.getByRole('group',{name:'候选产品'})).getByRole('button',{name:/稳健固收组合/}));
  expect(screen.getByRole('button',{name:'生成待确认申购方案'})).toBeEnabled();
  await user.click(screen.getByRole('button',{name:/返回产品列表/}));
  await user.clear(screen.getByRole('spinbutton',{name:'试算投入金额'}));
  await user.type(screen.getByRole('spinbutton',{name:'试算投入金额'}),'50000');
  await user.click(within(screen.getByRole('group',{name:'候选产品'})).getByRole('button',{name:/稳健固收组合/}));
  expect(screen.getByRole('button',{name:'生成待确认申购方案'})).toBeDisabled();
  expect(screen.getByText(/连同申购费超过常用卡余额/)).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:/返回产品列表/}));
  expect(screen.getByText(/仅作市场背景，不是下方产品的净值或预期收益/)).toBeInTheDocument();
  await user.click(screen.getByText('查看真实基金资料样本（仅学习比较）'));
  const realTable=screen.getByRole('table',{name:'真实基金资料的比较维度'});
  expect(within(realTable).getByText(/易方达货币A/)).toBeInTheDocument();
  expect(within(realTable).getByText(/易方达悦恒稳健债券A/)).toBeInTheDocument();
  expect(within(realTable).getByText(/华夏沪深300ETF/)).toBeInTheDocument();
  expect(within(realTable).getByText(/万份收益 0.2437/)).toBeInTheDocument();
  expect(within(realTable).getByText(/七日年化 1.002%/)).toBeInTheDocument();
  expect(within(realTable).getByText(/单位净值 0.9852/)).toBeInTheDocument();
  expect(within(realTable).getByText(/单位净值 4.5699/)).toBeInTheDocument();
  expect(within(screen.getByRole('group',{name:'候选产品'})).queryByRole('button',{name:/华夏沪深300ETF/})).not.toBeInTheDocument();
 });
 it('风险测评、取消方案、申购扣款、持仓复查、赎回入账',async()=>{
  const store=mockServer(),user=userEvent.setup();render(<WealthOperationMvp amount="30000" term="12"/>);
  expect(screen.queryByRole('button',{name:'生成待确认申购方案'})).not.toBeInTheDocument();
  await answer(user);
  expect(await screen.findByText(/当前风险等级：谨慎型/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/稳健固收组合/})).not.toBeInTheDocument();
  await user.click(within(screen.getByRole('group',{name:'候选产品'})).getByRole('button',{name:/灵活现金管理/}));
  await user.click(screen.getByRole('button',{name:'生成待确认申购方案'}));
  const dialog=await screen.findByRole('dialog',{name:'请核对并确认申购'});
  expect(within(dialog).getByText('常用卡 8888')).toBeInTheDocument();
  expect(store.get().cashBalance).toBe(4230000);
  await user.click(within(dialog).getByRole('button',{name:'返回修改'}));
  expect(store.get().holdings).toHaveLength(0);
  await user.click(screen.getByRole('button',{name:'生成待确认申购方案'}));
  await user.click(screen.getByRole('button',{name:'确认沙箱申购'}));
  expect(await screen.findByText(/沙箱申购已完成/)).toBeInTheDocument();
  expect(store.get().cashBalance).toBe(1230000);
  await user.click(screen.getByRole('button',{name:'赎回持仓'}));
  expect(await screen.findByRole('dialog',{name:'请核对并确认赎回'})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'确认沙箱赎回'}));
  expect(await screen.findByText(/沙箱赎回已完成/)).toBeInTheDocument();
  expect(store.get().cashBalance).toBe(4230000);
  expect(store.get().holdings?.[0].redeemedAt).toBeDefined();
 });
 it('重新测评可调整风险偏好，并在保存期间暂停产品比较',async()=>{
  const store=mockServer(),user=userEvent.setup();render(<WealthOperationMvp amount="30000" term="12"/>);
  await answer(user,'2');
  expect(await screen.findByText(/当前风险等级：成长型/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/均衡低波组合，本次申购费/})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'调整风险偏好'}));
  expect(screen.getByRole('button',{name:'经验较多'})).toHaveAttribute('aria-pressed','true');
  expect(screen.queryByRole('button',{name:/均衡低波组合/})).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'下一题'}));
  await user.click(screen.getByRole('button',{name:'不能接受本金亏损'}));
  for(let index=0;index<3;index++)await user.click(screen.getByRole('button',{name:'下一题'}));
  await user.click(screen.getByRole('button',{name:'保存新测评'}));
  expect(await screen.findByText(/当前风险等级：谨慎型/)).toBeInTheDocument();
  expect(store.get().assessment?.risk).toBe('low');
  expect(screen.queryByRole('button',{name:/均衡低波组合/})).not.toBeInTheDocument();
  expect(within(screen.getByRole('group',{name:'候选产品'})).getByRole('button',{name:/灵活现金管理/})).toBeInTheDocument();
 });
});
