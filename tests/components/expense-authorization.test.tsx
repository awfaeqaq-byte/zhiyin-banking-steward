import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createRef} from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {ExpenseNotebook,type ExpenseNotebookHandle} from '../../src/components/expense-notebook';
import * as service from '../../src/lib/expense-service';
import * as aa from '../../src/lib/group-aa';
import {changeExpenses,emptyExpenseState,type ExpenseCommand} from '../../src/lib/expense-notebook';

afterEach(()=>vi.restoreAllMocks());
function fixture() {
 const group={id:'original',name:'原来的聚餐群',revision:1,members:[{id:'me',name:'我',self:true},{id:'li',name:'李娜'}]};
 let state=emptyExpenseState();
 const change=(operation:object)=>state=changeExpenses(state,{...operation,bookId:'book',revision:state.revision,requestId:crypto.randomUUID()} as ExpenseCommand);
 change({type:'create',title:'聚餐账本',group,participants:['me','li'],defaultPayerId:'me'});
 change({type:'add',entryId:'entry',entry:{title:'晚餐',amount:10000,payerId:'me',fixed:[],shares:group.members.map(m=>({memberId:m.id,weight:1}))}});
 change({type:'prepare',batchId:'batch',entryIds:['entry']});
 const plan=state.books[0].batches[0].plan,amounts=aa.calculateGroupAA(group,plan);
 const collection:aa.AACollection={...amounts,id:'batch',groupId:group.id,groupName:group.name,createdAt:1,plan,status:'pending',members:amounts.members.map(m=>({...m,paid:!!m.self}))};
 change({type:'published',batchId:'batch',collectionId:'batch'});change({type:'sync-collections',collections:[collection]});
 vi.spyOn(service,'expenseRequest').mockImplementation(async operation=>{if(operation)change(operation);return structuredClone(state);});
 return {group,state:()=>state,collection};
}

it('授权失败一次后停止前台后台轮询，重新授权原群后读取原批次且不重复发布',async()=>{
 const f=fixture(),bridge=vi.spyOn(aa,'groupAARequest').mockRejectedValue(new Error('此群授权已失效，请重新选择'));
 const ref=createRef<ExpenseNotebookHandle>();render(<ExpenseNotebook ref={ref} initialBookId="book" onPrompt={vi.fn()}/>);
 await screen.findByRole('button',{name:'聚餐账本 · 展开账本'});
 await act(async()=>{await ref.current!.handle('查看收款进度').catch(()=>null);});
 const restore=await screen.findByRole('button',{name:'重新授权原群'});
 act(()=>{window.dispatchEvent(new Event('zhiyin-phone-foreground'));window.dispatchEvent(new Event('zhiyin-expenses-updated'));});
 await act(async()=>{});expect(bridge).toHaveBeenCalledTimes(1);
 bridge.mockImplementation(async operation=>operation==='choose'?{group:f.group}:{collections:[f.collection]});
 await userEvent.click(restore);
 await waitFor(()=>expect(bridge).toHaveBeenCalledWith('choose',{groupId:'original'}));
 expect(bridge.mock.calls.every(([operation])=>operation!=='publish')).toBe(true);
 expect(f.state().books).toHaveLength(1);expect(f.state().books[0].batches[0]).toMatchObject({id:'batch',status:'published',receipt:{id:'batch'}});
 expect(screen.queryByRole('button',{name:'重新授权原群'})).not.toBeInTheDocument();
});

it('取消或错选群不会替换原账本、参与人或既有收款回执',async()=>{
 const f=fixture(),before=structuredClone(f.state()),bridge=vi.spyOn(aa,'groupAARequest').mockRejectedValue(new Error('此群授权已失效，请重新选择'));
 const ref=createRef<ExpenseNotebookHandle>();render(<ExpenseNotebook ref={ref} initialBookId="book" onPrompt={vi.fn()}/>);
 await screen.findByRole('button',{name:'聚餐账本 · 展开账本'});
 await act(async()=>{await ref.current!.handle('查看收款进度').catch(()=>null);});
 const restore=await screen.findByRole('button',{name:'重新授权原群'});
 bridge.mockRejectedValueOnce(new Error('你取消了微信操作'));await userEvent.click(restore);
 expect(f.state()).toEqual(before);
 bridge.mockResolvedValueOnce({group:{...f.group,id:'other'}});await userEvent.click(restore);
 expect(await screen.findByRole('alert')).toHaveTextContent('原群');
 expect(f.state()).toEqual(before);
});
