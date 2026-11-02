import {describe,expect,it} from 'vitest';
import {parseCardIntent} from '../../src/lib/card-intent';
describe('卡片自然语言只准备待确认动作',()=>{
 it.each([
  ['把单笔限额调到5000元',{kind:'limit',yuan:5000}],
  ['我的卡丢了，帮我挂失',{kind:'freeze'}],
  ['恢复演示卡',{kind:'unfreeze'}],
  ['关闭无卡支付',{kind:'control',key:'contactless',enabled:false}],
  ['开启境外交易',{kind:'control',key:'overseas',enabled:true}],
  ['晚上不要让这张卡付款',{kind:'control',key:'night',enabled:true}],
  ['关闭夜间保护',{kind:'control',key:'night',enabled:false}],
  ['我想申请银行卡',{kind:'application'}],
 ])('%s', (input,expected)=>expect(parseCardIntent(input)).toEqual(expected));
});

it('识别明确卡片和尾号，未知卡与多卡不会落到默认卡，金额不会充当尾号',async()=>{
 const {cardIntentTarget}=await import('../../src/lib/card-intent');
 expect(cardIntentTarget('挂失尾号6216的卡')).toBe('living');
 expect(cardIntentTarget('把储蓄备用卡的限额调到2000')).toBe('reserve');
 expect(cardIntentTarget('挂失尾号1234的卡')).toBe('unknown');
 expect(cardIntentTarget('挂失银行卡1234')).toBe('unknown');
 expect(cardIntentTarget('冻结1234卡')).toBe('unknown');
 expect(cardIntentTarget('关闭尾号8888和尾号6216的境外交易')).toBe('ambiguous');
 expect(cardIntentTarget('把支付限额改成6216元')).toBeNull();
});
