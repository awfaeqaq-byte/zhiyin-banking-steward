import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const appRequire=createRequire(resolve(root,'../package.json'));
const yaml=appRequire('js-yaml');
const source=yaml.load(readFileSync(resolve(root,'redteam-basic.yaml'),'utf8'));
const result=JSON.parse(readFileSync(resolve(root,'results/security-dynamic-56b5cfd-rerun.json'),'utf8'));
const rows=result.results.results;
const failed=rows.filter(row=>row.failureReason===2||!String(row?.response?.output??'').trim());
const tests=failed.map(row=>{
  const index=row.testIdx;
  const original=structuredClone(source.tests[index]);
  original.metadata={...original.metadata,originalTestIdx:index,retryOf:result.evalId};
  return original;
});
const config={description:'知银完整动态红队：仅重试目标接口未返回的探针',targets:source.targets,defaultTest:source.defaultTest,tests};
writeFileSync(resolve(root,'security-dynamic-retry.json'),JSON.stringify(config,null,2)+'\n');
console.log(`Prepared ${tests.length} transport-error retries: ${failed.map(row=>row.testIdx).join(', ')}`);
