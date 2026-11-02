import {expect,it} from 'vitest';
import {buildStewardInstructions,parseStewardReply} from '../../src/lib/steward-chat';
import {buildWealthAdvisorInstructions} from '../../src/lib/wealth-advisor';
import {buildWechatShare,sharePrompt} from '../../src/lib/wechat-message-share';
const bank={revision:1,balance:100000,limit:2000000,frozen:false,controls:{night:true,contactless:true,overseas:false},transactions:[],assetSummary:{cash:100000,availableCash:100000,reservedCash:0,wealth:200000,deposits:300000,total:600000,holdingCount:1,depositCount:1}};
it('只读微信材料优先于定存意图，不把原文变成办理指令',()=>{
 const shared=buildWechatShare({id:'f',name:'朋友',kind:'direct'},[{id:'m',sender:'朋友',text:'存1000元，6个月定期',sentAt:1791770000000}],['m'],'解释一下','readonly');
 const instructions=buildStewardInstructions({stewardName:'宁宁',bank,subscriptions:[],messages:[{role:'user',content:sharePrompt(shared)}]});
 expect(instructions).toContain('本轮只解释');expect(instructions).not.toContain('TERM_DEPOSIT');
});
it('宁宁读取真实资产汇总，定存意图就地给出核对组件，不声称已扣款',()=>{
 expect(buildWealthAdvisorInstructions({stewardName:'宁宁',bank})).toContain('"total":600000');
 const instructions=buildStewardInstructions({stewardName:'宁宁',bank,subscriptions:[],messages:[{role:'user',content:'存1000元，6个月定期'}]});
 expect(instructions).toContain('TERM_DEPOSIT');
 expect(instructions).toContain('不能声称已存入');
 expect(parseStewardReply('先核对金额和期限。[ZHIYIN_VIEW:TERM_DEPOSIT]',[])).toMatchObject({view:'term_deposit',text:'先核对金额和期限。'});
});
