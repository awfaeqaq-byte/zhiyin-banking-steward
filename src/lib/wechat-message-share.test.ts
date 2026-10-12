import {afterEach, describe, expect, it, vi} from 'vitest';
import {buildWechatShare, validWechatShare, sharePrompt, receiveWechatShare, readWechatInbox, finishWechatShare} from './wechat-message-share';
const chat={id:'chat-1',name:'朋友',kind:'direct' as const};
const messages=[{id:'a',sender:'小林',text:'下周六生日',sentAt:1791770000000},{id:'b',sender:'我',text:'给你准备蛋糕',sentAt:1791770001000}];
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
describe('微信所选消息作为任务材料',()=>{
 it('只复制所选消息，保留来源、时间并按时间排序，不带未选消息和额外资料',()=>{
  const result=buildWechatShare(chat,[...messages,{id:'private',sender:'朋友',text:'私密未选内容',sentAt:1}],['b','a'],'帮我准备，预算500','share-1');
  expect(result.messages.map(m=>m.id)).toEqual(['a','b']);
  expect(JSON.stringify(result)).not.toContain('私密');expect(result.instruction).toBe('帮我准备，预算500');expect(validWechatShare(result)).toBe(true);
 });
 it('拒绝空选、重复、越界、过长和伪造字段，不能静默截断材料',()=>{
  for(const ids of [[],['missing'],['a','a']])expect(()=>buildWechatShare(chat,messages,ids,'','s')).toThrow();
  expect(()=>buildWechatShare(chat,[{...messages[0],text:'字'.repeat(1001)}],['a'],'','s')).toThrow();
  const share=buildWechatShare(chat,messages,['a'],'','s');
  for(const value of [{...share,authorized:true},{...share,messages:[{...share.messages[0],sentAt:NaN}]},{...share,source:'alipay'}, {...share,messages:Array(6).fill(share.messages[0])}])expect(validWechatShare(value)).toBe(false);
 });
 it('导入只保存材料；重复投递及刷新不重复入队，完成或移除后也不重放',()=>{
  const share=buildWechatShare(chat,messages,['a'],'','s');
  expect(receiveWechatShare(share)).toBe(true);expect(receiveWechatShare(share)).toBe(false);expect(readWechatInbox()).toEqual([share]);
  finishWechatShare('s');expect(readWechatInbox()).toEqual([]);expect(receiveWechatShare(share)).toBe(false);
 });
 it('模型材料将原文与本人要求分开，标明北京时间与独立授权，不超过任务长度',()=>{
  const share=buildWechatShare(chat,messages,['a'],'只是解释一下','s');const prompt=sharePrompt(share,'先解释');
  expect(prompt).toContain('本人要求：先解释');expect(prompt).toContain('仅为引用材料');expect(prompt).toContain('2026-10-12');expect(prompt).toContain('授权');expect(prompt.length).toBeLessThanOrEqual(2000);
 });
 it('存储失败保留可重试状态，未成功保存不得当成已接收',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('full');});
  expect(()=>receiveWechatShare(buildWechatShare(chat,messages,['a'],'','s'))).toThrow();
 });
});
