import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ElderHome} from './elder-home';
const receipt={id:'incoming-mom-500',status:'received' as const,amount:50000,senderName:'孩子',senderLast4:'8888',recipientLast4:'6621',remark:'生活费',completedAt:Date.parse('2026-10-31T08:00:00+08:00')};
const props={stewardName:'宁宁',stewardImage:'/ningning.png',bank:null,bankError:'',hidden:false,onToggleHidden:vi.fn(),onAssets:vi.fn(),onTransfer:vi.fn(),onBills:vi.fn(),onSubscriptions:vi.fn(),onChat:vi.fn(),onHelp:vi.fn(),onRefresh:vi.fn()};
afterEach(()=>vi.restoreAllMocks());
it('长辈首页直接显示已到账的五百元生活费，不展示付款确认和无关功能',()=>{
 render(<ElderHome {...props} {...{incomingReceipt:receipt}}/>);
 expect(screen.getByRole('region',{name:'收款到账提醒'})).toBeVisible();expect(screen.getByText('+500.00')).toBeVisible();expect(screen.getByText('收到孩子的生活费')).toBeVisible();
 expect(screen.getByRole('button',{name:'查看这笔钱'})).toBeVisible();expect(screen.queryByRole('button',{name:'转账汇款'})).not.toBeInTheDocument();expect(screen.queryByText('正在读取账户金额…')).not.toBeInTheDocument();
});
it('大按钮在当前页展开收款卡、转账人、时间和备注，再次点击收起，不导航不转账',()=>{
 render(<ElderHome {...props} {...{incomingReceipt:receipt}}/>);fireEvent.click(screen.getByRole('button',{name:'查看这笔钱'}));
 expect(screen.getByRole('region',{name:'收款详情'})).toBeVisible();expect(screen.getByText('尾号 6621')).toBeVisible();expect(screen.getByText('10月31日 08:00')).toBeVisible();expect(screen.getByText('生活费')).toBeVisible();
 expect(props.onAssets).not.toHaveBeenCalled();expect(props.onTransfer).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'收起详情'}));expect(screen.queryByRole('region',{name:'收款详情'})).not.toBeInTheDocument();
});
it('播报只在本人点按钮后开始，结束后可以重听，不自动放音',async()=>{
 let finish:()=>void=()=>{};const read=vi.fn(()=>new Promise<void>(r=>{finish=r;}));render(<ElderHome {...props} {...{incomingReceipt:receipt,onReadIncoming:read}}/>);
 expect(read).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'听宁宁说一遍'}));expect(read).toHaveBeenCalledWith(receipt);
 expect(screen.getByRole('button',{name:'宁宁正在播报'})).toBeDisabled();finish();await screen.findByRole('button',{name:'听宁宁说一遍'});
});
it('播报失败保留文字和重听入口，不能影响到账记录',async()=>{
 render(<ElderHome {...props} {...{incomingReceipt:receipt,onReadIncoming:vi.fn(async()=>{throw Error('声音不可用');})}}/>);fireEvent.click(screen.getByRole('button',{name:'听宁宁说一遍'}));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('文字仍可查看'));expect(screen.getByText('+500.00')).toBeVisible();expect(screen.getByRole('button',{name:'听宁宁说一遍'})).toBeEnabled();
});
it.each([{...receipt,status:'pending'},{...receipt,amount:-1},{...receipt,recipientLast4:'bad'}])('无效或待执行记录不显示到账',invalid=>{
 render(<ElderHome {...props} {...{incomingReceipt:invalid as typeof receipt}}/>);expect(screen.queryByRole('region',{name:'收款到账提醒'})).not.toBeInTheDocument();
});
