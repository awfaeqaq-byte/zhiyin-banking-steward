// Isolated bank file + fresh browser. No edits to the user's bank/wallet records.
// Model responses are stubbed; real middleware, phone bridge, merchant and platform ledger code run.
import {createServer as createViteServer} from 'vite';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from '../../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const tmp=mkdtempSync(join(tmpdir(),'zhiyin-occasion-e2e-'));
const loader=await createViteServer({configFile:false,server:{middlewareMode:true,watch:{ignored:['**']}},appType:'custom'});
const {createBankStore,bankMiddleware}=await loader.ssrLoadModule('/server/bank-store.ts');
const bank=createBankStore(join(tmp,'bank.json'));
bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
const api=createServer(bankMiddleware(bank));await new Promise(r=>api.listen(0,'127.0.0.1',r));
const apiUrl=`http://127.0.0.1:${api.address().port}`;
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.PHONE_URL||'http://localhost:3000';
const review='.impeccable/review';mkdirSync(review,{recursive:true});
const now=Date.now(),delivery=now+5*86400000;
const draft={title:'爱人生日',recipient:'爱人',budget:100000,prepareAt:now-1000,deliverAt:delivery,address:'江湾金融中心 A 座 · 沙箱地址',contact:'叶先生 13800001234',note:'低甜蛋糕，祝生日快乐',productIds:['cake-light','flowers-roses']};
async function intercept(target){
 await target.setRequestInterception(true);
 target.on('request',async r=>{
  try{
   const path=new URL(r.url()).pathname;
   if(path==='/api/zhiyin/bank'){
    const response=await fetch(apiUrl,{method:r.method(),headers:{'Content-Type':'application/json','X-Zhiyin-Bank':'1'},...(r.postData()?{body:r.postData()}: {})});
    await r.respond({status:response.status,contentType:'application/json',body:await response.text()});return;
   }
   if(path==='/api/zhiyin/steward-reply'){
    await r.respond({status:200,contentType:'application/json',body:JSON.stringify({output_text:JSON.stringify({text:'我选了低甜鲜果蛋糕和粉玫瑰，包含配送费。地址和送达时间请再核对一下。',patch:draft,questions:[]})})});return;
   }
   await r.continue();
  }catch(e){errors.push(e.message);if(!r.isInterceptResolutionHandled())await r.abort();}
 });
}
async function click(target,label){
 await target.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>(b.getAttribute('aria-label')===t||b.textContent.trim()===t)&&!b.disabled),{},label);
 await target.evaluate(t=>{const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')===t||b.textContent.trim()===t)&&!b.disabled);b.scrollIntoView({block:'center'});b.click();},label);
}
async function matchingClick(target,text){
 await target.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes(t)&&!b.disabled),{},text);
 await target.evaluate(t=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(t)&&!b.disabled);b.scrollIntoView({block:'center'});b.click();},text);
}
try{
 await intercept(page);await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.goto(base,{waitUntil:'networkidle0'});
 await page.evaluate(()=>{localStorage.setItem('zhiyin-mode','"native"');window.__OS__.openApp('zhiyin');});
 await page.waitForFunction(()=>!!document.querySelector('iframe[title="知银"]'));
 const frame=await (await page.$('iframe[title="知银"]')).contentFrame();
 await click(frame,'我的');await matchingClick(frame,'生活筹备');await click(frame,'准备一个生日');
 await frame.type('#occasion-prompt','给爱人准备生日，预算1000，蛋糕不要太甜，加一束花。');await click(frame,'整理筹备需求');
 await frame.waitForFunction(()=>document.querySelector('input[value="爱人"]'));
 await click(frame,'保存筹备方案');await frame.waitForFunction(()=>document.body.textContent.includes('尚未预留资金'));
 const plan=bank.get().occasions[0];assert.equal(plan.status,'draft');assert.equal(bank.get().balance,4230000);
 await click(frame,'预留这笔预算');assert.equal(bank.get().occasions[0].status,'draft');
 await matchingClick(frame,'确认预留 ¥1,000');await frame.waitForFunction(()=>document.body.textContent.includes('预算已预留'));
 assert.equal(bank.get().occasions[0].status,'reserved');assert.equal(bank.get().balance,4230000);
 await frame.evaluate(()=>document.querySelector('.occasion-budget').scrollIntoView({block:'center'}));
 await page.screenshot({path:`${review}/occasion-mobile-budget.png`});
 await frame.evaluate(()=>{document.querySelector('.main-content').scrollTop=0;window.scrollTo(0,0);});
 await page.screenshot({path:`${review}/occasion-mobile.png`});
 await matchingClick(frame,'准备订单并去外卖');
 await page.waitForFunction(()=>document.body.textContent.includes('收银台')&&document.body.textContent.includes('筹备订单'));
 await page.screenshot({path:`${review}/occasion-food-payment.png`});
 await matchingClick(page,'微信支付 · 常用卡');
 await page.waitForFunction(()=>document.body.textContent.includes('订单追踪'));
 assert.equal(bank.get().balance,4230000-20600);assert.equal(bank.get().payments[0].occasionId,plan.id);
 await page.evaluate(()=>window.__OS__.openApp('zhiyin'));
 await click(frame,'核对订单状态');await frame.waitForFunction(()=>document.body.textContent.includes('商家已接单'));
 const merchant=await page.evaluate(async()=>{const m=await import('/apps/FoodDelivery/state.ts');const w=await import('/apps/Wechat/state.ts');return {order:m.useFoodDeliveryStore.getState().orders.find(o=>o.occasionId),records:w.useWechatStore.getState().payLedger.transactions.filter(t=>t.linkedId?.startsWith('occasion:'))};});
 assert.equal(merchant.order.id,plan.orders[0]?.orderId||`ZY-${plan.id}-cake-light`);assert.equal(merchant.records.length,1);assert.equal(merchant.records[0].amountCents,20600);
 await matchingClick(frame,'查看外卖订单');await page.waitForFunction(()=>document.body.textContent.includes('订单追踪'));
 await click(page,'申请退款');await page.waitForFunction(()=>document.body.textContent.includes('退款已完成'));
 await page.waitForFunction(()=>document.body.textContent.includes('已原路退回至常用卡'));
 await page.screenshot({path:`${review}/occasion-food-refund.png`});
 assert.equal(bank.get().balance,4230000);assert.ok(bank.get().payments[0].refundedAt);
 await page.evaluate(()=>window.__OS__.openApp('zhiyin'));await click(frame,'核对订单状态');
 await click(frame,'取消安排');await click(frame,'确认取消并释放余款');
 assert.equal(bank.get().occasions[0].status,'cancelled');
 const desktop=await browser.newPage();await intercept(desktop);await desktop.setViewport({width:1280,height:900});
 await desktop.goto(`${base}/zhiyin/index.html`,{waitUntil:'networkidle0'});await click(desktop,'我的');await matchingClick(desktop,'生活筹备');await matchingClick(desktop,'爱人生日');
 await desktop.screenshot({path:`${review}/occasion-desktop.png`});
 assert.ok(await desktop.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 console.log('PASS: model draft -> explicit reserve -> real phone bridge -> WeChat/card payment -> platform ledger -> refund -> cancellation. Isolated bank; model stubbed. Screenshots captured at 390×844 and 1280×900.');
}catch(error){console.error('Isolated-flow diagnostic:',await page.evaluate(()=>document.body.innerText.slice(-1800)),errors);throw error;}
finally{await browser.close();await loader.close();await new Promise(r=>api.close(r));rmSync(tmp,{recursive:true,force:true});}
