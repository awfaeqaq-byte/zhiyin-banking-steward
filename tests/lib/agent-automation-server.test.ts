import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBillSourceService} from '../../server/bill-source';
import {createAgentAutomationService} from '../../server/agent-automation';
import type {ConnectedFinancialSource} from '../../src/lib/financial-connections';
import type {AutomationContext} from '../../src/lib/agent-automations';

const directories:string[]=[];
afterEach(()=>{for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});});

it('后台月报每次执行重新拉取上月账单，撤销授权后记录失败而不复用旧摘要',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'monthly-background-'));directories.push(dir);
 let amount=-100,complete=true,clock=Date.parse('2026-10-09T09:00:00+08:00');
 const source=():ConnectedFinancialSource=>({provider:'wechat_pay',displayName:'微信支付',accountMasked:'演示',scopes:['transactions'],syncedAt:new Date(clock).toISOString(),autopays:[],transactions:[{id:'one',title:'餐饮',amount,category:'餐饮',kind:'payment',occurredAt:'2026-09-20'}],transactionCoverage:{total:complete?1:2,returned:1,invalid:complete?0:1,complete}});
 const bills=createBillSourceService({grantFile:join(dir,'grants.json'),fetchSource:()=>source()});
 bills.grant('wechat_pay',true);
 // This test checks refreshed reports and grants, not database persistence.
 // An in-memory workflow store avoids open SQLite handles during Windows cleanup.
 const service=createAgentAutomationService({stateFile:join(dir,'state.json'),databaseUrl:'file::memory:',now:()=>clock,refreshBills:bills.refresh});
 const oldContext:AutomationContext={capturedAt:clock-86400000,bill:{sourceCount:1,recordCount:99,expense:999999,coverage:'旧浏览器摘要',findings:[]},wealth:{market:null}};
 let snapshot=await service.runNow('monthly_bill_review',oldContext);
 expect(snapshot.runs[0]).toMatchObject({status:'completed',reportMonth:'2026-09',sourceRefreshedAt:clock});
 expect(snapshot.runs[0].report).toMatchObject({month:'2026-09',recordCount:1,expense:100,transferOut:0,incomplete:false});
 expect(snapshot.runs[0].summary).toContain('¥1.00');
 expect(snapshot.runs[0].summary).not.toContain('旧浏览器摘要');
 amount=-300;clock+=1000;
 snapshot=await service.runNow('monthly_bill_review',oldContext);
 expect(snapshot.runs[0].summary).toContain('¥3.00');
 complete=false;clock+=1000;
 snapshot=await service.runNow('monthly_bill_review',oldContext);
 expect(snapshot.runs[0].status).toBe('completed');
 expect(snapshot.runs[0].summary).toContain('已返回记录的小计');
 expect(snapshot.runs[0].report?.incomplete).toBe(true);
 bills.grant('wechat_pay',false);clock+=1000;
 snapshot=await service.runNow('monthly_bill_review',oldContext);
 expect(snapshot.runs[0].status).toBe('failed');
 expect(snapshot.runs[0].summary).toContain('没有后台账单读取授权');
 expect(snapshot.runs[0].summary).not.toContain('¥3.00');
});
