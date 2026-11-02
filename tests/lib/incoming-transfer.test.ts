import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankStore} from '../../server/bank-store';
import {incomingFromLedger,validIncomingTransfer} from '../../src/lib/incoming-transfer';
const dirs:string[]=[];
afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})));
function setup(){const dir=mkdtempSync(join(tmpdir(),'mom-receipt-'));dirs.push(dir);const file=join(dir,'bank.json'),store=createBankStore(file);const now=Date.parse('2026-10-30T17:00:00+08:00'),at=Date.parse('2026-10-31T08:00:00+08:00');const draft=store.prepare({recipientId:'mom',amount:50000,sourceAccountId:'demo-8888',remark:'生活费',executeAt:at},now);store.schedule(draft.id,now+1);return {store,file,at,id:draft.id};}
it('未执行的原预约不能变成妈妈的到账提醒',()=>{const x=setup();expect(incomingFromLedger(x.store.get(),0,x.id,'mom','孩子',x.at)).toBeNull();});
it('只执行原预约一次，转出500与妈妈收款500和回执相互一致',()=>{const x=setup(),before=x.store.get().balance;x.store.runDue(x.at);const raw=JSON.parse(readFileSync(x.file,'utf8'));const incoming=incomingFromLedger(x.store.get(),raw.received.mom,x.id,'mom','孩子',x.at);expect(incoming).toMatchObject({id:x.id,status:'received',amount:50000,senderName:'孩子',recipientLast4:'6621',senderLast4:'8888',completedAt:x.at});expect(x.store.get().balance).toBe(before-50000);expect(raw.received.mom).toBe(50000);x.store.runDue(x.at+1);expect(x.store.get().transactions).toHaveLength(1);});
it('收款累计、对象、时间、回执或来源账户不一致时不出到账卡',()=>{const x=setup();x.store.runDue(x.at);const s=x.store.get();expect(incomingFromLedger(s,49999,x.id,'mom','孩子',x.at)).toBeNull();expect(incomingFromLedger(s,50000,x.id,'dad','孩子',x.at)).toBeNull();expect(incomingFromLedger(s,50000,'missing','mom','孩子',x.at)).toBeNull();expect(incomingFromLedger(s,50000,x.id,'mom','孩子',x.at-1)).toBeNull();expect(incomingFromLedger({...s,transactions:[{...s.transactions[0],sourceAccountId:undefined}]},50000,x.id,'mom','孩子',x.at)).toBeNull();});
it('不接受损坏账本、尚未完成的预约和不合法的展示数据',()=>{const x=setup();x.store.runDue(x.at);const s=x.store.get();expect(incomingFromLedger({},50000,x.id,'mom','孩子',x.at)).toBeNull();expect(incomingFromLedger(s,NaN,x.id,'mom','孩子',x.at)).toBeNull();expect(incomingFromLedger({...s,schedules:s.schedules?.map(t=>({...t,status:'pending'}))},50000,x.id,'mom','孩子',x.at)).toBeNull();expect(incomingFromLedger(s,50000,x.id,'mom','',x.at)).toBeNull();expect(validIncomingTransfer(undefined)).toBe(false);});
