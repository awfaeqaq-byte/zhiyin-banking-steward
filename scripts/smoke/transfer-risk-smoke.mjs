// Isolated real bank API + product component. Never reads/writes user business data.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from '../../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
const directory=await mkdtemp(join(tmpdir(),'zhiyin-risk-smoke-'));
const screenshots=resolve('.impeccable/review/transfer-risk');await mkdir(screenshots,{recursive:true});
const loader=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
let browser,web;
try{
 const {createBankStore,bankMiddleware}=await loader.ssrLoadModule('/server/bank-store.ts');
 const bank=createBankStore(join(directory,'bank.json'));
 bank.configure({revision:0,controls:{night:false,overseas:false,contactless:true}});
 const first=bank.prepare({workspaceId:'dinner',recipientId:'mom',amount:500000});bank.confirm(first.id,Date.now(),first.review.token);
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>转账核对隔离测试</title><body style="margin:0;background:#edf8fa"><div id="risk-root" style="max-width:520px;margin:auto;padding:16px;background:white"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {BankTransfer} from '/src/components/bank-transfer.tsx';import '/src/index.css';import '/src/components/account-pages.css';createRoot(document.getElementById('risk-root')).render(React.createElement(BankTransfer,{initial:{workspaceId:'dinner',recipientId:'mom',amount:500000},onDone:()=>{}}));</script></body></html>`;
 web=await createServer({configFile:false,plugins:[react(),{name:'isolated-risk-api',configureServer(server){server.middlewares.use('/api/zhiyin/bank',bankMiddleware(bank));server.middlewares.use('/__risk-check',async(req,res,next)=>{if(req.url!=='/'&&req.url!=='')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__risk-check',html));});}}],server:{host:'127.0.0.1',port:0},appType:'custom'});
 await web.listen();const address=web.httpServer.address();
 browser=await puppeteer.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 const page=await browser.newPage();await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${address.port}/__risk-check`,{waitUntil:'networkidle0'});
 const click=async text=>{await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===text&&!b.disabled),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text).click(),text);};
 await click('核对即时转账');await page.waitForSelector('.transfer-risk-review');
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='确认并立即转账（沙箱）').disabled),true);
 assert.equal(bank.get().transactions.length,1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:join(screenshots,'mobile-review.png'),fullPage:true});
 await page.setViewport({width:1280,height:900,isMobile:true,hasTouch:true});await page.screenshot({path:join(screenshots,'desktop-review.png'),fullPage:true});
 await page.click('input[type=checkbox]');assert.equal(bank.get().transactions.length,1);
 await click('确认并立即转账（沙箱）');await page.waitForFunction(()=>document.body.textContent.includes('转账已完成'));
 assert.equal(bank.get().transactions.length,2);assert.equal(bank.get().balance,3230000);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',transfers:2,balance:bank.get().balance,screenshots}));
}finally{await browser?.close();await web?.close();await loader.close();await rm(directory,{recursive:true,force:true});}
