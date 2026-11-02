// Uses the configured model ONLY for task routing, stubs all business replies.
// Does not execute bank, subscription or AA operations; creates isolated test task metadata.
import puppeteer from '../../mobilegym/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage();
await page.setRequestInterception(true);
page.on('request',r=>{
  if(new URL(r.url()).pathname!=='/api/zhiyin/steward-reply')return r.continue();
  const data=JSON.parse(r.postData());
  if(data.instructions.includes('任务分流器'))return r.continue();
  return r.respond({status:200,contentType:'application/json',body:JSON.stringify({output_text:'路由验证结束，未执行资金操作。'})});
});
try{
  await page.goto('http://localhost:3000/zhiyin/index.html',{waitUntil:'networkidle0'});
  await page.evaluate(async()=>{
    const scope=crypto.randomUUID();localStorage.setItem('zhiyin-mode','"native"');localStorage.setItem('zhiyin-expense-scope',scope);localStorage.setItem('zhiyin-workspace-active','dinner');
    const response=await fetch('/api/zhiyin/workspaces',{method:'POST',headers:{'Content-Type':'application/json','X-Zhiyin-Workspaces':'1','X-Zhiyin-Expense-Scope':scope},body:JSON.stringify({type:'create',id:'dinner',kind:'aa',title:'今晚聚餐',revision:0,requestId:crypto.randomUUID()})});
    if(!response.ok)throw new Error('Test task initialization failed');
  });
  await page.reload({waitUntil:'networkidle0'});
  const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/zhiyin/steward-reply'&&JSON.parse(r.request().postData()).instructions.includes('任务分流器'),{timeout:60000});
  await page.type('input[aria-label="和宁宁说点什么"]','明天给妈妈转500，刚才饮料改成16');
  await page.waitForFunction(()=>!document.querySelector('button[aria-label="发送给宁宁"]').disabled);
  await page.click('button[aria-label="发送给宁宁"]');
  const response=await result;const body=await response.json();
  assert.equal(response.status(),200,body.error||'Router failed');
  const output=JSON.parse(body.output_text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
  console.log('Synthetic routing result:',JSON.stringify(output));
  assert.equal(output.parts.length,2);
  assert.equal(output.parts[0].kind,'transfer');assert.equal(output.parts[0].text,'明天给妈妈转500');
  assert.equal(output.parts[1].taskId,'dinner');assert.equal(output.parts[1].text,'刚才饮料改成16');
  console.log('PASS: configured live model split transfer and AA correction, preserved both original clauses and selected the existing dinner task. No financial operation executed.');
}finally{await browser.close();}
