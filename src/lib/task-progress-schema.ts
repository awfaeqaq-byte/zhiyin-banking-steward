// Conversation progress is NOT an execution receipt, permission or account snapshot.
export type TaskProgress = {
  goal:string;
  stage:'collecting'|'waiting_user'|'waiting_authorization'|'ready'|'failed'|'paused';
  waitingFor?:{field:'provider'|'period'|'authorization'|'reply';question:string};
  bill?:{period?:string;provider?:'wechat_pay'|'alipay'|'all'};
};
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x:unknown,max:number):x is string=>typeof x==='string'&&!!x.trim()&&x.length<=max;
const keys=(x:Record<string,unknown>,allowed:string[])=>Object.keys(x).every(k=>allowed.includes(k));
export function validTaskProgress(x:unknown):x is TaskProgress {
  if(!record(x)||!keys(x,['goal','stage','waitingFor','bill'])||!text(x.goal,300)||!['collecting','waiting_user','waiting_authorization','ready','failed','paused'].includes(String(x.stage)))return false;
  if(x.waitingFor!==undefined&&(!record(x.waitingFor)||!keys(x.waitingFor,['field','question'])||!['provider','period','authorization','reply'].includes(String(x.waitingFor.field))||!text(x.waitingFor.question,300)))return false;
  if(x.bill!==undefined&&(!record(x.bill)||!keys(x.bill,['period','provider'])||(x.bill.period!==undefined&&!text(x.bill.period,80))||(x.bill.provider!==undefined&&!['wechat_pay','alipay','all'].includes(String(x.bill.provider)))))return false;
  return true;
}
