import {describe,expect,it} from 'vitest';
import {applyFinancialFocusCommand,readFinancialFocus,writeFinancialFocus} from '../../src/lib/financial-focus';

describe('自然语言个人关注规则',()=>{
  it('创建、修改并取消阈值规则',()=>{
    const added=applyFinancialFocusCommand('以后打车支出超过1000元提醒我',[],1)!;
    expect(added.rule?.description).toBe('单月超过 ¥1,000 时提醒我');
    const updated=applyFinancialFocusCommand('以后打车超过800元告诉我',added.rules,2)!;
    expect(updated.kind).toBe('updated');
    expect(updated.rules).toHaveLength(1);
    expect(updated.rule?.description).toBe('单月超过 ¥800 时提醒我');
    const removed=applyFinancialFocusCommand('停止关注打车支出',updated.rules,3)!;
    expect(removed.kind).toBe('removed');
    expect(removed.rules).toEqual([]);
  });

  it('普通账单问题不会被误保存为长期关注',()=>{
    expect(applyFinancialFocusCommand('我这个月外卖花了多少钱？',[])).toBeNull();
  });

  it('只读取结构正确的本机规则',()=>{
    const storage=new Map<string,string>();
    const api={getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value)};
    const change=applyFinancialFocusCommand('以后发现重复扣费直接告诉我',[],1)!;
    writeFinancialFocus(change.rules,api);
    expect(readFinancialFocus(api)).toEqual(change.rules);
  });
});
