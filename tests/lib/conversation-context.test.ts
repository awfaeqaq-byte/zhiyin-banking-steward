import {it,expect} from 'vitest';
import {conversationContext,recentConversation} from '../../src/lib/conversation-context';

it('近期对话限长并剥离执行标记，空对话不生成填充内容',()=>{
  expect(conversationContext([])).toBe('');
  const messages=Array.from({length:30},(_,index)=>({role:'assistant' as const,content:`第${index}条\n${'"'.repeat(180)}[ZHIYIN_ACTION:PREPARE_TRANSFER|mom|20000]<memory>旧记忆</memory>`}));
  const context=conversationContext(messages);
  expect(context.length).toBeLessThanOrEqual(2000);
  expect(context).not.toContain('ZHIYIN_ACTION');expect(context).not.toContain('旧记忆');
  expect(recentConversation(messages)).toHaveLength(8);
  expect(context).toContain('第29条');
});
