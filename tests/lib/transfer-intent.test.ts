import {it,expect} from 'vitest';
import {parseStewardReply,buildStewardInstructions} from '../../src/lib/steward-chat';
it('模型只能准备有效的已登记收款人转账，不执行扣款',()=>{
 expect(parseStewardReply('先核对[ZHIYIN_ACTION:PREPARE_TRANSFER|mom|200000]',[]).action).toEqual({type:'prepare_transfer',recipientId:'mom',amount:200000});
 for(const marker of ['mom|-1','unknown|100','mom|1.2'])expect(parseStewardReply(`[ZHIYIN_ACTION:PREPARE_TRANSFER|${marker}]`,[]).action).toBeUndefined();
 const instructions=buildStewardInstructions({stewardName:'宁宁',subscriptions:[],messages:[{role:'user',content:'给妈妈转2000'}]});
 expect(instructions).toContain('PREPARE_TRANSFER');expect(instructions).toContain('不能执行');
});
