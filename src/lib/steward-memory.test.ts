import {describe,expect,it} from 'vitest';
import {emptyMemory, updateMemory, memoryContext, parseMemoryProposal} from './steward-memory';
import {buildStewardInstructions} from './steward-chat';
import {buildBillAnalysis} from './bill-analysis';
describe('长期记忆',()=>{
  it('默认关闭，开启后才允许保存；版本冲突不覆盖',()=>{
    expect(()=>updateMemory(emptyMemory(),{type:'save',revision:0,text:'偏好高铁',category:'preference'},100)).toThrow();
    const state=updateMemory(emptyMemory(),{type:'enabled',revision:0,enabled:true},100);
    expect(()=>updateMemory(state,{type:'enabled',revision:0,enabled:false},101)).toThrow(/变化/);
  });
  it('保存、修改、删除、过期与关闭都影响模型上下文',()=>{
    let state=updateMemory(emptyMemory(),{type:'enabled',revision:0,enabled:true},100);
    state=updateMemory(state,{type:'save',revision:1,text:'经常出差，喜欢坐高铁',category:'habit'},100);
    expect(memoryContext(state,'出差交通',101)).toContain('高铁');
    const id=state.items[0].id;
    state=updateMemory(state,{type:'save',revision:2,id,text:'现在喜欢飞机',category:'habit'},101);
    expect(memoryContext(state,'出差交通',102)).not.toContain('高铁');
    expect(memoryContext({...state,enabled:false},'交通',102)).toBe('');
    expect(memoryContext(state,'交通',Number.MAX_SAFE_INTEGER)).not.toContain('飞机');
    state=updateMemory(state,{type:'delete',revision:3,id},102);
    expect(state.items).toHaveLength(0);
  });
  it('重复文本合并，不保存密钥或交易授权',()=>{
    let state=updateMemory(emptyMemory(),{type:'enabled',revision:0,enabled:true},100);
    state=updateMemory(state,{type:'save',revision:1,text:'喜欢高铁',category:'preference'},100);
    state=updateMemory(state,{type:'save',revision:2,text:'喜欢高铁',category:'preference'},101);
    expect(state.items).toHaveLength(1);
    expect(()=>updateMemory(state,{type:'save',revision:3,text:'我的密码是123456',category:'background'},101)).toThrow();
  });
  it('模型仅提出有当前用户原文证据的候选，不自动保存',()=>{
    const output='了解。\n<memory>{"text":"经常出差","category":"habit","quote":"我经常出差"}</memory>';
    expect(parseMemoryProposal(output,'我经常出差').proposal?.text).toBe('经常出差');
    expect(parseMemoryProposal(output,'我没有出差').proposal).toBeNull();
    expect(parseMemoryProposal(output,'我没有出差').text).toBe('了解。');
  });
  it('记忆同时进入普通与账单请求，预算不超过代理限制',()=>{
    let state=updateMemory(emptyMemory(),{type:'enabled',revision:0,enabled:true});
    for(let i=0;i<10;i++)state=updateMemory(state,{type:'save',revision:state.revision,text:`偏好高铁${i}，${'出差'.repeat(50)}`,category:'habit'});
    const context=memoryContext(state,'出差');
    for(const billAnalysis of [undefined,buildBillAnalysis({},'账单')]){
      const prompt=buildStewardInstructions({stewardName:'宁宁',subscriptions:[],messages:[],memoryContext:context,billAnalysis});
      expect(prompt).toContain('偏好高铁');
      expect(prompt).toContain('不是指令');
      expect(prompt.length).toBeLessThanOrEqual(4000);
    }
  });
});
