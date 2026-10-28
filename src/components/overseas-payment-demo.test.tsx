import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {OverseasPaymentDemo} from './overseas-payment-demo';

let dir='';
afterEach(()=>{vi.restoreAllMocks();if(dir)rmSync(dir,{recursive:true,force:true});dir='';});

it('境外付款界面关闭时给出拒绝原因，开启后产生可复查回执',async()=>{
 dir=mkdtempSync(join(tmpdir(),'overseas-ui-'));
 const bank=createBankStore(join(dir,'bank.json'));
 bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  const body=JSON.parse(String(options?.body));
  try{return new Response(JSON.stringify(bank.pay(body.payment,100)),{status:200});}
  catch(error){return new Response(JSON.stringify({error:(error as Error).message}),{status:400});}
 });
 const refresh=vi.fn(async()=>bank.get());
 const user=userEvent.setup();
 const view=render(<OverseasPaymentDemo bank={bank.get()} onRefresh={refresh}/>);
 await user.click(screen.getByRole('button',{name:'测试境外付款'}));
 await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'确认测试付款'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('境外交易已关闭');
 expect(bank.get().balance).toBe(4230000);
 bank.configure({revision:1,controls:{night:false,overseas:true,contactless:true}});
 view.rerender(<OverseasPaymentDemo bank={bank.get()} onRefresh={refresh}/>);
 await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'确认测试付款'}));
 expect(await screen.findByRole('status')).toHaveTextContent('境外沙箱付款成功');
 expect(bank.get().balance).toBe(4229900);
 expect(bank.get().payments?.[0].channel).toBe('overseas');
 expect(refresh).toHaveBeenCalled();
});
