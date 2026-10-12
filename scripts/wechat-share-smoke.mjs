// Fresh browser + in-memory workspaces and isolated bank. Never changes user records or calls an online model.
import {createServer} from 'vite';
import puppeteer from '../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const temporary=mkdtempSync(join(tmpdir(),'wechat-share-smoke-'));
const loader=await createServer({configFile:false,server:{middlewareMode:true,watch:{ignored:['**']}},appType:'custom'});
const {emptyWorkspaces,changeWorkspaces}=await loader.ssrLoadModule('/src/lib/workspaces.ts');
const {createBankStore}=await loader.ssrLoadModule('/server/bank-store.ts');
const bank=createBankStore(join(temporary,'bank.json'));let tasks=emptyWorkspaces();let modelCalls=0;
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage();page.setDefaultTimeout(15000);await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setRequestInterception(true);
page.on('request',async request=>{
 try{
  const path=new URL(request.url()).pathname;
  if(path==='/api/zhiyin/workspaces'){
   if(request.method()==='POST')tasks=changeWorkspaces(tasks,JSON.parse(request.postData()));
   await request.respond({status:200,contentType:'application/json',body:JSON.stringify(tasks)});return;
  }
  if(path==='/api/zhiyin/bank'){
   assert.equal(request.method(),'GET','分享不能发起银行写操作');
   await request.respond({status:200,contentType:'application/json',body:JSON.stringify(bank.get())});return;
  }
  if(path==='/api/zhiyin/steward-reply'){
   modelCalls++;const body=JSON.parse(request.postData());const text=body.input.at(-1).content;
   const output=body.instructions.includes('任务分流器')?{parts:[{taskId:tasks.items[0]?.id??null,kind:'general',title:'微信消息解读',text}]}:{text:'这是朋友提到的生日安排。你希望我先帮你准备什么？目前没有付款或下单。'};
   await request.respond({status:200,contentType:'application/json',body:JSON.stringify({output_text:JSON.stringify(output)})});return;
  }
  if(path.startsWith('/api/')&&request.method()!=='GET')throw new Error(`禁止触及用户状态：${path}`);
  await request.continue();
 }catch(e){errors.push(e.message);if(!request.isInterceptResolutionHandled())await request.abort();}
});
async function click(target,text){
 await target.waitForFunction(t=>Array.from(document.querySelectorAll('button')).some(b=>!b.disabled&&(b.textContent.trim()===t||b.getAttribute('aria-label')===t)),{},text);
 await target.evaluate(t=>{const button=Array.from(document.querySelectorAll('button')).find(b=>!b.disabled&&(b.textContent.trim()===t||b.getAttribute('aria-label')===t));button.scrollIntoView({block:'center'});button.click();},text);
}
async function frame(){await page.waitForSelector('iframe[title="知银"]');return (await page.$('iframe[title="知银"]')).contentFrame();}
async function longPress(selector){
 const element=await page.waitForSelector(selector);const bounds=await element.boundingBox();
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
 await page.waitForFunction(()=>document.body.textContent.includes('已选 1 条'));await page.mouse.up();
}
const review='.impeccable/review/wechat-share';mkdirSync(review,{recursive:true});
try{
 await page.goto(process.env.PHONE_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle0'});
 await page.evaluate(()=>window.__OS__.openApp('wechat'));
 await page.waitForFunction(()=>document.querySelector('[data-trigger="chat.open"]')||document.body.textContent.includes('通讯录'));
 await page.evaluate(async()=>{
  const {getStore}=await import('/os/createAppStore.ts');const useWechatStore=getStore('wechat');const s=useWechatStore.getState();
  const user={wxid:'wx_share_friend',name:'消息分享测试',avatar:s.user.avatar};
  const timestamp=1791770000000;
  useWechatStore.setState({chats:[...s.chats.filter(c=>c.id!==user.wxid),{id:user.wxid,user,messages:[
   {id:'share-birthday',type:'text',content:'下周六生日，晚上一起吃饭。',senderId:user.wxid,timestamp},
   {id:'share-budget',type:'text',content:'想要一个低甜蛋糕。',senderId:user.wxid,timestamp:timestamp+1000},
   {id:'share-private',type:'text',content:'这条没有选择，不应该进入知银。',senderId:user.wxid,timestamp:timestamp+2000},
  ]}]});window.__OS__.openApp('wechat','/chat/wx_share_friend');
 });
 await longPress('[data-message-id="share-birthday"] [role="button"]');
 await page.click('[data-message-id="share-budget"] [role="button"]');
 await page.waitForFunction(()=>document.body.textContent.includes('已选 2 条'));
 await click(page,'分享给知银');await page.waitForSelector('[role="dialog"]');
 assert(!await page.$eval('[role="dialog"]',e=>e.textContent.includes('这条没有选择')));
 await page.type('[role="dialog"] textarea','先解释一下这两条消息');
 await page.screenshot({path:`${review}/wechat-preview.png`});
 // The system back key closes only the preview; selection remains.
 await page.evaluate(()=>window.__OS__.handleBack());await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
 await page.waitForFunction(()=>document.body.textContent.includes('已选 2 条'));await click(page,'分享给知银');
 await page.type('[role="dialog"] textarea','先解释一下这两条消息');await click(page,'分享并打开知银');
 const child=await frame();await child.waitForSelector('.wechat-share-attachment');
 assert.equal(modelCalls,0);assert.equal(tasks.items.length,0);
 assert(!await child.$eval('.wechat-share-attachment',e=>e.textContent.includes('这条没有选择')));
 await page.screenshot({path:`${review}/zhiyin-import.png`});
 await page.evaluate(()=>window.__OS__.openApp('wechat'));
 await page.waitForSelector('[data-message-id="share-birthday"]');
 await page.evaluate(()=>window.__OS__.openApp('zhiyin'));await child.waitForSelector('.wechat-share-attachment');
 assert.equal(await child.$$eval('.wechat-share-attachment',e=>e.length),1);assert.equal(modelCalls,0);
 await click(child,'交给宁宁整理');await child.waitForFunction(()=>document.body.textContent.includes('这是朋友提到的生日安排'));
 assert.equal(tasks.items.length,1);assert.equal(tasks.items[0].messages.length,2);assert.equal(bank.get().balance,4230000);
 await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>window.__OS__.openApp('zhiyin'));
 const restored=await frame();await restored.waitForFunction(()=>document.body.textContent.includes('先解释一下这两条消息'));
 assert.equal(await restored.$$eval('.wechat-share-attachment',e=>e.length),0);assert.equal(modelCalls,2);
 // A group share can continue the same existing task and never imports other messages.
 const groupId=await page.evaluate(async()=>{
  const {getStore}=await import('/os/createAppStore.ts');const useWechatStore=getStore('wechat');const {normalizeGroupAA}=await import('/apps/Wechat/group-aa/backend.ts');
  const groupAA=normalizeGroupAA(useWechatStore.getState().groupAA);const group=groupAA.groups[0];
  groupAA.messages={...groupAA.messages,[group.id]:[{id:'group-share',memberId:group.members.find(m=>!m.self).id,text:'生日地址改为默认地址，请先核对。',createdAt:1791770003000}]};
  useWechatStore.setState({groupAA});window.__OS__.openApp('wechat',`/group-aa/${group.id}`);return group.id;
 });
 await page.waitForSelector('.wx-group-bubble[role="button"]');await longPress('.wx-group-bubble[role="button"]');await click(page,'分享给知银');await click(page,'分享并打开知银');
 await restored.waitForSelector('.wechat-share-attachment');assert.equal(modelCalls,2);
 await click(restored,'交给宁宁整理');await restored.waitForFunction(()=>!document.querySelector('.wechat-share-attachment'));
 await page.waitForFunction(()=>document.querySelector('iframe[title="知银"]')?.contentDocument?.body.textContent.includes('这是朋友提到的生日安排'));
 assert.equal(tasks.items.length,1);assert(tasks.items[0].messages.some(m=>m.content.includes('生日地址改为默认地址')));
 assert(groupId);assert.equal(bank.get().balance,4230000);
 await page.setViewport({width:1280,height:900});await page.screenshot({path:`${review}/desktop.png`});
 assert(!await restored.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS: single/group selection, preview, system back, no unselected messages, no automatic processing, reload dedupe, continuation and unchanged funds.');
}catch(error){await page.screenshot({path:`${review}/failure.png`});console.log('UI:',await page.evaluate(()=>document.body.innerText.slice(-1800)));console.log('Errors:',errors);throw error;
}finally{await browser.close();await loader.close();rmSync(temporary,{recursive:true,force:true});}
