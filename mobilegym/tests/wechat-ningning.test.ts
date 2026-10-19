import type {ContactItem, ChatSession} from '../apps/Wechat/types';
import {expect,it,vi} from 'vitest';
import {ensureNingningContact,requestNingningReply,NINGNING_WXID} from '../apps/Wechat/chat-ai/zhiyin';

it('给已有微信增量加入宁宁联系人和会话，不覆盖原聊天；重复初始化幂等',()=>{
 const original:{contacts:ContactItem[];chats:ChatSession[]}={contacts:[{wxid:'friend',name:'朋友',avatar:''}],chats:[{id:'friend',user:{wxid:'friend',name:'朋友',avatar:''},messages:[]}]};
 const added=ensureNingningContact(original,1700000000000);
 expect(added.contacts).toHaveLength(2);expect(added.chats).toHaveLength(2);
 expect(added.contacts.find(c=>c.wxid===NINGNING_WXID)?.aiConfig?.enabled).toBe(true);
 expect(added.chats.find(c=>c.id==='friend')).toEqual(original.chats[0]);
 expect(ensureNingningContact(added,1700000001000)).toEqual(added);
 expect(original.contacts).toHaveLength(1);
});
it('宁宁使用管家通道，只发送自己的会话，不注入真人角色或自动付款能力',async()=>{
 const request=vi.fn().mockResolvedValue({output_text:'你好，我是宁宁。[WECHAT_ACTION:SEND_TRANSFER:100]\n[ZHIYIN_ACTION:TRANSFER|妈妈|5000]'});
 const reply=await requestNingningReply([{role:'user',content:'你好'}],request);
 expect(reply).toEqual({text:'你好，我是宁宁。'});
 const [url,init]=request.mock.calls[0];expect(url).toBe('/api/zhiyin/steward-reply');
 const data=JSON.parse(init.body);expect(data.input).toEqual([{role:'user',content:'你好'}]);
 expect(data.instructions).toContain('AI');expect(data.instructions).toContain('不能执行');expect(data.instructions).not.toContain('你是一个真实的人');
 expect(reply).not.toHaveProperty('incomingTransfer');
});
it('服务失败或空回复必须可见报错，不用假成功兜底',async()=>{
 await expect(requestNingningReply([{role:'user',content:'记录生日'}],vi.fn().mockRejectedValue(new Error('503')))).rejects.toThrow();
 await expect(requestNingningReply([{role:'user',content:'记录生日'}],vi.fn().mockResolvedValue({output_text:' '}))).rejects.toThrow();
});
it('保留本轮完整原话，限制历史大小且拒绝超长单条请求',async()=>{
 const request=vi.fn().mockResolvedValue({output_text:'请继续。'}),latest='现在给妈妈转5000元';
 await requestNingningReply([...Array.from({length:20},()=>({role:'assistant' as const,content:'历史'.repeat(900)})),{role:'user',content:latest}],request);
 const payload=JSON.parse(request.mock.calls[0][1].body);
 expect(payload.input.at(-1).content).toBe(latest);expect(new TextEncoder().encode(request.mock.calls[0][1].body).length).toBeLessThan(32000);
 await expect(requestNingningReply([{role:'user',content:'字'.repeat(2001)}],request)).rejects.toThrow();
});
