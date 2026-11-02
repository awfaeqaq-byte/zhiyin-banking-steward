import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import {emptyMemory} from '../../src/lib/steward-memory';
import {bankCards,type BankCardId,type BankCardSummary,type BankSnapshot} from '../../src/lib/bank-transfer';
afterEach(()=>vi.restoreAllMocks());
it('资产页和经典首页都不加假余额；刷新事件读取同一份后端汇总',async()=>{
 let summary={cash:100000,wealth:200000,deposits:300000,total:600000,holdingCount:2,depositCount:1,availableCash:80000,reservedCash:20000};
 let revision=0;
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>new Response(JSON.stringify(String(url).includes('/bank')?{revision,balance:summary.cash,limit:2000000,frozen:false,controls:{night:true,overseas:false,contactless:true},transactions:[],assetSummary:summary,termDeposits:[]}:emptyMemory())));
 const user=userEvent.setup();render(<App/>);
 await screen.findByText('¥6,000.00');
 await user.click(within(screen.getByRole('navigation',{name:'主导航'})).getByRole('button',{name:'资产'}));
 const distribution=screen.getByRole('region',{name:'资产分布'});
 expect(within(distribution).getByText('¥1,000.00')).toBeInTheDocument();expect(within(distribution).getByText('¥2,000.00')).toBeInTheDocument();expect(within(distribution).getByText('¥3,000.00')).toBeInTheDocument();
 expect(screen.queryByText('¥184,240.32')).not.toBeInTheDocument();expect(screen.queryByText('¥60,000.00')).not.toBeInTheDocument();
 summary={...summary,cash:400000,deposits:0,total:600000,depositCount:0,availableCash:380000};revision++;
 window.dispatchEvent(new Event('zhiyin-bank-updated'));
 await waitFor(()=>expect(within(distribution).getByText('¥4,000.00')).toBeInTheDocument());
 expect(within(distribution).getByText('¥0.00')).toBeInTheDocument();
});
it('资产中的定存入口可办理，未确认时不会改变现金余额',async()=>{
 const summary={cash:4230000,wealth:0,deposits:0,total:4230000,holdingCount:0,depositCount:0,availableCash:4230000,reservedCash:0};
 const request=vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>new Response(JSON.stringify(String(url).includes('/bank')?{revision:0,balance:4230000,limit:2000000,frozen:false,controls:{night:true,overseas:false,contactless:true},transactions:[],assetSummary:summary,termDeposits:[]}:emptyMemory())));
 const user=userEvent.setup();render(<App/>);
 await user.click(within(screen.getByRole('navigation',{name:'主导航'})).getByRole('button',{name:'资产'}));
 await user.click(screen.getByRole('button',{name:/^定期存款/}));
 await user.click(screen.getByRole('button',{name:'查看定期存款'}));
 await screen.findByRole('region',{name:'定期存款办理'});
 expect(request.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(0);
});

