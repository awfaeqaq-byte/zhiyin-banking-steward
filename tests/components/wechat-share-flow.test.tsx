import {afterEach, expect, it, vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {StewardWorkspaces} from '../../src/components/steward-workspaces';
import {emptyWorkspaces,changeWorkspaces} from '../../src/lib/workspaces';
import {buildWechatShare} from '../../src/lib/wechat-message-share';
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
it('分享进入首页只展示材料；本人发送后接入原事项，不自动执行或反复发送',async()=>{
 let state=changeWorkspaces(emptyWorkspaces(),{type:'create',id:'birthday',kind:'general',title:'朋友生日',revision:0,requestId:'old'});
 const route=vi.fn(async(text:string)=>({parts:[{taskId:'birthday',kind:'general' as const,title:'朋友生日',text}]}));
 const reply=vi.fn(async()=>({text:'收到，先核对日期和预算。'}));const consumed=vi.fn();
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{if(init?.body)state=changeWorkspaces(state,JSON.parse(String(init.body)));return new Response(JSON.stringify(state));});
 const shared=buildWechatShare({id:'c',name:'朋友',kind:'direct'},[{id:'m',sender:'小林',text:'下周六生日',sentAt:1791770000000}],['m'],'预算500','share');
 render(<StewardWorkspaces stewardName="阿衡" stewardImage="/a.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} route={route} reply={reply} wechatShare={shared} onWechatShareDone={consumed}/>);
 await screen.findByText('下周六生日');expect(route).not.toHaveBeenCalled();expect(reply).not.toHaveBeenCalled();
 const input=screen.getByRole('textbox',{name:'和阿衡说点什么'});fireEvent.change(input,{target:{value:'帮我核对日期'}});
 await waitFor(()=>expect(screen.getByRole('button',{name:'发送给阿衡'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'发送给阿衡'}));
 await waitFor(()=>expect(state.items[0].messages).toHaveLength(2));expect(state.items).toHaveLength(1);expect(route.mock.calls[0][0]).toContain('本人要求：帮我核对日期');expect(state.items[0].messages[0].content).toContain('下周六生日');expect(consumed).toHaveBeenCalledWith('share');expect(reply).toHaveBeenCalledOnce();
});
