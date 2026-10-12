import {describe,expect,it} from 'vitest';
import {parseCardIntent} from './card-intent';
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
