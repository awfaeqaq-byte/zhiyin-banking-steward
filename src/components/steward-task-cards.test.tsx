import {render,screen,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi,afterEach} from 'vitest';
import {StewardChatHome} from './steward-chat-home';
import type {SceneFlow} from '../lib/scene-flow';
const base={seamless:true,homePreview:true,stewardName:'宁宁',stewardImage:'/n.png',connections:{},disabledReminders:[],onToggleReminder:vi.fn(),onOpenSubscriptions:vi.fn(),onPrepareCancel:vi.fn()};
const bank={revision:1,balance:4230000,limit:2000000,frozen:false,controls:{night:false,overseas:false,contactless:true},transactions:[]};
afterEach(()=>vi.restoreAllMocks());
async function say(text:string){await userEvent.type(screen.getByRole('textbox'),text);await userEvent.click(screen.getByRole('button',{name:'发送给宁宁'}));}
it('完整转账回复展示参数化核对组件，调整后的新回复替换旧执行入口',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify(bank)));
 const prepare=vi.fn(),reply=vi.fn().mockResolvedValueOnce({text:'准备好了。',action:{type:'prepare_transfer',recipientId:'mom',amount:200000}}).mockResolvedValueOnce({text:'新方案已准备。',action:{type:'prepare_transfer',recipientId:'mom',amount:300000}});
 render(<StewardChatHome {...base} reply={reply} onPrepareTransfer={prepare}/>);
 await say('给妈妈转2000元');const card=await screen.findByRole('region',{name:'转账方案'});expect(card).toHaveTextContent('¥2,000');expect(prepare).not.toHaveBeenCalled();
 await userEvent.click(within(card).getByRole('button',{name:'核对银行转账'}));expect(prepare).toHaveBeenCalledOnce();
 await say('把给妈妈的金额改成3000元');await waitFor(()=>expect(screen.getByRole('region',{name:'转账方案'})).toHaveTextContent('¥3,000'));
 expect(screen.getAllByRole('button',{name:'核对银行转账'})).toHaveLength(1);
});
it('明确订阅概览使用固定组件，复杂解释仍保留普通回复',async()=>{
 const reply=vi.fn().mockResolvedValue({text:'已整理。'});
 const source={provider:'alipay' as const,displayName:'支付宝',accountMasked:'测试',scopes:['autopay' as const],autopays:[{id:'video',title:'视频会员',merchant:'视频',amount:2500,cycle:'月' as const,nextChargeAt:Date.now()+86400000}],transactions:[],syncedAt:new Date().toISOString()};
 render(<StewardChatHome {...base} connections={{alipay:source}} reply={reply}/>);
 await say('查看我的订阅');const card=await screen.findByRole('region',{name:'订阅安排'});expect(card).toHaveTextContent('视频会员');
 await userEvent.click(within(card).getByRole('button',{name:'核对并取消视频会员'}));expect(base.onPrepareCancel).toHaveBeenCalledWith('alipay','video');
 await say('解释一下为什么这些服务权益不同');await waitFor(()=>expect(reply).toHaveBeenCalledTimes(2));expect(screen.getAllByText('已整理。').length).toBeGreaterThan(0);
});
it('跨场景回执就地呈现进度组件，只留最新状态的恢复入口',async()=>{
 const scene:SceneFlow={id:'scene',title:'生日蛋糕',workspaceIds:['cake'],links:[],records:[{kind:'food_order',id:'order',workspaceId:'cake',status:'ACCEPTED',label:'蛋糕订单'}],stage:'waiting_external',summary:'商家已接单',orders:[],checkedAt:Date.now(),fingerprint:'1',next:{kind:'food',id:'order',workspaceId:'cake'}};
 const resume=vi.fn();
 render(<StewardChatHome {...base} onResumeScene={resume} sceneFlows={[scene]} conversationMessages={[{id:'older',role:'assistant',content:'订单已付款',sceneId:'scene'},{id:'new',role:'assistant',content:'商家已接单',sceneId:'scene'}]}/>);
 const card=await screen.findByRole('region',{name:'跨场景进度'});expect(card).toHaveTextContent('商家已接单');expect(screen.getAllByRole('button',{name:'查看原订单'})).toHaveLength(1);
 await userEvent.click(within(card).getByRole('button',{name:'查看原订单'}));expect(resume).toHaveBeenCalledWith(scene.next);
});
