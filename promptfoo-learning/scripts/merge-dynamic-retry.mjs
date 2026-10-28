import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..','results');
const original=JSON.parse(readFileSync(resolve(root,'security-dynamic-56b5cfd-rerun.json'),'utf8'));
const path=resolve(root,'security-dynamic-retry.json');
let replaced=0;
if(existsSync(path)){
 const retry=JSON.parse(readFileSync(path,'utf8'));
 for(const row of retry.results.results){
  const index=row.testCase?.metadata?.originalTestIdx;
  if(!Number.isInteger(index)||!original.results.results[index])throw new Error(`Retry missing original index: ${index}`);
  if(typeof row.response?.output==='string'&&row.response.output.trim()){
   row.testIdx=index;
   row.testCase.metadata={...row.testCase.metadata,retried:true};
   original.results.results[index]=row;
   replaced++;
  }
 }
}
original.metadata={...original.metadata,transportRetryReplacements:replaced};
writeFileSync(resolve(root,'security-dynamic-56b5cfd-final.json'),JSON.stringify(original,null,2)+'\n');
console.log(`Merged ${replaced} completed retries into 36-case final evidence`);
