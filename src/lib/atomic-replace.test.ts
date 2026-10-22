import {afterEach,describe,expect,it,vi} from 'vitest';
import {existsSync,mkdtempSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {atomicReplace} from '../../server/atomic-replace';

const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function files(){const dir=mkdtempSync(join(tmpdir(),'zhiyin-atomic-'));dirs.push(dir);const target=join(dir,'state.json'),source=target+'.tmp';writeFileSync(target,'original');writeFileSync(source,'next');return {source,target};}
const denial=(code:string)=>Object.assign(new Error(code),{code});

describe('Windows atomic workspace replacement',()=>{
 it('recovers a brief denial without touching the original before replacement',()=>{
  const {source,target}=files(),wait=vi.fn();let calls=0;
  const rename:typeof renameSync=(from,to)=>{calls++;if(calls<=2){expect(readFileSync(target,'utf8')).toBe('original');throw denial(calls===1?'EPERM':'EBUSY');}renameSync(from,to);};
  atomicReplace(source,target,{platform:'win32',rename,wait});
  expect(calls).toBe(3);expect(wait.mock.calls).toEqual([[10],[20]]);expect(readFileSync(target,'utf8')).toBe('next');expect(existsSync(source)).toBe(false);
 });
 it('bounds persistent failures and preserves both original and pending data',()=>{
  const {source,target}=files(),rename=vi.fn(()=>{throw denial('EACCES');}),wait=vi.fn();
  expect(()=>atomicReplace(source,target,{platform:'win32',rename,wait})).toThrow('EACCES');
  expect(rename).toHaveBeenCalledTimes(6);expect(wait).toHaveBeenCalledTimes(5);expect(readFileSync(target,'utf8')).toBe('original');expect(readFileSync(source,'utf8')).toBe('next');
 });
 it('does not retry missing files or apply Windows policy on other platforms',()=>{
  for(const [platform,code] of [['win32','ENOENT'],['linux','EPERM']] as const){const rename=vi.fn(()=>{throw denial(code);}),wait=vi.fn();expect(()=>atomicReplace('source','target',{platform,rename,wait})).toThrow(code);expect(rename).toHaveBeenCalledTimes(1);expect(wait).not.toHaveBeenCalled();}
 });
});
