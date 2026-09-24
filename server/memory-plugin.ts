import type {Plugin} from 'vite';
import {fileURLToPath} from 'node:url';
import {createMemoryStore,memoryMiddleware} from './memory-store';
import {createBankStore,bankMiddleware} from './bank-store';
export function memoryPlugin():Plugin {
  const middleware=memoryMiddleware(createMemoryStore(fileURLToPath(new URL('../.zhiyin-memory.local.json',import.meta.url))));
  const bank=bankMiddleware(createBankStore(fileURLToPath(new URL('../.zhiyin-bank.local.json',import.meta.url))));
  const protect=(req:import('node:http').IncomingMessage,res:import('node:http').ServerResponse,next:()=>void)=>{
    let url=req.url || '';try{url=decodeURIComponent(url);}catch{/* Malformed URLs cannot match a file. */}
    if(url.includes('.zhiyin-memory.local.json') || url.includes('.zhiyin-bank.local.json')){res.statusCode=403;res.end('Forbidden');return;}next();
  };
  return {name:'zhiyin-long-term-memory',configureServer(server){server.middlewares.use(protect);server.middlewares.use('/api/zhiyin/memory',middleware);server.middlewares.use('/api/zhiyin/bank',bank);},configurePreviewServer(server){server.middlewares.use(protect);server.middlewares.use('/api/zhiyin/memory',middleware);server.middlewares.use('/api/zhiyin/bank',bank);}};
}
