import {merchantMiddleware} from './merchant';
import type {Plugin,ViteDevServer,PreviewServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {createVoiceConfigStore,voiceMiddleware,voiceOfferMiddleware,voiceStatusMiddleware} from './voice-service';
import {createMemoryStore,memoryMiddleware} from './memory-store';
import {createBankStore,bankMiddleware} from './bank-store';
import {createTaskStore,taskMiddleware} from './task-store';
import {expenseMiddleware} from './expense-store';
import {workspaceMiddleware} from './workspace-store';
import {sceneMiddleware} from './scene-service';
import {sceneExpensesMiddleware} from './scene-expenses';
import {createSceneExpenseResolver} from './scene-expense-sources';
import {messageMiddleware} from './message-service';
import {localStewardModel} from './model-reply';
import {stewardResetMiddleware} from './steward-reset';
import {createWealthStore,wealthMiddleware} from './wealth-store';
import {createAkshareMarketService,marketContextMiddleware} from './akshare-market';
import {createFundSamplesService,fundSamplesMiddleware} from './fund-samples';
import {agentAutomationMiddleware,createAgentAutomationService} from './agent-automation';
import {billSourceMiddleware,createBillSourceService,readLocalWechatSource} from './bill-source';
export function memoryPlugin():Plugin {
  const voiceConfig=createVoiceConfigStore(fileURLToPath(new URL('../.zhiyin-voice.local.json',import.meta.url)));
  const reset=stewardResetMiddleware(fileURLToPath(new URL('../',import.meta.url)));
  const workspaces=workspaceMiddleware(fileURLToPath(new URL('../',import.meta.url)));
  const scenes=sceneMiddleware(fileURLToPath(new URL('../',import.meta.url)));
  const sceneExpenses=sceneExpensesMiddleware(fileURLToPath(new URL('../',import.meta.url)),createSceneExpenseResolver(fileURLToPath(new URL('../',import.meta.url))));
  const messages=messageMiddleware(fileURLToPath(new URL('../',import.meta.url)),localStewardModel);
  const merchant=merchantMiddleware(fileURLToPath(new URL('../',import.meta.url)));
  const expenses=expenseMiddleware(fileURLToPath(new URL('../',import.meta.url)));
  const middleware=memoryMiddleware(createMemoryStore(fileURLToPath(new URL('../.zhiyin-memory.local.json',import.meta.url))));
  const bankStore=createBankStore(fileURLToPath(new URL('../.zhiyin-bank.local.json',import.meta.url)));
  const bank=bankMiddleware(bankStore);
  const tasks=taskMiddleware(createTaskStore(fileURLToPath(new URL('../.zhiyin-tasks.local.json',import.meta.url))));
  const wealth=wealthMiddleware(createWealthStore(bankStore,fileURLToPath(new URL('../.zhiyin-wealth.local.json',import.meta.url))));
  const market=marketContextMiddleware(createAkshareMarketService({cacheFile:fileURLToPath(new URL('../.zhiyin-market-cache.local.json',import.meta.url))}));
  const fundSamples=fundSamplesMiddleware(createFundSamplesService({cacheFile:fileURLToPath(new URL('../.zhiyin-fund-samples.local.json',import.meta.url))}));
  const billSources=createBillSourceService({grantFile:fileURLToPath(new URL('../.zhiyin-bill-grants.local.json',import.meta.url)),fetchSource:(provider,month)=>{
    if(provider!=='wechat_pay')throw new Error('支付宝尚无服务端账单适配器，请断开该来源或等待接入');
    return readLocalWechatSource(fileURLToPath(new URL('../.zhiyin-bill-source.local.json',import.meta.url)),fileURLToPath(new URL('../scripts/data/import_wechat_bill.py',import.meta.url)),month);
  }});
  const billSource=billSourceMiddleware(billSources);
  const automations=agentAutomationMiddleware(createAgentAutomationService({stateFile:fileURLToPath(new URL('../.zhiyin-automations.local.json',import.meta.url)),databaseUrl:`file:${fileURLToPath(new URL('../.zhiyin-mastra.db',import.meta.url))}`,refreshBills:billSources.refresh}));
  const startScheduler=(server:{httpServer?:{once:(event:string,listener:()=>void)=>unknown}|null})=>{
    const run=()=>{try{bankStore.runDue();}catch(error){console.error('银行预约调度失败',error instanceof Error?error.message:'unknown');}};
    run();const timer=setInterval(run,1000);timer.unref();server.httpServer?.once('close',()=>clearInterval(timer));
  };
  const protect=(req:import('node:http').IncomingMessage,res:import('node:http').ServerResponse,next:()=>void)=>{
    let url=req.url || '';try{url=decodeURIComponent(url);}catch{/* Malformed URLs cannot match a file. */}
    if(url.includes('.zhiyin-voice.local.json')){res.statusCode=403;res.end('Forbidden');return;}
    if(['.zhiyin-merchant.local.json','.zhiyin-workspaces-','.zhiyin-expenses-','.zhiyin-memory.local.json','.zhiyin-bank.local.json','.zhiyin-tasks.local.json','.zhiyin-wealth.local.json','.zhiyin-market-cache.local.json','.zhiyin-fund-samples.local.json','.zhiyin-automations.local.json','.zhiyin-bill-grants.local.json','.zhiyin-bill-source.local.json','.zhiyin-mastra.db'].some(name=>url.includes(name))){res.statusCode=403;res.end('Forbidden');return;}next();
  };
  const routes=[
    ['/api/sandbox/voice-config',voiceMiddleware(voiceConfig)],['/api/zhiyin/voice/status',voiceStatusMiddleware(voiceConfig)],['/api/zhiyin/voice/offer',voiceOfferMiddleware(voiceConfig)],
    ['/api/zhiyin/merchant',merchant],['/api/zhiyin/scenes',scenes],['/api/zhiyin/scene-expenses',sceneExpenses],['/api/zhiyin/reset',reset],['/api/zhiyin/workspaces',workspaces],['/api/zhiyin/messages',messages],['/api/zhiyin/expenses',expenses],
    ['/api/zhiyin/memory',middleware],['/api/zhiyin/bank',bank],['/api/zhiyin/tasks',tasks],
    ['/api/zhiyin/wealth',wealth],['/api/zhiyin/bill-source',billSource],
    ['/api/zhiyin/market-context',market],['/api/zhiyin/fund-samples',fundSamples],
    ['/api/zhiyin/automations',automations],
  ] as const;
  const configure=(server:ViteDevServer|PreviewServer)=>{
    startScheduler(server);server.middlewares.use(protect);
    for(const [path,handler] of routes)server.middlewares.use(path,handler);
  };
  return {name:'zhiyin-long-term-memory',configureServer:configure,configurePreviewServer:configure};
}
