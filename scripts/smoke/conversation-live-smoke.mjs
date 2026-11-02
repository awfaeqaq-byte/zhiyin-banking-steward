// Synthetic conversation only: no user history, task writes, grants or financial operations.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const loader=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>originalFetch(new URL(String(url),'http://127.0.0.1:3000'),options);
try {
  const {routeWorkspacePrompt}=await loader.ssrLoadModule('/src/lib/workspace-service.ts');
  const {requestStewardReply}=await loader.ssrLoadModule('/src/lib/steward-chat.ts');
  const messages=[{role:'user',content:'帮我看看这个月的支出'},{role:'assistant',content:'需要先授权微信账单。'}];
  const task={id:'synthetic-bill',kind:'bills',title:'本月支出',status:'active',updatedAt:0,summary:'',memoryRevision:0,messages:messages.map((message,index)=>({...message,id:String(index),memoryRevision:0})),pending:[]};
  const route=await routeWorkspacePrompt('授权一下微信吧',[task],task.id,'',messages);
  assert.equal(route.parts.length,1);
  assert.equal(route.parts[0].taskId,task.id);
  assert.equal(route.parts[0].kind,'bills');
  assert.equal(route.parts[0].text,'授权一下微信吧');
  const reply=await requestStewardReply({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'？'}],recentConversation:[...messages,{role:'user',content:'授权一下微信吧'},{role:'assistant',content:'请核对微信账单的只读授权，现在尚未授权。'}]});
  assert.match(reply.text,/账单|支出/);
  assert.ok(!/有什么可以帮|想了解什么/.test(reply.text));
  console.log('PASS: live model retained the bill task and understood the follow-up. No grants or payments executed.');
  console.log('Synthetic reply:',reply.text);
} finally {
  globalThis.fetch=originalFetch;
  await loader.close();
}
