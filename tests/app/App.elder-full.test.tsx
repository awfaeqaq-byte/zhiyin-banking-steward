import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import App from '../../src/App';
import {elderAppServer} from '../helpers/elder-app-server';
import {localTaskTime} from '../../src/lib/task-calendar';
import * as phone from '../../src/lib/phone-bridge';
import type {ConnectedFinancialSource} from '../../src/lib/financial-connections';

let server: ReturnType<typeof elderAppServer>;
beforeEach(() => {
  localStorage.setItem('zhiyin-elder-mode', 'true');
  localStorage.setItem('zhiyin-mode', '"classic"');
  server = elderAppServer();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  server.dispose();
  expect(server.unexpected).toEqual([]);
});
type User = ReturnType<typeof userEvent.setup>;
async function service(user: User, name: RegExp) {
  await user.click(within(screen.getByRole('navigation', {name:'主导航'})).getByRole('button', {name:'更多服务'}));
  await user.click(screen.getByRole('button', {name}));
}
async function transfer(user: User, amount: string) {
  await user.click(screen.getByRole('button', {name:'转账汇款'}));
  await user.selectOptions(screen.getByLabelText('从哪个账户转出'), 'demo-8888');
  await user.type(screen.getByLabelText('转账金额（元）'), amount);
}

