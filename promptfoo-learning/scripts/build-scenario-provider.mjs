import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const app=resolve(root,'..');
const output=resolve(root,'generated');mkdirSync(output,{recursive:true});
for(const [name,entry] of [['steward-chat','src/lib/steward-chat.ts'],['bill-analysis','src/lib/bill-analysis.ts']]){
 execFileSync(resolve(app,'node_modules/.bin/esbuild'),[resolve(app,entry),'--bundle','--platform=node','--format=esm',`--outfile=${resolve(output,name+'.mjs')}`,'--external:react','--external:react-dom','--loader:.md=text'],{stdio:'inherit'});
}
