import {describe,expect,it,vi} from 'vitest';
import {hasRecipientTransferAmount,transferAmountError} from './transfer-amount';
import {buildStewardInstructions,isBankRequest,requestStewardReplyWithModel} from './steward-chat';
import {routeWorkspacePrompt} from './workspace-service';
import type {Workspace} from './workspaces';
import {buildWechatShare,sharePrompt} from './wechat-message-share';

const user=(content:string)=>({role:'user' as const,content});
const request=(messages:ReturnType<typeof user>[])=>({stewardName:'宁宁',subscriptions:[],messages});

describe('transfer amount validation before model calls',()=>{
  it.each(['给妈妈0.001元吧','给妈妈转账0.001','给妈妈转0.001元','转账给妈妈0.001元','给爸爸转0元','给妈妈转-1元','给妈妈转1e-3元','给妈妈转1,000.001元'])('rejects %s without routing or reply model calls',async text=>{
    const model=vi.fn().mockResolvedValue('没有转账权限。');
    const route=await routeWorkspacePrompt(text,[],'','',[],{model});
    expect(route.parts[0]).toMatchObject({kind:'transfer',text});
    const response=await requestStewardReplyWithModel(request([user(text)]),model);
    expect(response.text).toContain('至少为0.01元');
    expect(response.text).toContain('最多保留两位小数');
    expect(response.text).not.toMatch(/网络|权限/);
    expect(response.action).toBeUndefined();
    expect(response.waitingQuestion).toContain('金额');
    expect(model).not.toHaveBeenCalled();
  });
  it('validates a changed amount and a short reply against the active transfer',async()=>{
    const model=vi.fn();
    for(const text of ['改成0.001元','0.001']) {
      const messages=[user('给妈妈转10元'),user(text)];
      expect((await requestStewardReplyWithModel(request(messages),model)).action).toBeUndefined();
      expect(transferAmountError(messages)).toContain('0.01元');
    }
    expect(model).not.toHaveBeenCalled();
    const task:Workspace={id:'transfer',kind:'transfer',title:'给妈妈转账',status:'active',updatedAt:0,summary:'',memoryRevision:0,messages:[{...user('给妈妈转钱'),id:'u',memoryRevision:0}]};
    expect((await routeWorkspacePrompt('0.001',[task],task.id,'',[],{model})).parts[0].taskId).toBe(task.id);
    expect(model).not.toHaveBeenCalled();
  });
  it.each(['给妈妈0.01元吧','给妈妈10元吧','给13800006621 100元','向母亲10元','给妈妈转1,000.01元'])('keeps valid %s on the bank flow without auto-authorizing',async text=>{
    expect(transferAmountError([user(text)])).toBeUndefined();
    expect(isBankRequest([user(text)])).toBe(true);
    expect(buildStewardInstructions(request([user(text)]))).toContain('PREPARE_TRANSFER');
    const model=vi.fn().mockResolvedValue('还要核对收款人信息吗？');
    const response=await requestStewardReplyWithModel(request([user(text)]),model);
    expect(response.action).toBeUndefined();
    expect(response.text).toMatch(/核对|账户|转出/);
  });
  it('does not reuse old invalid amounts or interpret unrelated numbers as a transfer',()=>{
    expect(transferAmountError([user('给妈妈转0.001元'),user('给妈妈转10元')])).toBeUndefined();
    expect(transferAmountError([user('给妈妈转10元'),user('算了'),user('0.001')])).toBeUndefined();
    expect(transferAmountError([user('利率0.001%是什么意思')])).toBeUndefined();
    expect(hasRecipientTransferAmount('给妈妈买0.001元的商品')).toBe(false);
    expect(hasRecipientTransferAmount('给妈妈发0.001元红包')).toBe(false);
  });
  it('does not validate quoted transfer text inside shared evidence as a new command',async()=>{
    const text=sharePrompt(buildWechatShare({id:'test',name:'测试',kind:'direct'},[{id:'m',sender:'朋友',text:'给妈妈转0.001元',sentAt:1791770000000}],['m'],'总结这段话，不转账','share'));
    expect(transferAmountError([user(text)])).toBeUndefined();
    const model=vi.fn().mockResolvedValue('这段话提到一笔转账，尚未执行。');
    const response=await requestStewardReplyWithModel(request([user(text)]),model);
    expect(response.text).toContain('这段话');
    expect(response.action).toBeUndefined();
    expect(model).toHaveBeenCalledOnce();
  });
});
