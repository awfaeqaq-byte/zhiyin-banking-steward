// Browser smoke test against a temporary bank ledger. Never modifies user balances.
import {createServer as createViteServer} from 'vite';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from '../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const dir=await mkdtemp(join(tmpdir(),'zhiyin-transfer-smoke-'));
const loader=await createViteServer({configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
const {createBankStore,bankMiddleware}=await loader.ssrLoadModule('/server/bank-store.ts');
const bank=createBankStore(join(dir,'bank.json'));
bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
const api=createServer(bankMiddleware(bank));
await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
const apiUrl=`http://127.0.0.1:${api.address().port}`;
const browser=await puppeteer.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
try{
 const page=await browser.newPage();
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.setRequestInterception(true);
 page.on('request',async request=>{
  if(!request.url().includes('/api/zhiyin/bank'))return request.continue();
  try{const result=await fetch(apiUrl,{method:request.method(),headers:{'Content-Type':'application/json','X-Zhiyin-Bank':'1'},...(request.method()==='POST'?{body:request.postData()}:{} )});await request.respond({status:result.status,contentType:'application/json',body:await result.text()});}
  catch{await request.respond({status:500,contentType:'application/json',body:'{"error":"smoke backend unavailable"}'});}
 });
 const click=async label=>{
  await page.waitForFunction(label=>Array.from(document.querySelectorAll('button')).some(b=>b.innerText.trim()===label&&b.getBoundingClientRect().height>0&&!b.disabled),{},label);
  await page.evaluate(label=>Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()===label&&b.getBoundingClientRect().height>0&&!b.disabled).click(),label);
 };
 await page.goto('http://localhost:3000/zhiyin/index.html',{waitUntil:'networkidle0'});
 await click('资产');await click('管理');await click('智能转账与AA收款');
 await page.locator('input[placeholder="姓名、手机号或备注"]').fill('母亲');
 await page.evaluate(()=>{const el=Array.from(document.querySelectorAll('label')).find(l=>l.textContent.startsWith('转账金额（元）')).querySelector('input');el.focus();});
 await page.keyboard.press('Backspace');await page.keyboard.type('100');
 await page.evaluate(()=>Array.from(document.querySelectorAll('label')).find(l=>l.textContent.startsWith('转账后至少保留（元）')).querySelector('input').focus());
 await page.keyboard.type('12000');
 await click('核对即时转账');assert.equal(bank.get().transactions.length,0);
 await page.waitForFunction(()=>document.body.innerText.includes('安排后仍可支配 ¥30,200'));
 await page.screenshot({path:join(dir,'budget-review-mobile.png'),fullPage:true});
 await click('确认并立即转账（沙箱）');await page.waitForFunction(()=>document.body.innerText.includes('转账已完成'));
 assert.equal(bank.get().balance,4220000);assert.equal(bank.get().transactions.length,1);
 assert.equal(bank.get().transactions[0].protectedAmount,1200000);
 await click('AA收款');
 const fields=await page.$$('.bank-transfer-flow input');
 for(const field of fields){const visible=await field.evaluate(el=>el.getBoundingClientRect().height>0);const inputMode=await field.evaluate(el=>el.inputMode);if(visible&&inputMode==='decimal'){await field.type('100');}}
 await page.evaluate(()=>{for(const name of ['妈妈','爸爸']){const label=Array.from(document.querySelectorAll('.smart-person')).find(l=>l.textContent.includes(name));label.querySelector('input').click();}});
 await click('核对AA分摊');await click('确认发起AA收款');await page.waitForFunction(()=>document.body.innerText.includes('0/2 人已付'));
 assert.equal(bank.get().balance,4220000);
 await page.evaluate(()=>document.querySelector('.smart-simulation').open=true);
 await click('妈妈付款');await click('确认操作');await page.waitForFunction(()=>document.body.innerText.includes('1/2 人已付'));
 assert.equal(bank.get().balance,4223333);assert.equal(bank.get().collections.length,1);
 await page.screenshot({path:join(dir,'aa-mobile.png'),fullPage:true});
 const time=Date.now(),draft=bank.prepare({recipientId:'mom',amount:2000000,protectedAmount:2000000,executeAt:time+60000},time);
 bank.schedule(draft.id,time+1,draft.review?.token);
 bank.pay({id:'smoke:unexpected',channel:'wechat',amount:300000,merchant:'测试消费'},time+2);
 bank.runDue(time+60000);
 assert.equal(bank.get().schedules[0].status,'failed');
 await page.evaluate(()=>localStorage.setItem('zhiyin-mode',JSON.stringify('native')));
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.innerText.includes('有一笔预约需要你处理'));
 await page.screenshot({path:join(dir,'transfer-followup-mobile.png'),fullPage:true});
 await click('查看安排');await click('重新安排');
 assert.equal(await page.evaluate(()=>Array.from(document.querySelectorAll('label')).find(l=>l.textContent.startsWith('转账后至少保留（元）')).querySelector('input').value),'20000');
 assert.equal(bank.get().transactions.length,1);
 console.log(JSON.stringify({result:'PASS',width:390,transfer:bank.get().transactions.length,aaCollections:bank.get().collections.length,screenshot:join(dir,'aa-mobile.png')}));
}finally{await browser.close();await new Promise(resolve=>api.close(resolve));await loader.close();await rm(join(dir,'bank.json'),{force:true});}
