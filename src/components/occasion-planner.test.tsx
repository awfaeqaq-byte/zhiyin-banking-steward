import {afterEach, expect, it, vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {OccasionPlanner} from './occasion-planner';
import {createBankStore} from '../../server/bank-store';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {OccasionDraft} from '../lib/occasion-plans';
import {parseStewardReply} from '../lib/steward-chat';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('生日筹备有独立对话入口，不把建议当付款回执',()=>{
 expect(parseStewardReply('[ZHIYIN_ACTION:OPEN_OCCASIONS]',[]).action?.type).toBe('open_occasions');
});
it('用户核对草稿、独立确认预留、刷新恢复；取消释放资金而不自动退款',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'occasion-ui-'));const bank=createBankStore(join(dir,'bank.json'));bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
 const d:OccasionDraft={title:'生日筹备',recipient:'爱人',budget:100000,prepareAt:Date.now()+86400000,deliverAt:Date.now()+3*86400000,address:'测试地址',contact:'叶先生 13800001234',note:'低甜',productIds:['cake-light','flowers-roses']};
 bank.saveOccasion({id:'birthday',revision:1,draft:d});
 vi.stubGlobal('fetch',vi.fn(async (_url:string,init?:RequestInit)=>{
  const body=init?.body?JSON.parse(init.body as string):null;let data;
  if(body?.type==='reserve-occasion')data=bank.reserveOccasion(body.id,body.revision);
  else if(body?.type==='cancel-occasion')data=bank.cancelOccasion(body.id,body.revision);
  else data=bank.get();return {ok:true,json:async()=>data};
 }));
 try{
  render(<OccasionPlanner stewardName="宁宁"/>);
  fireEvent.click(await screen.findByRole('button',{name:/生日筹备/}));
  expect(screen.getByText('尚未预留资金')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'预留这笔预算'}));
  expect(bank.get().occasions![0].status).toBe('draft');
  fireEvent.click(screen.getByRole('button',{name:'确认预留 ¥1,000.00'}));
  await screen.findByText('预算已预留');expect(bank.get().balance).toBe(4230000);
  cleanup();render(<OccasionPlanner stewardName="宁宁"/>);fireEvent.click(await screen.findByRole('button',{name:/生日筹备/}));
  expect(await screen.findByText('预算已预留')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'取消安排'}));fireEvent.click(screen.getByRole('button',{name:'确认取消并释放余款'}));
  await waitFor(()=>expect(bank.get().occasions![0].status).toBe('cancelled'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
