import {expect,it} from 'vitest';
import {conversationTranscript} from './conversation-transcript';
import type {ConversationEntry,MessageRun} from './message-flow';
const error=(id:string):ConversationEntry=>({id,role:'assistant',messageId:'one',content:'这条消息未完成：模型服务请求失败（HTTP 503）。',retryRunId:'one'});
const messages:ConversationEntry[]=[{id:'user-one',role:'user',content:'转2000',messageId:'one'},error('old'),error('new'),{id:'user-two',role:'user',content:'聊生日',messageId:'two'},{id:'answer-two',role:'assistant',content:'生日回复',messageId:'two'}];
it('同一轮重试只展示最近一次失败，失败信息仍属于原来的提问',()=>{
 const view=conversationTranscript(messages,[{id:'one',status:'failed'} as MessageRun]);
 expect(view.map(m=>m.id)).toEqual(['user-one','new','user-two','answer-two']);
});
it('重试后进入追问或完成，旧失败不再挤占对话；不同轮失败不合并',()=>{
 const question:ConversationEntry={id:'question-one',role:'assistant',messageId:'one',content:'现在转还是预约？'};
 const view=conversationTranscript([...messages,question],[{id:'one',status:'waiting_user'} as MessageRun]);
 expect(view.map(m=>m.id)).toEqual(['user-one','question-one','user-two','answer-two']);
 expect(conversationTranscript([...messages,{...error('other'),messageId:'three'}],[]).filter(m=>m.content.includes('503'))).toHaveLength(2);
});
it('没有来源ID的历史消息保持原序，不靠文字相似度猜测或删除',()=>{
 const history:ConversationEntry[]=[{id:'one',role:'user',content:'你好'},{id:'two',role:'user',content:'你好'}];
 expect(conversationTranscript(history,[])).toEqual(history);
});
