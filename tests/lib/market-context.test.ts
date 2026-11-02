import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAkshareMarketService} from '../../server/akshare-market';
import {validMarketContext} from '../../src/lib/market-context';

const directories:string[]=[];
const fixture=()=>{const directory=mkdtempSync(join(tmpdir(),'zhiyin-market-'));directories.push(directory);return join(directory,'cache.json');};
afterEach(()=>{for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
const index={key:'csi300' as const,label:'沪深300',date:'20260930',value:4688.12,unit:'point' as const,change:0.84};
const shibor={key:'shibor_3m' as const,label:'Shibor 3个月',date:'20260930',value:1.82,unit:'percent' as const};

describe('AKShare 外部市场数据',()=>{
  it('默认只显示适配器就绪，不在页面载入时请求外部数据',()=>{
    const runner=vi.fn();
    const service=createAkshareMarketService({cacheFile:fixture(),runner});
    expect(service.get().status).toBe('connected');
    expect(service.get().provider).toBe('akshare');
    expect(runner).not.toHaveBeenCalled();
  });
  it('先进行小样本验证，成功后才批量获取指数和利率',async()=>{
    const runner=vi.fn(async(mode:'probe'|'batch')=>mode==='probe'
      ?{indicators:[index],capabilities:[{name:'小样本 · 沪深300',status:'ready' as const}]}
      :{indicators:[index,shibor],capabilities:[{name:'沪深300日线',status:'ready' as const},{name:'Shibor 3个月',status:'ready' as const}]});
    const service=createAkshareMarketService({cacheFile:fixture(),runner,now:()=>1790784000000});
    const result=await service.refresh();
    expect(runner.mock.calls.map(call=>call[0])).toEqual(['probe','batch']);
    expect(result.status).toBe('ready');
    expect(result.indicators).toEqual(expect.arrayContaining([index,shibor]));
    expect(validMarketContext(service.get())).toBe(true);
  });
  it('小样本为空时停止批量获取',async()=>{
    const runner=vi.fn(async()=>({indicators:[],capabilities:[{name:'小样本 · 沪深300',status:'empty' as const}]}));
    const result=await createAkshareMarketService({cacheFile:fixture(),runner}).refresh();
    expect(runner).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('error');
    expect(result.message).toContain('已停止');
  });
  it('批量阶段失败时保留已经验证的小样本并明确降级',async()=>{
    const runner=vi.fn(async(mode:'probe'|'batch')=>{
      if(mode==='batch')throw new Error('Shibor upstream timeout');
      return {indicators:[index],capabilities:[{name:'小样本 · 沪深300',status:'ready' as const}]};
    });
    const result=await createAkshareMarketService({cacheFile:fixture(),runner,now:()=>1790784000000}).refresh();
    expect(result.status).toBe('connected');
    expect(result.indicators).toEqual([index]);
    expect(result.message).toContain('批量更新失败');
  });
});
