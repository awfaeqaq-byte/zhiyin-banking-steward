import {it,expect,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {DataConnections} from './data-connections';
import {StewardChatHome} from './steward-chat-home';

it('聊天连接按钮只打开核对，仍需用户确认授权范围',async()=>{
  const open=vi.fn();const user=userEvent.setup();
  render(<StewardChatHome stewardName="宁宁" stewardImage="/n.png" connections={{}} disabledReminders={[]} onToggleReminder={vi.fn()} onOpenSubscriptions={vi.fn()} onPrepareCancel={vi.fn()} onOpenConnections={open} reply={async()=>({text:'先核对微信账单的只读授权。',action:{type:'open_connections',provider:'wechat_pay'}})}/>);
  await user.type(screen.getByRole('textbox'),'授权一下微信吧');await user.click(screen.getByRole('button',{name:'发送给宁宁'}));
  await user.click(await screen.findByRole('button',{name:'核对微信支付授权'}));
  expect(open).toHaveBeenCalledWith('wechat_pay');
});

it('从查账单进入微信授权时默认只选账单，不直接调用连接接口',()=>{
  const connect=vi.fn();
  render(<DataConnections connections={{}} onConnect={connect} onDisconnect={vi.fn()} initialProvider="wechat_pay"/>);
  expect(screen.getByRole('dialog')).toHaveTextContent('连接微信支付');
  expect(screen.getByRole('checkbox',{name:/读取交易账单/})).toBeChecked();
  expect(screen.getByRole('checkbox',{name:/读取账户余额/})).not.toBeChecked();
  expect(screen.getByRole('checkbox',{name:/读取自动扣费/})).not.toBeChecked();
  expect(connect).not.toHaveBeenCalled();
});
