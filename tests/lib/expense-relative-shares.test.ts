import {afterEach,expect,it,vi} from 'vitest';
import {requestExpenseReply} from '../../src/lib/expense-service';
import {entryAllocations,type ExpenseBook,type ExpenseInput} from '../../src/lib/expense-notebook';

const book:ExpenseBook={id:'book',title:'聚餐',at:0,entries:[],batches:[],participants:['self','wang','li'],defaultPayerId:'self',group:{id:'g',name:'饭搭子',revision:1,members:[
 {id:'self',name:'我',self:true,gender:'male'},
 {id:'li',name:'李娜',gender:'female'},
 {id:'wang',name:'小王',gender:'male'},
 {id:'other',name:'未参与者',gender:'unknown'},
]}};
const wrong:ExpenseInput={title:'夜宵',amount:22000,payerId:'self',fixed:[{memberId:'li',amount:11000}],shares:[{memberId:'self',weight:1},{memberId:'wang',weight:1}]};
function modelReply(entry:ExpenseInput,extra:Record<string,unknown>={}){
 return vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({output_text:JSON.stringify({action:'add',entry,message:'你55元，李娜110元，小王55元。',...extra})})));
}
afterEach(()=>vi.restoreAllMocks());
it.each([
 wrong,
 {...wrong,fixed:[],shares:[{memberId:'self',weight:1},{memberId:'li',weight:2},{memberId:'wang',weight:1}]},
])('保存前落实相对半份，不能把半价变成半个总额或反向权重',async entry=>{
 modelReply(entry);
 const result=await requestExpenseReply(book,'夜宵220元，女生半价，其他人通a');
 expect(result.action).toBe('add');
 expect(result.entry).toMatchObject({title:'夜宵',amount:22000,payerId:'self',fixed:[]});
 expect(result.entry!.shares).toEqual([{memberId:'self',weight:2},{memberId:'wang',weight:2},{memberId:'li',weight:1}]);
 expect(Object.fromEntries(entryAllocations(book.group,result.entry!).map(m=>[m.id,m.amount]))).toEqual({self:8800,li:4400,wang:8800,other:0});
});
it('参与人性别未知时先问谁半份，不能根据姓名猜；未参与成员未知不影响处理',async()=>{
 const fetcher=modelReply(wrong);
 const result=await requestExpenseReply({...book,group:{...book.group,members:book.group.members.map(m=>m.id==='li'?{...m,gender:'unknown'}:m)}},'夜宵220元，女生半价，其他人通a');
 expect(result.action).toBe('clarify');expect(result.entry).toBeUndefined();expect(result.message).toContain('李娜');expect(fetcher).not.toHaveBeenCalled();
});
it('用户点名半份不依赖性别资料',async()=>{
 modelReply(wrong);
 const result=await requestExpenseReply({...book,group:{...book.group,members:book.group.members.map(m=>({...m,gender:undefined}))}},'夜宵220元，李娜半份，其他人平分');
 expect(result.entry?.fixed).toEqual([]);
 expect(Object.fromEntries(entryAllocations(book.group,result.entry!).map(m=>[m.id,m.amount]))).toEqual({self:8800,li:4400,wang:8800,other:0});
});
it('纠正已有夜宵只修改原条目的分法，不让模型漂移金额和付款人',async()=>{
 const existing={...wrong,id:'supper',at:1};
 modelReply({...wrong,amount:44000,payerId:'wang'},{action:'edit',entryId:existing.id});
 const result=await requestExpenseReply({...book,entries:[existing]},'刚才夜宵改成李娜半份，其他人平分');
 expect(result).toMatchObject({action:'edit',entryId:'supper',entry:{amount:22000,payerId:'self',fixed:[]}});
 expect(Object.fromEntries(entryAllocations(book.group,result.entry!).map(m=>[m.id,m.amount]))).toEqual({self:8800,li:4400,wang:8800,other:0});
});
it('明确改成新金额即使没有元字也保留金额修改',async()=>{
 modelReply({...wrong,amount:33000},{action:'edit',entryId:'supper'});
 const result=await requestExpenseReply({...book,entries:[{...wrong,id:'supper',at:1}]},'上一笔改成330，女生半价');
 expect(result.entry?.amount).toBe(33000);
});
it('模型将分法更正误报新增时不重复记账',async()=>{
 modelReply(wrong);
 const result=await requestExpenseReply({...book,entries:[{...wrong,id:'supper',at:1}]},'刚才夜宵改成李娜半份，其他人平分');
 expect(result.action).toBe('clarify');expect(result.entry).toBeUndefined();
});
it('只调整剩余部分时不能清掉既有个人固定费用',async()=>{
 const original={...wrong,id:'drink',title:'饮料',amount:2000,fixed:[{memberId:'self',amount:400}],at:1};
 modelReply({...wrong,title:'饮料',amount:2000},{action:'edit',entryId:'drink'});
 const result=await requestExpenseReply({...book,entries:[original]},'刚才饮料剩余部分女生半价');
 expect(result.action).toBe('clarify');expect(result.entry).toBeUndefined();expect(original.fixed).toEqual([{memberId:'self',amount:400}]);
});
