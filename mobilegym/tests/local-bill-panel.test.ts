// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {LocalBillReplayPanel} from '../sandbox/LocalBillReplayPanel';
import {getLocalBillReplayStatus,loadLocalWechatBillFixture,restoreLocalWechatLedger} from '../apps/Wechat/pay-ledger/localFixtureBootstrap';
vi.mock('../apps/Wechat/pay-ledger/localFixtureBootstrap',()=>({getLocalBillReplayStatus:vi.fn(async()=>({configured:true,enabled:false,hasBackup:true})),loadLocalWechatBillFixture:vi.fn(async()=>({importedRows:4,quarantinedRows:0})),restoreLocalWechatLedger:vi.fn(async()=>true)}));
let root:Root,host:HTMLDivElement;
async function mount(active:boolean){vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(React.createElement(LocalBillReplayPanel,{active})));}
async function click(label:string){const button=[...host.querySelectorAll('button')].find(item=>item.textContent===label);if(!button)throw Error(label);await act(async()=>button.click());}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();vi.clearAllMocks();vi.unstubAllGlobals();});
it('折叠时不读取配置，展开后只能手动确认才回放，恢复也需确认',async()=>{
 await mount(false);expect(getLocalBillReplayStatus).not.toHaveBeenCalled();
 await act(async()=>root.render(React.createElement(LocalBillReplayPanel,{active:true})));
 await click('回放本地账单');expect(loadLocalWechatBillFixture).not.toHaveBeenCalled();expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain('不会自动授权');
 await click('取消');expect(loadLocalWechatBillFixture).not.toHaveBeenCalled();
 await click('回放本地账单');await click('确认回放');expect(loadLocalWechatBillFixture).toHaveBeenCalledWith({confirmed:true});
 expect(host.querySelector('[role="status"]')?.textContent).toContain('4');
 await click('恢复原账单');expect(restoreLocalWechatLedger).not.toHaveBeenCalled();await click('确认恢复');expect(restoreLocalWechatLedger).toHaveBeenCalledWith({confirmed:true});
});
