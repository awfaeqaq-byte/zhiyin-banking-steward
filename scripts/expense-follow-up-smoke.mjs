// Fresh browser wallet / expense scope. Calendar requests isolated to avoid test tasks in user's calendar.
import puppeteer from '../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage();
const calendar={revision:0,tasks:[]};
await page.setRequestInterception(true);
page.on('request',async r=>{
  if(new URL(r.url()).pathname!=='/api/zhiyin/tasks')return r.continue();
  if(r.method()==='POST'){
    const op=JSON.parse(r.postData());
    if(op.type==='save')calendar.tasks.push({...op,status:'pending',createdAt:Date.now(),updatedAt:Date.now()});
    else calendar.tasks.find(t=>t.id===op.id).status=op.status;
    calendar.revision++;
  }
  await r.respond({status:200,contentType:'application/json',body:JSON.stringify(calendar)});
});
const click=async(f,text)=>{
  await f.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes(t)&&!b.disabled),{},text);
  await f.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(t)).click(),text);
};
try {
  await page.setViewport({width:375,height:812,isMobile:true,hasTouch:true});
  await page.goto('http://localhost:3000/',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>!!window.__OS__);
  const group=await page.evaluate(async()=>{
    const backend=await import('/apps/Wechat/group-aa/backend.ts');
    return backend.grantGroupAA('group-weekend');
  });
  await page.evaluate(()=>window.__OS__.openApp('zhiyin'));
  await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentDocument?.querySelector('.app-shell')));
  let f=page.frames().find(f=>f.url().includes('/zhiyin/index'));
  const fixture=await f.evaluate(async group=>{
    const scope=crypto.randomUUID(),bookId=crypto.randomUUID(),batchId=crypto.randomUUID();let revision=0;
    localStorage.setItem('zhiyin-expense-scope',scope);localStorage.setItem('zhiyin-expense-active',bookId);localStorage.setItem('zhiyin-mode','"native"');
    const save=async op=>{
      const r=await fetch('/api/zhiyin/expenses',{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Expenses':'1','X-Zhiyin-Expense-Scope':scope},body:JSON.stringify({...op,bookId,revision,requestId:crypto.randomUUID()})});
      const state=await r.json();if(!r.ok)throw new Error(state.error);revision=state.revision;return state;
    };
    const participants=['self','group-li','group-wang'];
    await save({type:'create',title:'今晚聚餐跟进测试',group,participants,defaultPayerId:'self'});
    await save({type:'add',entryId:'dinner',entry:{title:'晚饭',amount:9000,payerId:'self',fixed:[],shares:participants.map(memberId=>({memberId,weight:1}))}});
    const state=await save({type:'prepare',batchId,entryIds:['dinner']});
    await save({type:'published',batchId,collectionId:batchId});
    return {bookId,batchId,plan:state.books[0].batches[0].plan};
  },group);
  const initialBalance=await page.evaluate(async({fixture,group})=>{
    const backend=await import('/apps/Wechat/group-aa/backend.ts');
    const {useWechatStore}=await import('/apps/Wechat/state.ts');
    const balance=useWechatStore.getState().wallet.balanceCents;
    backend.publishGroupAA(fixture.batchId,group.id,group.revision,fixture.plan);
    backend.simulateGroupAAPayment(fixture.batchId,'group-li');return balance;
  },{fixture,group});
  await f.goto(f.url(),{waitUntil:'networkidle0'});
  await click(f,'今晚聚餐跟进测试');await click(f,'查看收款进度');
  await f.waitForFunction(()=>document.querySelector('.expense-batch')?.textContent.includes('¥30.00 / ¥60.00'));
  await click(f,'明天提醒我');
  await f.waitForFunction(()=>document.body.textContent.includes('明天上午9点'));
  assert.equal(calendar.tasks.length,1);
  await f.evaluate(()=>document.querySelector('.expense-batch').scrollIntoView({block:'center'}));
  await page.screenshot({path:'.impeccable/review/expense-follow-up-mobile.png'});
  await page.evaluate(async id=>{
    const backend=await import('/apps/Wechat/group-aa/backend.ts');backend.simulateGroupAAPayment(id,'group-wang');
  },fixture.batchId);
  await f.evaluate(()=>window.dispatchEvent(new Event('zhiyin-phone-foreground')));
  await f.waitForFunction(()=>document.querySelector('.expense-heading')?.textContent.includes('已结清归档'));
  assert.equal(calendar.tasks[0].status,'completed');
  const balance=await page.evaluate(async()=>{const {useWechatStore}=await import('/apps/Wechat/state.ts');return useWechatStore.getState().wallet.balanceCents;});
  assert.equal(balance-initialBalance,6000);
  await f.goto(f.url(),{waitUntil:'networkidle0'});
  await f.waitForFunction(()=>document.querySelector('.expense-heading')?.textContent.includes('已结清归档'));
  console.log('PASS: 微信实付两次 -> 到账6000分 -> 知银回传进度 -> 提醒结束 -> 刷新保留结清记录。');
}finally{await browser.close();}
