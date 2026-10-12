import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readLocalWechatSource} from '../../server/bill-source';
import {buildMonthlyBillReport} from './bill-report';

const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});

it('后台读取真实 XLSX 格式，每次校验哈希并按上月生成月报',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bill-refresh-'));dirs.push(dir);
 const file=join(dir,'wechat.xlsx'),config=join(dir,'source.json');
 const script=`import sys,zipfile,html
path=sys.argv[1]
headers=['交易时间','交易类型','交易对方','商品','收/支','金额(元)','支付方式','当前状态','交易单号','商户单号','备注']
rows=[headers,['2026-09-20 12:00:00','商户消费','测试餐厅','午餐','支出','12.34','零钱','支付成功','id-1','m-1','餐饮'],['2026-08-20 12:00:00','商户消费','测试商店','购物','支出','5.00','零钱','支付成功','id-2','m-2','购物']]
sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
for n,row in enumerate(rows,1):
 sheet+='<row r="%s">'%n
 for i,value in enumerate(row): sheet+='<c r="%s%s" t="inlineStr"><is><t>%s</t></is></c>'%(chr(65+i),n,html.escape(value))
 sheet+='</row>'
sheet+='</sheetData></worksheet>'
with zipfile.ZipFile(path,'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="账单" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml',sheet)`;
 execFileSync('python3',['-c',script,file]);
 const sha=createHash('sha256').update(readFileSync(file)).digest('hex');
 writeFileSync(config,JSON.stringify({sourcePath:file,expectedSha256:sha,enabled:true}));
 const source=await readLocalWechatSource(config,resolve('scripts/import_wechat_bill.py'),'2026-09');
 const report=buildMonthlyBillReport({wechat_pay:source},'2026-09')!;
 expect(report.expense).toBe(1234);
 expect(report.count).toBe(1);
 expect(source.transactions).toHaveLength(2);
 writeFileSync(file,'changed');
 await expect(readLocalWechatSource(config,resolve('scripts/import_wechat_bill.py'),'2026-09')).rejects.toThrow(/哈希已变化/);
});

it('默认不读取本地Excel，只有控制台手动启用后才允许后台回放',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bill-disabled-'));dirs.push(dir);
 const config=join(dir,'source.json');
 writeFileSync(config,JSON.stringify({sourcePath:join(dir,'missing.xlsx')}));
 await expect(readLocalWechatSource(config,resolve('scripts/import_wechat_bill.py'),'2026-09')).rejects.toThrow(/未启用/);
});