it('后端读取失败时不装作已更新，资产页给出重试入口',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>String(url).includes('/bank')?new Response(JSON.stringify({error:'银行账本暂不可用'}),{status:500}):new Response(JSON.stringify(emptyMemory())));
 const user=userEvent.setup();render(<App/>);await user.click(within(screen.getByRole('navigation',{name:'主导航'})).getByRole('button',{name:'资产'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('资产暂未能更新');
 expect(screen.getByRole('button',{name:'重新读取资产'})).toBeInTheDocument();
 expect(screen.queryByText('¥0.00')).not.toBeInTheDocument();
});

it('资产汇总只加副卡余额，其他银行卡直达生活卡且返回资产页',async()=>{
 const summary={cash:100000,wealth:200000,deposits:300000,total:600000,holdingCount:2,depositCount:1,availableCash:100000,reservedCash:0};
 const balances:Record<BankCardId,number>={primary:100000,living:50000,reserve:25000};
 const settings={revision:0,limit:2000000,frozen:false,controls:{night:true,overseas:false,contactless:true}};
 const cards:BankCardSummary[]=bankCards.map(card=>({...card,...settings,balance:balances[card.id]}));
 const accounts:Record<BankCardId,BankSnapshot>={
  primary:{...settings,cardId:'primary',balance:100000,transactions:[],assetSummary:summary,cards},
  living:{...settings,cardId:'living',balance:50000,transactions:[]},
  reserve:{...settings,cardId:'reserve',balance:25000,transactions:[]},
 };
 const request=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
  if(options?.method==='POST')throw new Error('查看资产和银行卡不应执行写入');
  if(!String(url).includes('/bank'))return new Response(JSON.stringify(emptyMemory()));
  const parsed=new URL(String(url),'http://localhost');
  if(parsed.searchParams.get('view')==='cards')return new Response(JSON.stringify(cards));
  const cardId=(parsed.searchParams.get('cardId')??'primary') as BankCardId;
  if(!accounts[cardId])return new Response(JSON.stringify({error:'卡片不存在'}),{status:400});
  return new Response(JSON.stringify(accounts[cardId]));
 });
 const user=userEvent.setup();render(<App/>);
 expect(await screen.findByText('¥6,750.00')).toBeInTheDocument();
 await user.click(within(screen.getByRole('navigation',{name:'主导航'})).getByRole('button',{name:'资产'}));
 const overview=screen.getByRole('region',{name:'账户资产概览'});
 expect(within(overview).getByText('¥6,750.00')).toBeInTheDocument();
 expect(within(overview).queryByText('¥7,750.00')).not.toBeInTheDocument();
 const distribution=screen.getByRole('region',{name:'资产分布'});
 expect(within(distribution).getByText('¥1,000.00')).toBeInTheDocument();
 const otherCards=within(distribution).getByRole('button',{name:/^其他银行卡/});
 expect(otherCards).toHaveTextContent('¥750.00');
 await user.click(otherCards);
 await user.click(screen.getByRole('button',{name:'查看其他银行卡'}));
 expect(await screen.findByRole('button',{name:'生活备用卡，尾号 6216，正常'})).toHaveAttribute('aria-pressed','true');
 expect(await within(screen.getByLabelText('尾号 6216 的卡片详情')).findByText('¥500.00')).toBeInTheDocument();
 expect(request.mock.calls.some(([url])=>String(url).endsWith('/bank?cardId=living'))).toBe(true);
 await user.click(screen.getByRole('button',{name:'返回'}));
 expect(screen.getByRole('heading',{name:'我的资产'})).toBeInTheDocument();
 expect(screen.getByRole('region',{name:'资产分布'})).toBeInTheDocument();
 expect(request.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(0);
});


it('关闭续费提醒不移除资产页的实际扣费安排，续费金额按分正确展示',async()=>{
 const bridge=await import('../../src/lib/phone-bridge');
 const currentTime=Date.now();
 const source:import('../../src/lib/financial-connections').ConnectedFinancialSource={
  provider:'wechat_pay',displayName:'微信支付',accountMasked:'叶先生',scopes:['autopay'],transactions:[],
  syncedAt:new Date(currentTime).toISOString(),
  autopays:[{id:'wx-music-muted',title:'音乐会员自动续费',merchant:'网易云音乐',amount:1800,cycle:'月',nextChargeAt:currentTime+86400000}],
 };
 localStorage.setItem('zhiyin-connections',JSON.stringify({wechat_pay:source}));
 localStorage.setItem('zhiyin-disabled-subscription-reminders',JSON.stringify(['wechat_pay:wx-music-muted']));
 const refresh=vi.spyOn(bridge,'refreshFinancialSource').mockResolvedValue({status:'granted',source});
 const summary={cash:4230000,wealth:0,deposits:0,total:4230000,holdingCount:0,depositCount:0,availableCash:4230000,reservedCash:0};
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>new Response(JSON.stringify(String(url).includes('/bank')?{
  revision:0,balance:summary.cash,limit:2000000,frozen:false,controls:{night:true,overseas:false,contactless:true},
  transactions:[],assetSummary:summary,termDeposits:[],asOf:currentTime,
 }:emptyMemory())));
 const user=userEvent.setup();render(<App/>);
 await waitFor(()=>expect(refresh).toHaveBeenCalledWith('wechat_pay',['autopay']));
 await user.click(within(screen.getByRole('navigation',{name:'主导航'})).getByRole('button',{name:'资产'}));
 const schedule=await screen.findByRole('region',{name:'近期资金安排'});
 const renewal=within(schedule).getByRole('button',{name:/音乐会员自动续费/});
 expect(renewal).toHaveTextContent('¥18.00');
 expect(renewal).not.toHaveTextContent('¥1,800.00');
 expect(within(schedule).queryByText('暂时没有待处理的资金安排')).not.toBeInTheDocument();
 expect(JSON.parse(localStorage.getItem('zhiyin-disabled-subscription-reminders')!)).toEqual(['wechat_pay:wx-music-muted']);
});