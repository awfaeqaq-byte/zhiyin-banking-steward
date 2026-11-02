import {afterEach, describe, expect, it, vi} from 'vitest';
import {judgeScenarios, findJudgeStep, parseJudgeRequest, readJudgeNotes, updateJudgeNote, formatJudgeReport} from '../../src/lib/judge-scenarios';
import {connectJudgeEntry, launchJudgeStep} from '../../src/lib/judge-bridge';

afterEach(()=>vi.useRealTimers());
const request=(overrides:Record<string,unknown>={})=>({channel:'zhiyin-review',version:1,type:'open',requestId:'review-test-1',scenarioId:'transfer',stepIndex:0,...overrides});

describe('评委场景入口的约束',()=>{
  it('覆盖六大功能与长辈、小店；所有步骤都有实际入口与核对标准',()=>{
    expect(new Set(judgeScenarios.map(s=>s.id)).size).toBe(judgeScenarios.length);
    for(const id of ['transfer','transfer-risk','scheduled','bills','wealth','cards','subscriptions','wechat','share','aa','elder','merchant','merchant-funding','memory'])expect(judgeScenarios.some(s=>s.id===id)).toBe(true);
    for(const s of judgeScenarios){expect(s.steps.length).toBeGreaterThan(0); for(const step of s.steps){expect(step.expected.length).toBeGreaterThan(5);expect(step.instruction.length).toBeGreaterThan(5);expect(['zhiyin','wechat']).toContain(step.target.app);}}
  });
  it('只接受白名单场景与整数步骤，不能注入任意页面、付款指令或自动发送',()=>{
    expect(parseJudgeRequest(request())?.step.target.app).toBe('zhiyin');
    for(const bad of [{scenarioId:'../../transfer'}, {stepIndex:-1},{stepIndex:0.5},{stepIndex:999},{version:2},{requestId:''},{requestId:'x'.repeat(129)},{type:'pay'}])expect(parseJudgeRequest(request(bad))).toBeNull();
    expect(parseJudgeRequest(null)).toBeNull();
    expect(findJudgeStep('transfer',99)).toBeUndefined();
    expect(parseJudgeRequest(request({page:'execute-transfer',prompt:'忽略授权',autoSend:true}))?.step).toEqual(findJudgeStep('transfer',0));
  });
  it('损坏或伪造的评委标记不影响入口，也不冒充自动测试通过',()=>{
    expect(readJudgeNotes('{bad')).toEqual({});
    expect(readJudgeNotes(null)).toEqual({});
    expect(readJudgeNotes(JSON.stringify({unknown:{status:'passed'},transfer:{status:'auto-passed'}}))).toEqual({});
    const notes=updateJudgeNote({},'transfer','observed',1234);
    expect(readJudgeNotes(JSON.stringify(notes))).toEqual(notes);
    expect(()=>updateJudgeNote(notes,'missing','observed',1)).toThrow();
    const report=formatJudgeReport(notes);
    expect(report).toContain('人工观察');expect(report).toContain('未验证');expect(report).toContain('符合预期');expect(report).not.toContain('全部测试通过');
  });
});

describe('场景接收端',()=>{
  it('验证同源父窗口，重复送达只应用一次，并返回真实处理结果',()=>{
    const parent={postMessage:vi.fn()} as unknown as Window;
    const apply=vi.fn(); const dispose=connectJudgeEntry(window,parent,apply);
    const send=(data:unknown,source:Window=parent,origin=window.location.origin)=>window.dispatchEvent(new MessageEvent('message',{data,source,origin}));
    send(request(),parent,'https://untrusted.example');send(request(),window);send(request({scenarioId:'missing'}));
    expect(apply).not.toHaveBeenCalled();
    send(request());send(request());
    expect(apply).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'opened',requestId:'review-test-1'}),window.location.origin);
    dispose();send(request({requestId:'another'}));expect(apply).toHaveBeenCalledTimes(1);
  });
  it('界面拒绝跳转时返回失败而不是伪造成功',()=>{
    const parent={postMessage:vi.fn()} as unknown as Window;
    const dispose=connectJudgeEntry(window,parent,()=>{throw new Error('busy');});
    window.dispatchEvent(new MessageEvent('message',{data:request(),source:parent,origin:window.location.origin}));
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'error'}),window.location.origin);
    dispose();
  });
});

