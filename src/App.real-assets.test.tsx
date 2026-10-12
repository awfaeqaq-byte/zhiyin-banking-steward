import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import {emptyMemory} from './lib/steward-memory';
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
