import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {AuthorizationCenter} from '../../src/components/authorization-center';

it('集中授权页先说明风险，拒绝不写入，接受才保存指定卡片配置',async()=>{
 const user=userEvent.setup(),change=vi.fn(async()=>true);
 render(<AuthorizationCenter bank={{revision:0,balance:4230000,limit:2000000,frozen:false,controls:{overseas:false,contactless:true,night:true},transactions:[]}} bankBusy={false} bankError="" onBankChange={change} onRefresh={async()=>null} connections={{}} onConnect={async()=>{}} onDisconnect={async()=>{}} privacy={{notifications:true,analytics:false}} onPrivacyChange={vi.fn()}/>);
 const area=screen.getByRole('region',{name:'银行卡批准配置'});
 await user.click(within(area).getByRole('button',{name:'核对开启'}));
 expect(within(area).getByRole('group',{name:'待批准变更'})).toHaveTextContent('潜在风险');
 await user.click(within(area).getByRole('button',{name:'拒绝'}));expect(change).not.toHaveBeenCalled();
 await user.click(within(area).getByRole('button',{name:'核对开启'}));await user.click(within(area).getByRole('button',{name:'接受并保存'}));
 expect(change).toHaveBeenCalledWith({controls:{overseas:true,contactless:true,night:true}});
});
