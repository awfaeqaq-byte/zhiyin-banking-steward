import {describe,it,expect} from 'vitest';
import {emptyMemory,updateMemory,memoryContext,validMemoryState} from './steward-memory';
import {parseImpression} from './steward-profile';
import {buildStewardInstructions} from './steward-chat';
import {buildBillAnalysis} from './bill-analysis';
describe('长期印象',()=>{
  const observation={topic:'communication' as const,text:'喜欢先听结论',quote:'先说结论',userText:'请先说结论'};
  function enabled(){let s=updateMemory(emptyMemory(),{type:'enabled',revision:0,enabled:true});return updateMemory(s,{type:'profile',revision:1,profileAction:'enable',enabled:true});}
  it('独立开启、需要原文证据，旧数据兼容',()=>{
    expect(validMemoryState(emptyMemory())).toBe(true);
    expect(()=>updateMemory({...emptyMemory(),enabled:true},{type:'profile',revision:0,profileAction:'observe',observation})).toThrow();
    const s=enabled();
    expect(()=>updateMemory(s,{type:'profile',revision:s.revision,profileAction:'observe',observation:{...observation,userText:'你好'}})).toThrow();
    expect(()=>updateMemory(s,{type:'profile',revision:s.revision,profileAction:'observe',observation:{...observation,text:'风险承受能力高'}})).toThrow();
  });
  it('暂定印象可纠正，模型不能覆盖用户确认',()=>{
    let s=enabled();s=updateMemory(s,{type:'profile',revision:s.revision,profileAction:'observe',observation},100);
    expect(s.profile?.items[0].status).toBe('tentative');
    expect(memoryContext(s,'回复方式',101)).toContain('暂定');
    s=updateMemory(s,{type:'profile',revision:s.revision,profileAction:'correct',topic:'communication',text:'喜欢详细解释'},102);
    s=updateMemory(s,{type:'profile',revision:s.revision,profileAction:'observe',observation},103);
    expect(s.profile?.items[0].text).toBe('喜欢详细解释');
    expect(s.profile?.items[0].status).toBe('confirmed');
  });
  it('过期不注入，忘记后不自动重新生成；关闭停止注入',()=>{
    let s=enabled();s=updateMemory(s,{type:'profile',revision:s.revision,profileAction:'observe',observation},100);
    expect(memoryContext(s,'你好',100+91*86400000)).not.toContain('喜欢先听结论');
    s=updateMemory(s,{type:'profile',revision:s.revision,profileAction:'forget',topic:'communication'});
    s=updateMemory(s,{type:'profile',revision:s.revision,profileAction:'observe',observation});
    expect(s.profile?.items).toHaveLength(0);
    s=updateMemory(s,{type:'profile',revision:s.revision,profileAction:'correct',topic:'communication',text:'喜欢详细解释'});
    s=updateMemory(s,{type:'profile',revision:s.revision,profileAction:'enable',enabled:false});
    expect(memoryContext(s,'回复方式')).not.toContain('喜欢详细解释');
  });
  it('模型标记移除，校验领域与引用，畸形输出不泄漏',()=>{
    const raw='好的<impression>'+JSON.stringify(observation)+'</impression>';
    expect(parseImpression(raw,observation.userText).observation?.topic).toBe('communication');
    expect(parseImpression(raw,'你好').observation).toBeNull();
    expect(parseImpression('好的<impression>{坏数据','你好').text).toBe('好的');
    expect(parseImpression(raw+raw,observation.userText).observation).toBeNull();
  });
  it('画像和记忆满载时仍符合模型请求预算',()=>{
    let s=enabled();
    for(const topic of ['communication','music','transport','dining','shopping'] as const)s=updateMemory(s,{type:'profile',revision:s.revision,profileAction:'correct',topic,text:'偏好'.repeat(50)});
    for(let i=0;i<5;i++)s=updateMemory(s,{type:'save',revision:s.revision,text:`偏好${i}`+'高铁'.repeat(60),category:'habit'});
    for(const billAnalysis of [undefined,buildBillAnalysis({},'账单')])expect(buildStewardInstructions({stewardName:'宁宁',subscriptions:[],messages:[],billAnalysis,memoryContext:memoryContext(s,'偏好')} ).length).toBeLessThanOrEqual(4000);
  });
});
