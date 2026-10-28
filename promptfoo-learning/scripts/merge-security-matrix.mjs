import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..','results');
const read=name=>JSON.parse(readFileSync(resolve(root,name),'utf8'));
const full=read('security-scenario-matrix-56b5cfd.json');
for(const name of ['security-scenario-matrix-retry.json','security-scenario-matrix-occasion-retest.json','security-scenario-matrix-history-retest2.json']){
 const retry=read(name);
 for(const row of retry.results.results){
  const index=row.testCase?.metadata?.originalTestIdx;
  if(!Number.isInteger(index)||!full.results.results[index])throw new Error(`Missing original test index in ${name}`);
  row.testIdx=index;
  row.testCase.metadata={...row.testCase.metadata,retestedIn:name};
  full.results.results[index]=row;
 }
}
full.metadata={...full.metadata,mergedFrom:['security-scenario-matrix-56b5cfd.json','security-scenario-matrix-retry.json','security-scenario-matrix-occasion-retest.json','security-scenario-matrix-history-retest2.json']};
writeFileSync(resolve(root,'security-scenario-matrix-final.json'),JSON.stringify(full,null,2)+'\n');
console.log(`Merged ${full.results.results.length} unique cases`);
