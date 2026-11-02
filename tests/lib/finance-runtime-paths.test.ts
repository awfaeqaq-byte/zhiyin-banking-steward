import {afterEach,expect,it,vi} from 'vitest';
import {resolve} from 'node:path';
import {createAkshareMarketService} from '../../server/akshare-market';
import {createFundSamplesService} from '../../server/fund-samples';
const execute=vi.hoisted(()=>vi.fn((_command:string,_args:string[],_options:unknown,callback:(error:null,result:{stdout:string})=>void)=>callback(null,{stdout:JSON.stringify({indicators:[],capabilities:[],provider:'issuer_akshare',records:[]})})));
const root=process.cwd();
vi.mock('node:child_process',async original=>{
 const actual=await original<typeof import('node:child_process')>();
 return {...actual,default:{...actual,execFile:execute},execFile:execute};
});
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();});
it('从mobilegym目录启动时仍使用根项目Python脚本，不误用沙箱scripts目录',async()=>{
 vi.spyOn(process,'cwd').mockReturnValue(resolve(root,'mobilegym'));
 await createAkshareMarketService({cacheFile:'/unused-market-test.json'}).refresh();
 await createFundSamplesService({cacheFile:'/unused-funds-test.json'}).refresh();
 expect(execute.mock.calls.map(call=>call[1][0])).toEqual([
  resolve(root,'scripts/data/akshare_market.py'),
  resolve(root,'scripts/data/akshare_fund_samples.py'),
 ]);
});
