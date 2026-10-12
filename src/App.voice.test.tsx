import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('./components/steward-workspaces',()=>({StewardWorkspaces:({voiceEnabled,onPrepareTransfer}:{voiceEnabled:boolean;onPrepareTransfer:(intent:unknown)=>void})=><section><output>{voiceEnabled?'首页可收音':'首页停止收音'}</output><button onClick={()=>onPrepareTransfer({recipientId:'mother',amount:200000,note:'测试'})}>测试转账核对入口</button></section>}));
vi.mock('./components/smart-transfers',()=>({SmartTransfers:()=> <section role="dialog" aria-label="资金核对测试"/>}));
import App from './App';
afterEach(()=>vi.restoreAllMocks());
it('进入金融核对面板时，即使仍在首页也停止语音收音',async()=>{
 localStorage.setItem('zhiyin-mode','"native"');vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({version:1,revision:0,enabled:false,items:[],tasks:[]})));
 render(<App/>);expect(screen.getByText('首页可收音')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'测试转账核对入口'}));await screen.findByRole('dialog',{name:'资金核对测试'});await waitFor(()=>expect(screen.getByText('首页停止收音')).toBeInTheDocument());
});
