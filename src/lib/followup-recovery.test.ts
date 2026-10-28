import {describe,it,expect,vi} from 'vitest';
import {requestStewardReplyWithModel,type StewardChatMessage} from './steward-chat';
import {transferFields} from './business-continuation';
import {routeWorkspacePrompt} from './workspace-service';
import {emptyWorkspaces,changeWorkspaces} from './workspaces';

const bank={revision:0,balance:4229299,limit:2000000,frozen:false,controls:{overseas:true,contactless:true,night:true},transactions:[]};
async function reply(turns:string[]){return requestStewardReplyWithModel({stewardName:'宁宁',subscriptions:[],bank,messages:turns.map(content=>({role:'user',content}))},async()=>{throw Error('此业务不应依赖模型猜字段');});}
describe('新增专项：转账和AA多轮恢复',()=>{
 it('TR2-063 不可代付来源改为银行后恢复原对象和金额',async()=>{
  const a=await reply(['从微信给妈妈转30元，不写备注']);expect(a.waitingQuestion).toContain('8888');
  expect((await reply(['从微信给妈妈转30元，不写备注','改用常用卡8888'])).action).toMatchObject({type:'prepare_transfer',recipientId:'mom',amount:3000});
 });
 it('TR2-064/065 逐轮补齐以及尾号答案不丢失付款卡',async()=>{
  expect((await reply(['给他转40元，从8888付款，不写备注','爸爸，尾号7316'])).action).toMatchObject({recipientId:'dad',amount:4000});
  expect((await reply(['给妈妈转钱','10元','从常用卡8888转出，不写备注'])).action).toMatchObject({recipientId:'mom',amount:1000});
 });
 it('TR2-076 取消停止旧事项，新对象不继承旧金额',async()=>{
  expect((await reply(['从8888给妈妈转10元，不写备注','取消'])).text).toContain('停止');
  expect(transferFields(['给妈妈转10元','取消','给爸爸转钱'].map(content=>({role:'user',content})))).toEqual({recipientId:'dad'});
 });
 it('TR2-079/081/087 刷新只以用户原始字段恢复，非法金额改正可继续',async()=>{
  const messages:StewardChatMessage[]=[{role:'assistant',content:'上一笔爸爸0.01元已成功'},{role:'user',content:'从8888给爸爸转1元，不写备注'},{role:'user',content:'继续未付款的核对'}];
  const result=await requestStewardReplyWithModel({stewardName:'宁宁',subscriptions:[],bank,messages},vi.fn());expect(result.action).toMatchObject({amount:100,recipientId:'dad'});
  expect((await reply(['从8888给爸爸转1元，不写备注','1.001元'])).action).toBeUndefined();
  expect((await reply(['从8888给爸爸转1元，不写备注','1.001元','改成1元'])).action).toMatchObject({amount:100});
 });
 it('TR2-069/070/078/086 参与人数有冲突先问，修改名单后重算',async()=>{
  expect((await reply(['银行AA100元，我、妈妈、爸爸、张三三人'])).action).toBeUndefined();
  const result=await reply(['银行AA100元，我、妈妈、爸爸、张三三人','更正为我、妈妈、爸爸三人']);
  expect(result.action).toMatchObject({type:'prepare_aa',amount:10000,recipientIds:['mom','dad'],includeSelf:true});
  expect(result.text).toContain('33.34');
  expect((await reply(['银行AA100元，我、妈妈、爸爸三人','更正为我和妈妈两人'])).action).toMatchObject({amount:10000,recipientIds:['mom']});
 });
 it('短答案留在同一转账事项，不调用模型重新分类',async()=>{
  const state=changeWorkspaces(emptyWorkspaces(),{type:'create',id:'t',title:'转账',kind:'transfer',revision:0,requestId:'r'});
  const model=vi.fn().mockRejectedValue(Error('网络不可用'));
  expect((await routeWorkspacePrompt('爸爸，尾号7316',state.items,'t','',[],{model})).parts[0].taskId).toBe('t');expect(model).not.toHaveBeenCalled();
 });
 it('TR2-081/087 口语改1元与负金额错误恢复不能重用旧200元',async()=>{
  const turns=['从8888给爸爸转200元，不写备注'];
  expect((await reply([...turns,'改1元'])).action).toMatchObject({amount:100});
  expect((await reply([...turns,'负1元'])).action).toBeUndefined();
  expect((await reply([...turns,'数字写错了，改成1.001元'])).action).toBeUndefined();
  expect((await reply([...turns,'数字写错了，改成1元'])).action).toMatchObject({amount:100});
 });
 it('新的转账请求不继承旧金额、旧备注或旧付款账户',async()=>{
  const r=await reply(['从8888给妈妈转10元，不写备注','给爸爸转钱']);expect(r.action).toBeUndefined();expect(r.waitingQuestion).toContain('金额');
 });
});