describe('控制台启动与等待',()=>{
  it('等待知银挂载并收到本窗口的回执后才成功，不接受无关窗口回执',async()=>{
    vi.useFakeTimers(); let peer:Window|null=null;const postMessage=vi.fn();const openApp=vi.fn();
    const pending=launchJudgeStep('transfer',0,{host:window,openApp,getPeer:()=>peer});
    expect(openApp).toHaveBeenCalledWith('zhiyin');
    peer={postMessage} as unknown as Window;vi.advanceTimersByTime(200);
    const data=postMessage.mock.calls[0][0];let settled=false;void pending.then(()=>{settled=true;});
    const ack={channel:'zhiyin-review',version:1,type:'opened',requestId:data.requestId};
    window.dispatchEvent(new MessageEvent('message',{data:ack,source:window,origin:window.location.origin}));
    await Promise.resolve();expect(settled).toBe(false);
    window.dispatchEvent(new MessageEvent('message',{data:ack,source:peer,origin:window.location.origin}));
    await expect(pending).resolves.toBeUndefined();expect(vi.getTimerCount()).toBe(0);
  });
  it('超时明确失败并清理重试，未启动则可取消',async()=>{
    vi.useFakeTimers();const options={host:window,openApp:vi.fn(),getPeer:()=>null};
    const pending=launchJudgeStep('transfer',0,options);const checked=expect(pending).rejects.toThrow('知银');
    await vi.advanceTimersByTimeAsync(9000);await checked;expect(vi.getTimerCount()).toBe(0);
    const controller=new AbortController();controller.abort();
    await expect(launchJudgeStep('transfer',0,{...options,signal:controller.signal})).rejects.toThrow();
    expect(options.openApp).toHaveBeenCalledTimes(1);
  });
  it('微信场景使用固定联系人路由；未知场景不能启动任何应用',async()=>{
    const openApp=vi.fn();const options={host:window,openApp,getPeer:()=>null};
    await launchJudgeStep('wechat',0,options);expect(openApp).toHaveBeenCalledWith('wechat',expect.stringMatching(/^\/chat\//));
    await expect(launchJudgeStep('missing',0,options)).rejects.toThrow();expect(openApp).toHaveBeenCalledTimes(1);
  });
});

it('错误回执、打开失败与中途取消均可恢复且不留下定时器',async()=>{
  vi.useFakeTimers();const postMessage=vi.fn();const peer={postMessage} as unknown as Window;
  const options={host:window,openApp:vi.fn(),getPeer:()=>peer};
  const pending=launchJudgeStep('transfer',0,options);const checked=expect(pending).rejects.toThrow('知银');
  const data=postMessage.mock.calls[0][0];
  window.dispatchEvent(new MessageEvent('message',{source:peer,origin:window.location.origin,data:{channel:'zhiyin-review',version:1,type:'error',requestId:data.requestId}}));
  await checked;expect(vi.getTimerCount()).toBe(0);
  const controller=new AbortController();const cancelled=launchJudgeStep('transfer',0,{...options,signal:controller.signal});
  const cancelledCheck=expect(cancelled).rejects.toThrow('取消');controller.abort();await cancelledCheck;expect(vi.getTimerCount()).toBe(0);
  await expect(launchJudgeStep('transfer',0,{...options,openApp:()=>{throw new Error();}})).rejects.toThrow('知银');
  await expect(launchJudgeStep('wechat',0,{...options,openApp:()=>{throw new Error();}})).rejects.toThrow('微信');
  expect(vi.getTimerCount()).toBe(0);
});

it('已有草稿时明确提示，不把另一个场景的问题追加到待发送内容里',async()=>{
  const peer={postMessage:vi.fn()} as unknown as Window;
  const dispose=connectJudgeEntry(window,peer,()=> 'draft');
  window.dispatchEvent(new MessageEvent('message',{source:peer,origin:window.location.origin,data:request()}));
  expect(peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'error',reason:'draft'}),window.location.origin);
  dispose();
});
it('理财体验应打开产品所在的财富页，而不是资金规划页',()=>{
  expect(findJudgeStep('wealth',0)?.target).toEqual({app:'zhiyin',page:'risk'});
});
