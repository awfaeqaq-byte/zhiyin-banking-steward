// Isolated browser and task scope; model responses stubbed for repeatable UI assertions.
import puppeteer from '../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage();
const click=async(label)=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>(b.getAttribute('aria-label')===t||b.textContent.trim()===t)&&!b.disabled),{},label);await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')===t||b.textContent.trim()===t)&&!b.disabled).click(),label);};
await page.setRequestInterception(true);
page.on('request',r=>{
  if(new URL(r.url()).pathname!=='/api/zhiyin/steward-reply')return r.continue();
  const request=JSON.parse(r.postData());
  const output=request.instructions.includes('任务分流器')?JSON.stringify({parts:[{taskId:null,kind:'general',title:'今晚聚餐',text:'饮料18'},{taskId:null,kind:'general',title:'周末旅行',text:'周末去杭州'}]}):'好的，这件事留在当前任务里，稍后可以接着交代。';
  return r.respond({status:200,contentType:'application/json',body:JSON.stringify({output_text:output})});
});
try{
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto('http://localhost:3000/zhiyin/index.html',{waitUntil:'networkidle0'});
  await page.evaluate(()=>{localStorage.setItem('zhiyin-mode','"native"');localStorage.setItem('zhiyin-expense-scope',crypto.randomUUID());});
  await page.reload({waitUntil:'networkidle0'});
  await page.type('input[aria-label="和宁宁说点什么"]','饮料18，周末去杭州');await click('发送给宁宁');
  await click('继续：周末旅行');
  await page.waitForFunction(()=>document.body.textContent.includes('好的，这件事留在当前任务里'));
  await click('任务窗口');
  await click('打开今晚聚餐');
  await page.waitForFunction(()=>document.body.textContent.includes('好的，这件事留在当前任务里'));
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.querySelector('.workspace-bar')?.textContent.includes('今晚聚餐'));
  assert.ok(await page.evaluate(()=>document.body.textContent.includes('好的，这件事留在当前任务里')));
  await click('任务窗口');
  mkdirSync('.impeccable/review',{recursive:true});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.screenshot({path:'.impeccable/review/workspace-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.setViewport({width:1280,height:900});
  await page.waitForSelector('.workspace-bar');
  if(!await page.$('.workspace-list'))await click('任务窗口');
  await page.screenshot({path:'.impeccable/review/workspace-desktop.png',fullPage:true});
  await click('返回对话');
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.waitForSelector('.workspace-bar');
  await page.screenshot({path:'.impeccable/review/workspace-conversation.png',fullPage:true});
  console.log('PASS: split request -> independent windows -> switch -> reload restores -> mobile and desktop captures. Model mocked; workspace API real.');
}finally{await browser.close();}
