import {changeExpenses,emptyExpenseState} from '../../src/lib/expense-notebook';
import type {VoiceTripReport} from '../../src/lib/voice-trip-report';
const now=Date.parse('2026-10-30T19:00:00+08:00');
const group={id:'trip',name:'海边四人行',revision:1,members:[{id:'self',name:'小叶',self:true},{id:'partner',name:'爱人'},{id:'wang',name:'小王'},{id:'li',name:'李娜'}]};
export function reportFixture():VoiceTripReport{
 let state=changeExpenses(emptyExpenseState(),{type:'create',bookId:'trip',title:'海边旅行',group,participants:group.members.map(m=>m.id),defaultPayerId:'self',revision:0,requestId:'create'},now);
 for(const [id,title,amount] of [['base','住宿等',237400],['dinner','晚饭',35000],['cake','生日蛋糕',20600]] as const){state=changeExpenses(state,{type:'add',bookId:'trip',entryId:id,entry:{title,amount,payerId:'self',fixed:id==='cake'?[{memberId:'self',amount}]:[],shares:id==='cake'?[]:group.members.map(m=>({memberId:m.id,weight:id==='dinner'&&['self','wang'].includes(m.id)?2:1}))},revision:state.revision,requestId:id},now);}
 return {kind:'trip_report',stage:'review',book:state.books[0],entryIds:['base','dinner'],subscriptionId:'video',asOf:now,source:{provider:'wechat_pay',displayName:'微信支付',accountMasked:'叶先生',scopes:['transactions','autopay'],syncedAt:new Date(now).toISOString(),transactions:[8,9,10].map(month=>({id:'charge-'+month,title:'星光视频会员',amount:-2900,category:'娱乐',kind:'payment' as const,occurredAt:`2026-${String(month).padStart(2,'0')}-28T10:00:00+08:00`})),autopays:[{id:'video',title:'星光视频会员',merchant:'星光视频',amount:2900,cycle:'月',nextChargeAt:Date.parse('2026-11-28T10:00:00+08:00')} ]}};
}
