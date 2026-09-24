import React from 'react';
import { useWechatStore } from '../../state';
import { IcCoins } from '../../res/icons';

function money(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const WalletBalancePage: React.FC = () => {
  const wallet = useWechatStore(state => state.wallet);
  return (
    <div className="min-h-full bg-[#f5f5f5] overflow-y-auto pb-8">
      <section className="bg-white px-6 pt-10 pb-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-[#fff2df] flex items-center justify-center">
          <IcCoins size={34} color="#fa9d3b" />
        </div>
        <div className="mt-4 text-[15px] text-gray-500">我的零钱</div>
        <div className="mt-1 text-[40px] font-medium tracking-tight text-black">{money(wallet.balanceCents)}</div>
        <button type="button" disabled aria-describedby="wallet-demo-limit" className="mt-7 w-[210px] h-11 rounded-[6px] bg-[#9be6b8] text-white text-[16px] cursor-not-allowed">充值</button>
        <button type="button" disabled aria-describedby="wallet-demo-limit" className="block mx-auto mt-4 text-[15px] text-gray-400 cursor-not-allowed">提现</button>
        <p id="wallet-demo-limit" className="mt-4 text-[12px] text-gray-400">演示环境暂不支持充值与提现</p>
      </section>

      <section className="mt-3 bg-white">
        <div className="h-12 px-5 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-[16px] font-medium">零钱明细</h2>
          <span className="text-[13px] text-gray-400">共 {wallet.transfers.length} 笔</span>
        </div>
        {wallet.transfers.map(transfer => (
          <div key={transfer.id} className="px-5 py-4 flex items-center border-b border-gray-100 last:border-b-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${transfer.direction === 'incoming' ? 'bg-[#e8f8ef]' : 'bg-[#fff2df]'}`}>
              <span className={`text-[19px] ${transfer.direction === 'incoming' ? 'text-[#07a858]' : 'text-[#e88b24]'}`}>¥</span>
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <div className="text-[16px] text-black truncate">
                {transfer.direction === 'incoming' ? `${transfer.peerName}转账` : `转账给${transfer.peerName}`}
              </div>
              <div className="text-[12px] text-gray-400 mt-1">
                {transfer.status === 'received' ? '已收款' : transfer.status === 'refunded' ? '已退还' : '待收款'} · {transfer.createdAt.slice(0, 10)}
              </div>
            </div>
            <div className={`text-[17px] font-medium ${transfer.direction === 'incoming' ? 'text-[#07a858]' : 'text-black'}`}>
              {transfer.direction === 'incoming' ? '+' : '-'}{money(transfer.amountCents).slice(1)}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};
