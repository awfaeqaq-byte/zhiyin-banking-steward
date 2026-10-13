import {render,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StewardChatHome} from './steward-chat-home';
import type {ConversationEntry} from '../lib/message-flow';

const props={homePreview:true,seamless:true,stewardName:'宁宁',stewardImage:'/n.png',connections:{},disabledReminders:[],onToggleReminder:vi.fn(),onOpenSubscriptions:vi.fn(),onPrepareCancel:vi.fn()};
const old:ConversationEntry={id:'old',role:'assistant',content:'较早的回复。'};
const latest:ConversationEntry={id:'latest',role:'assistant',content:'最近一条回复。'};
const original=Element.prototype.scrollIntoView;
afterEach(()=>{if(original)Element.prototype.scrollIntoView=original;else delete (Element.prototype as Partial<Element>).scrollIntoView;});

it.each([{cache:[latest,old]},{cache:[old,latest]}])('首次服务端载入恢复权威尾消息，后续同一尾消息的同步不打断手动阅读 ($cache)',async({cache})=>{
 localStorage.setItem('zhiyin-steward-conversation-v1',JSON.stringify(cache));
 const scrolled:string[]=[];
 Element.prototype.scrollIntoView=vi.fn(function(this:Element){scrolled.push(this.textContent||'');});
 const view=render(<StewardChatHome {...props}/>);
 scrolled.length=0;
 view.rerender(<StewardChatHome {...props} conversationMessages={[old,latest]}/>);
 await waitFor(()=>expect(scrolled.at(-1)).toContain('最近一条回复。'));
 expect(scrolled.at(-1)).not.toContain('较早的回复。');
 const count=scrolled.length;
 view.rerender(<StewardChatHome {...props} conversationMessages={[{...old},{...latest}]}/>);
 expect(scrolled).toHaveLength(count);
});
