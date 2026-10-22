import {renameSync} from 'node:fs';

type ReplaceOptions={platform?:NodeJS.Platform;rename?:typeof renameSync;wait?:(ms:number)=>void};
const delays=[10,20,40,80,160];
const pause=(ms:number)=>{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);};

// Windows readers and antivirus can briefly deny replacing an existing file.
// Keep the original intact; retry the atomic rename rather than overwriting it.
export function atomicReplace(source:string,target:string,{platform=process.platform,rename=renameSync,wait=pause}:ReplaceOptions={}){
 for(let attempt=0;;attempt++){
  try{rename(source,target);return;}
  catch(error){
   const code=(error as NodeJS.ErrnoException).code;
   if(platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(code||'')||attempt>=delays.length)throw error;
   wait(delays[attempt]);
  }
 }
}