describe('长辈版完整业务入口与实际状态变更', () => {
  it.each(['资产','银行卡'] as const)('从%s继续问管家时展开长辈对话，保留草稿且不自动发送',async entry=>{
    const user=userEvent.setup();render(<App/>);
    if(entry==='资产'){
      await user.click(screen.getByRole('button',{name:'查余额'}));
      await user.click(screen.getByRole('button',{name:/和宁宁一起看资产/}));
    }else{
      await service(user,/^银行卡与安全/);
      await user.click(await screen.findByRole('button',{name:'让管家帮我核对这张卡'}));
    }
    const composer=screen.getByRole('textbox',{name:'和宁宁说点什么'});
    expect(composer).toBeVisible();expect(composer).not.toHaveValue('');
    expect(screen.getByRole('button',{name:'返回长辈版首页'})).toBeVisible();
    expect(server.commands.some(command=>command.path==='/api/zhiyin/messages'&&command.body.type==='submit')).toBe(false);
  });
  it('定存从资产入口核对、存入、提前支取，返回资产同步余额', async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole('button', {name:'查余额'}));
    await user.click(screen.getByRole('button', {name:/^定期存款/}));
    await user.click(screen.getByRole('button',{name:'查看定期存款'}));
    await user.type(screen.getByLabelText('存入金额（元）'), '1000');
    await user.click(screen.getByRole('radio', {name:/6个月/}));
    await user.click(screen.getByRole('button', {name:'核对定存方案'}));
    await screen.findByRole('button', {name:'确认存入'});
    expect(server.bank.get().balance).toBe(4230000);
    await user.click(screen.getByRole('button', {name:'确认存入'}));
    await screen.findByText(/存入已完成/);
    expect(server.bank.get().assetSummary).toMatchObject({cash:4130000, deposits:100000, total:4230000});
    await user.click(screen.getByRole('button', {name:'支取这笔定存'}));
    await screen.findByRole('button', {name:'确认支取'});
    expect(server.bank.get().balance).toBe(4130000);
    await user.click(screen.getByRole('button', {name:'确认支取'}));
    await waitFor(() => expect(server.bank.get().assetSummary?.deposits).toBe(0));
    expect(server.bank.get().balance).toBe(4230000);
    await user.click(screen.getByRole('button', {name:'返回'}));
    expect(screen.getByRole('region', {name:'资产分布'})).toHaveTextContent('42,300');
  });

  it('即时转账可返回修改；确认后只有一笔回执，普通版继续读取同一账本', async () => {
    const user = userEvent.setup(); render(<App/>);
    await transfer(user, '120.50');
    await user.click(screen.getByRole('button', {name:'核对即时转账'}));
    await user.click(await screen.findByRole('button', {name:'返回修改'}));
    expect(server.bank.get().transactions).toHaveLength(0);
    await user.clear(screen.getByLabelText('转账金额（元）'));
    await user.type(screen.getByLabelText('转账金额（元）'), '150');
    await user.click(screen.getByRole('button', {name:'核对即时转账'}));
    await user.click(await screen.findByRole('button', {name:'确认并立即转账（沙箱）'}));
    await screen.findByText('转账已完成');
    expect(server.bank.get().transactions).toEqual([expect.objectContaining({amount:15000, recipientId:'mom'})]);
    expect(server.bank.get().balance).toBe(4215000);
    await user.click(screen.getByRole('button', {name:'记录'}));
    expect(await within(screen.getByRole('region', {name:'转账与收款记录'})).findByText('妈妈 · ¥150')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name:'关闭'}));
    await user.click(screen.getByRole('button', {name:'切换到普通版'}));
    expect(screen.getByRole('heading', {name:'今天想办理什么？'})).toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', {name:'主导航'})).getByRole('button', {name:'卡片'}));
    expect(await screen.findByRole('region',{name:'尾号 8888 的余额与操作'})).toHaveTextContent('42,150');
    expect(server.bank.get().balance).toBe(4215000);
    expect(server.commands.filter(c => c.body.type === 'confirm')).toHaveLength(1);
  });

  it('预约转账核对和建立均不扣款，撤销需确认并同步记录', async () => {
    const user = userEvent.setup(); render(<App/>);
    await transfer(user, '200');
    await user.selectOptions(screen.getByLabelText('执行方式'), 'scheduled');
    fireEvent.change(screen.getByLabelText('预约时间（设备当地时间）'), {target:{value:localTaskTime(Date.now()+86400000)}});
    await user.click(screen.getByRole('button', {name:'核对预约转账'}));
    await user.click(await screen.findByRole('button', {name:'确认预约转账（沙箱）'}));
    await screen.findByText('预约已建立');
    expect(server.bank.get().balance).toBe(4230000);
    expect(server.bank.get().schedules).toHaveLength(1);
    await user.click(screen.getByRole('button', {name:'记录'}));
    await user.click(await screen.findByRole('button', {name:'撤销预约'}));
    await user.click(screen.getByRole('button', {name:'暂不操作'}));
    expect(server.bank.get().schedules?.[0].status).toBe('pending');
    await user.click(screen.getByRole('button', {name:'撤销预约'}));
    await user.click(screen.getByRole('button', {name:'确认操作'}));
    await screen.findByText('已撤销');
    expect(server.bank.get().schedules?.[0].status).toBe('cancelled');
    expect(server.bank.get().transactions).toHaveLength(0);
  });

  it('AA核对不收款；确认发起、对方付款、结束余款各自更新真实沙箱状态', async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole('button', {name:'转账汇款'}));
    await user.click(screen.getByRole('button', {name:'AA收款'}));
    await user.type(screen.getByLabelText('费用总额（元）'), '90');
    await user.click(screen.getByRole('checkbox', {name:/妈妈/}));
    await user.click(screen.getByRole('checkbox', {name:/爸爸/}));
    await user.click(screen.getByRole('button', {name:'核对AA分摊'}));
    expect(server.bank.get().aaRequests).toHaveLength(0);
    await user.click(screen.getByRole('button', {name:'确认发起AA收款'}));
    await screen.findByText('0/2 人已付');
    expect(server.bank.get().balance).toBe(4230000);
    await user.click(screen.getByText('测试对方付款'));
    await user.click(screen.getByRole('button', {name:'妈妈付款'}));
    await user.click(screen.getByRole('button', {name:'确认操作'}));
    await screen.findByText('1/2 人已付');
    expect(server.bank.get().balance).toBe(4233000);
    expect(server.bank.get().collections).toHaveLength(1);
    await user.click(screen.getByRole('button', {name:'结束收款'}));
    await user.click(screen.getByRole('button', {name:'确认操作'}));
    await screen.findByText('已结束');
    expect(server.bank.get().aaRequests?.[0].status).toBe('cancelled');
    expect(server.bank.get().balance).toBe(4233000);
  });

  it('银行卡限额、权限、挂失与恢复均经用户确认保存', async () => {
    const user = userEvent.setup(); render(<App/>);
    await service(user, /^银行卡与安全/);
    await user.click(await screen.findByRole('button',{name:/^单笔支付限额/}));
    await user.clear(screen.getByLabelText('新的单笔限额（元）'));
    await user.type(screen.getByLabelText('新的单笔限额（元）'), '500');
    expect(server.bank.get().limit).toBe(2000000);
    await user.click(screen.getByRole('button', {name:'确认修改尾号 8888'}));
    await waitFor(() => expect(server.bank.get().limit).toBe(50000));
    await user.click(screen.getByRole('switch', {name:'尾号 8888 境外交易'}));
    await user.click(screen.getByRole('button', {name:'返回核对'}));
    expect(server.bank.get().controls.overseas).toBe(false);
    await user.click(screen.getByRole('switch', {name:'尾号 8888 境外交易'}));
    await user.click(screen.getByRole('button', {name:'确认修改尾号 8888'}));
    await waitFor(() => expect(server.bank.get().controls.overseas).toBe(true));
    await user.click(screen.getByRole('button', {name:'挂失这张卡'}));
    expect(server.bank.get().frozen).toBe(false);
    await user.click(screen.getByRole('button', {name:'确认挂失尾号 8888'}));
    await waitFor(() => expect(server.bank.get().frozen).toBe(true));
    await user.click(screen.getByRole('button', {name:'恢复这张卡'}));
    await user.click(screen.getByRole('button', {name:'确认恢复尾号 8888'}));
    await waitFor(() => expect(server.bank.get().frozen).toBe(false));
    expect(server.bank.get().balance).toBe(4230000);
  });

  it('任务日历可新增、修改、完成和确认取消，均存入同一任务服务', async () => {
    const user = userEvent.setup(); render(<App/>);
    await service(user, /^日程/);
    await waitFor(() => expect(screen.getByRole('button', {name:'添加提醒'})).toBeEnabled());
    await user.click(screen.getByRole('button', {name:'添加提醒'}));
    await user.type(screen.getByLabelText('要做什么'), '核对本月账单');
    await user.click(screen.getByRole('button', {name:'确认保存提醒'}));
    await user.click(await screen.findByRole('button', {name:/核对本月账单.*待处理/}));
    await user.click(screen.getByRole('button', {name:'修改'}));
    await user.clear(screen.getByLabelText('要做什么'));
    await user.type(screen.getByLabelText('要做什么'), '核对日常开支');
    await user.click(screen.getByRole('button', {name:'确认保存提醒'}));
    await user.click(await screen.findByRole('button', {name:/核对日常开支.*待处理/}));
    await user.click(screen.getByRole('button', {name:'标记完成'}));
    await waitFor(() => expect(server.tasks.tasks[0]).toMatchObject({title:'核对日常开支',status:'completed'}));
    await user.click(screen.getByRole('button', {name:'添加提醒'}));
    await user.type(screen.getByLabelText('要做什么'), '待取消安排');
    await user.click(screen.getByRole('button', {name:'确认保存提醒'}));
    await user.click(await screen.findByRole('button', {name:/待取消安排.*待处理/}));
    await user.click(screen.getByRole('button', {name:'取消提醒'}));
    expect(server.tasks.tasks[1].status).toBe('pending');
    await user.click(screen.getByRole('button', {name:'确认取消'}));
    await waitFor(() => expect(server.tasks.tasks[1].status).toBe('cancelled'));
  });

  it('记忆可授权保存与纠正，切换管家和普通版保留偏好', async () => {
    const user = userEvent.setup(); render(<App/>);
    await service(user, /^管理记忆/);
    await user.click(screen.getByRole('switch', {name:'允许记住我的偏好'}));
    await waitFor(() => expect(screen.getByLabelText('记忆内容')).toBeEnabled());
    await user.type(screen.getByLabelText('记忆内容'), '出门优先坐公交');
    await user.click(screen.getByRole('button', {name:'添加记忆'}));
    await user.click(await screen.findByRole('button', {name:'修改记忆：出门优先坐公交'}));
    await user.clear(screen.getByLabelText('记忆内容'));
    await user.type(screen.getByLabelText('记忆内容'), '出门优先坐地铁');
    await user.click(screen.getByRole('button', {name:'保存修改'}));
    await waitFor(() => expect(server.memory.items[0].text).toBe('出门优先坐地铁'));
    await user.click(screen.getByRole('button', {name:'关闭'}));
    await user.click(screen.getByRole('button', {name:'切换管家'}));
    await user.click(screen.getByRole('button', {name:'选择阿衡'}));
    expect(localStorage.getItem('zhiyin-steward')).toBe('"aheng"');
    await user.click(screen.getByRole('button', {name:'切换到普通版'}));
    expect(server.memory.items).toHaveLength(1);
    expect(screen.getByRole('button', {name:'出门优先坐地铁'})).toBeInTheDocument();
  });

  it('资金规划风险测评、申购与赎回完整闭环，核对步骤不动资金', async () => {
    const user = userEvent.setup(); render(<App/>);
    await service(user, /^资金规划/);
    await user.click(screen.getByRole('button',{name:/^理财与基金/}));
    await user.click(await screen.findByRole('button', {name:'开始风险测评'}));
    const answers = ['没有经验','不能接受本金亏损','一年内需要','随时可能用钱','不稳定'];
    for (let i=0;i<answers.length;i++) {
      await user.click(screen.getByRole('button', {name:answers[i]}));
      await user.click(screen.getByRole('button', {name:i===4?'保存风险测评':'下一题'}));
    }
    await screen.findByText(/当前风险等级：谨慎型/);
    await user.click(screen.getByRole('button',{name:'展开和宁宁的财富对话'}));
    await user.type(screen.getByRole('textbox',{name:'和宁宁聊财富计划'}),'计划投入30000元，持有12个月');
    await user.click(within(screen.getByRole('region',{name:'和宁宁聊财富计划'})).getByRole('button',{name:'发送给宁宁'}));
    await screen.findByText(/可以结合这个投入金额/);
    await user.click(within(screen.getByRole('group', {name:'候选产品'})).getByRole('button', {name:/^灵活现金管理/}));
    await user.click(screen.getByRole('button', {name:'生成待确认申购方案'}));
    await screen.findByRole('dialog', {name:'请核对并确认申购'});
    expect(server.bank.get().balance).toBe(4230000);
    await user.click(screen.getByRole('button', {name:'确认申购'}));
    await screen.findByText(/申购已完成/);
    expect(server.wealth.get().holdings).toHaveLength(1);
    expect(server.bank.get().balance).toBe(1230000);
    await user.click(screen.getByRole('button', {name:'赎回持仓'}));
    await user.click(await screen.findByRole('button', {name:'确认赎回'}));
    await screen.findByText(/赎回已完成/);
    expect(server.bank.get().balance).toBe(4230000);
  });

  it('生活筹备可手动编辑、保存、预留预算并确认取消释放余款', async () => {
    const user = userEvent.setup(); render(<App/>);
    await service(user, /^生活筹备/);
    await user.click(await screen.findByRole('button', {name:'准备一个生日'}));
    await user.click(screen.getByText('手动编辑'));
    await user.type(screen.getByLabelText('为谁准备'), '家人');
    fireEvent.change(screen.getByLabelText('开始筹备（北京时间）'), {target:{value:localTaskTime(Date.now()+86400000)}});
    fireEvent.change(screen.getByLabelText('希望送达（北京时间）'), {target:{value:localTaskTime(Date.now()+3*86400000)}});
    await user.type(screen.getByLabelText('收货地址'), '测试地址');
    await user.type(screen.getByLabelText('联系人与电话'), '测试家人 13800000000');
    await user.click(screen.getByRole('button', {name:'保存筹备方案'}));
    await screen.findByText('尚未预留资金');
    expect(server.bank.get().assetSummary?.reservedCash).toBe(0);
    await user.click(screen.getByRole('button', {name:'预留这笔预算'}));
    expect(server.bank.get().assetSummary?.reservedCash).toBe(0);
    await user.click(screen.getByRole('button', {name:'确认预留 ¥1,000'}));
    await screen.findByText('预算已预留');
    expect(server.bank.get().assetSummary).toMatchObject({cash:4230000,availableCash:4130000,reservedCash:100000});
    await user.click(screen.getByRole('button', {name:'取消安排'}));
    await user.click(screen.getByRole('button', {name:'确认取消并释放余款'}));
    await screen.findByText('未用预算已释放');
    expect(server.bank.get().assetSummary?.reservedCash).toBe(0);
    expect(server.bank.get().occasions?.[0].status).toBe('cancelled');
  });

  it('续费提醒设置持久化，订阅取消在二次确认后才交给支付平台', async () => {
    const source: ConnectedFinancialSource = {provider:'wechat_pay',displayName:'微信支付',accountMasked:'测试账户',syncedAt:new Date().toISOString(),scopes:['autopay'],transactions:[],autopays:[{id:'music',title:'测试音乐会员',amount:1500,cycle:'月',nextChargeAt:Date.now()+3*86400000}]};
    localStorage.setItem('zhiyin-connections', JSON.stringify({wechat_pay:source}));
    vi.spyOn(phone,'refreshFinancialSource').mockImplementation(async () => ({status:'granted',source}));
    const cancel = vi.spyOn(phone,'cancelFinancialAutopay').mockImplementation(async () => {
      source.cancelledAutopayIds=['music'];
      return {status:'cancelled',provider:'wechat_pay',subscriptionId:'music'};
    });
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole('button', {name:'扣费提醒'}));
    await user.click(await screen.findByRole('switch', {name:'测试音乐会员续费提醒'}));
    expect(JSON.parse(localStorage.getItem('zhiyin-disabled-subscription-reminders')!)).toEqual(['wechat_pay:music']);
    await user.click(screen.getByRole('button', {name:'取消测试音乐会员自动续费'}));
    expect(cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name:'确认取消自动续费'}));
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(cancel).toHaveBeenCalledWith('wechat_pay','music');
    await waitFor(() => expect(screen.queryByRole('button', {name:'取消测试音乐会员自动续费'})).not.toBeInTheDocument());
    expect(server.bank.get().balance).toBe(4230000);
  });
});
