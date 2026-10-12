import {useState} from 'react';
import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {CardApplicationPanel} from './card-application';
let directory='';afterEach(()=>{vi.restoreAllMocks();if(directory)rmSync(directory,{recursive:true,force:true});directory='';});
describe('卡申请页面与服务端回执',()=>{
 it('比较卡种后取消无申请，确认后持久化状态',async()=>{
  directory=mkdtempSync(join(tmpdir(),'card-ui-'));const bank=createBankStore(join(directory,'bank.json'));
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{const body=JSON.parse(String(options?.body));try{return new Response(JSON.stringify(bank.applyCard(body)));}catch(error){return new Response(JSON.stringify({error:(error as Error).message}),{status:400});}});
  function View(){const [snapshot,setSnapshot]=useState(bank.get());return <CardApplicationPanel bank={snapshot} onRefresh={async()=>setSnapshot(bank.get())}/>;}
  const user=userEvent.setup();render(<View/>);
  await user.click(screen.getByRole('button',{name:/标准借记卡/}));
  const dialog=screen.getByRole('dialog',{name:'确认提交沙箱卡申请'});
  expect(within(dialog).getByText(/不采集身份证号/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button',{name:'取消'}));
  expect(bank.get().cardApplications).toHaveLength(0);
  await user.click(screen.getByRole('button',{name:/安心借记卡/}));
  await user.click(screen.getByRole('button',{name:'确认提交申请'}));
  expect(await screen.findByText(/沙箱申请已提交/)).toBeInTheDocument();
  expect(bank.get().cardApplications).toEqual([expect.objectContaining({productId:'safety-debit',status:'submitted'})]);
 });
});
