// Isolated task ledger: never writes the user's reminders or bank balances.
import {createServer as createViteServer} from 'vite';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from '../../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
const dir=await mkdtemp(join(tmpdir(),'zhiyin-task-smoke-'));
const screenshots=resolve('.impeccable/review');await mkdir(screenshots,{recursive:true});
const loader=await createViteServer({configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
const {createTaskStore,taskMiddleware}=await loader.ssrLoadModule('/server/task-store.ts');
const store=createTaskStore(join(dir,'tasks.json'));store.change({type:'save',id:'smoke',revision:0,title:'核对本月账单',dueAt:Date.now()+3600000,note:'测试数据：检查是否有重复付款。'});
const api=createServer(taskMiddleware(store));await new Promise(r=>api.listen(0,'127.0.0.1',r));const apiUrl=`http://127.0.0.1:${api.address().port}`;
const browser=await puppeteer.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
try{
 const page=await browser.newPage();await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.setRequestInterception(true);
 page.on('request',async req=>{if(!req.url().includes('/api/zhiyin/tasks'))return req.continue();try{const response=await fetch(apiUrl,{method:req.method(),headers:{'Content-Type':'application/json','X-Zhiyin-Tasks':'1'},...(req.method()==='POST'?{body:req.postData()}:{} )});await req.respond({status:response.status,contentType:'application/json',body:await response.text()});}catch{await req.respond({status:500,body:'{}'});}});
 await page.goto('http://localhost:3000/zhiyin/index.html',{waitUntil:'networkidle0'});await page.evaluate(()=>localStorage.setItem('zhiyin-mode',JSON.stringify('native')));await page.reload({waitUntil:'networkidle0'});
 await page.screenshot({path:join(screenshots,'calendar-home-mobile.png'),fullPage:true});
 await page.click('button[aria-label="任务日历"]');await page.waitForSelector('.task-event');
 await page.screenshot({path:join(screenshots,'calendar-mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.click('.task-toolbar button');await page.type('.task-editor input','确认订阅是否需要保留');await page.click('.task-editor button.task-primary');await page.waitForFunction(()=>document.querySelectorAll('.task-event').length===2);assert.equal(store.get().tasks.length,2);
 await page.reload({waitUntil:'networkidle0'});await page.click('button[aria-label="任务日历"]');await page.waitForFunction(()=>document.querySelectorAll('.task-event').length===2);
 await page.click('.task-event-summary');await page.evaluate(()=>Array.from(document.querySelectorAll('.task-actions button')).find(b=>b.textContent.includes('标记完成')).click());await page.waitForSelector('.task-event.completed');assert.equal(store.get().tasks.filter(t=>t.status==='completed').length,1);
 await page.setViewport({width:1280,height:900});await page.waitForSelector('button[aria-label="任务日历"]');await page.click('button[aria-label="任务日历"]');await page.waitForSelector('.task-event');await page.screenshot({path:join(screenshots,'calendar-desktop.png'),fullPage:true});
 console.log(JSON.stringify({result:'PASS',persisted:store.get().tasks.length,completed:store.get().tasks.filter(t=>t.status==='completed').length,screenshots}));
}finally{await browser.close();await new Promise(r=>api.close(r));await loader.close();await rm(dir,{recursive:true,force:true});}
