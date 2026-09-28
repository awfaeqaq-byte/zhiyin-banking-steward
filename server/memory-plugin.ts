import type {Plugin} from 'vite';
import {fileURLToPath} from 'node:url';
import {createMemoryStore,memoryMiddleware} from './memory-store';
import {createBankStore,bankMiddleware} from './bank-store';
import {createTaskStore,taskMiddleware} from './task-store';
export function memoryPlugin():Plugin {
  const middleware=memoryMiddleware(createMemoryStore(fileURLToPath(new URL('../.zhiyin-memory.local.json',import.meta.url))));
  const bankStore=createBankStore(fileURLToPath(new URL('../.zhiyin-bank.local.json',import.meta.url)));
  const bank=bankMiddleware(bankStore);
  const tasks=taskMiddleware(createTaskStore(fileURLToPath(new URL('../.zhiyin-tasks.local.json',import.meta.url))));
  const startScheduler=(server:{httpServer?:{once:(event:string,listener:()=>void)=>unknown}|null})=>{
    const run=()=>{try{bankStore.runDue();}catch(error){console.error('银行预约调度失败',error instanceof Error?error.message:'unknown');}};
    run();const timer=setInterval(run,1000);timer.unref();server.httpServer?.once('close',()=>clearInterval(timer));
  };
  const protect=(req:import('node:http').IncomingMessage,res:import('node:http').ServerResponse,next:()=>void)=>{
    let url=req.url || '';try{url=decodeURIComponent(url);}catch{/* Malformed URLs cannot match a file. */}
    if(url.includes('.zhiyin-memory.local.json') || url.includes('.zhiyin-bank.local.json') || url.includes('.zhiyin-tasks.local.json')){res.statusCode=403;res.end('Forbidden');return;}next();
  };
  return {name:'zhiyin-long-term-memory',configureServer(server){startScheduler(server);server.middlewares.use(protect);server.middlewares.use('/api/zhiyin/memory',middleware);server.middlewares.use('/api/zhiyin/bank',bank);server.middlewares.use('/api/zhiyin/tasks',tasks);},configurePreviewServer(server){startScheduler(server);server.middlewares.use(protect);server.middlewares.use('/api/zhiyin/memory',middleware);server.middlewares.use('/api/zhiyin/bank',bank);server.middlewares.use('/api/zhiyin/tasks',tasks);}};
}
