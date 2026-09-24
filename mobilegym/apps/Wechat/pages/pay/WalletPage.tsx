import React from 'react';
import { IcNavForward, IcWallet, IcCard, IcCoins } from '../../res/icons';
import { useWechatGestures } from '../../hooks/useWechatGestures';
import { useLocale } from '@/os/locale';
import { useWechatStore } from '../../state';

export const WalletPage: React.FC = () => {
  const { bindTap } = useWechatGestures();
  const locale = useLocale();
  const isEnglish = locale === 'en';
  const balanceCents = useWechatStore(state => state.wallet.balanceCents);
  const text = isEnglish
    ? {
        balance: 'Balance',
        wealthBalance: 'Wealth Balance',
        bankCard: 'Bank Cards',
        familyCard: 'Family Card',
        splitPay: 'Pay Score Credit',
        payScore: 'Payment Score',
        support: 'Support',
        identityInfo: 'Identity Info',
        paymentSettings: 'Payment Settings',
        yield: 'Yield 1.04%',
        viewLimit: 'View available limit',
      }
    : {
        balance: '零钱',
        wealthBalance: '零钱通',
        bankCard: '银行卡',
        familyCard: '亲属卡',
        splitPay: '分付',
        payScore: '支付分',
        support: '客服中心',
        identityInfo: '身份信息',
        paymentSettings: '支付设置',
        yield: '收益率1.04%',
        viewLimit: '查看可用额度',
      };

  const MenuItem = ({ icon: Icon, label, value, color, tapProps }: any) => {
    const content = (
      <>
        <div className="flex items-center gap-4">
            <Icon size={24} color={color} />
            <span className="text-[17px] text-black">{label}</span>
        </div>
        <div className="flex items-center gap-2">
            {value && <span className="text-sm text-gray-400">{value}</span>}
            {tapProps && <IcNavForward size={16} className="text-gray-300" />}
        </div>
      </>
    );
    const className = "w-full flex items-center justify-between px-6 py-5 bg-white border-b border-gray-50 text-left";
    if (tapProps) {
      return <button type="button" {...tapProps} className={`${className} active:bg-gray-50`}>{content}</button>;
    }
    return <div className={className} aria-disabled="true">{content}</div>;
  };

  return (
    <div className="bg-app-bg min-h-full flex flex-col">
      <div className="mt-2 bg-white">
          <MenuItem
            icon={IcCoins}
            label={text.balance}
            value={`¥${(balanceCents / 100).toFixed(2)}`}
            color="#FA9D3B"
            tapProps={bindTap<HTMLButtonElement>('wallet.balance.open')}
          />
          <MenuItem icon={IcCoins} label={text.wealthBalance} value={text.yield} color="#FA9D3B" />
      </div>

      <div className="mt-2 bg-white">
          <MenuItem icon={IcCard} label={text.bankCard} color="#576B95" />
          <MenuItem icon={IcCard} label={text.familyCard} color="#FA9D3B" />
      </div>

      <div className="mt-2 bg-white">
          <MenuItem icon={IcWallet} label={text.splitPay} value={text.viewLimit} color="#07C160" />
      </div>

      <div className="mt-2 bg-white">
          <MenuItem icon={IcWallet} label={text.payScore} color="#07C160" />
          <MenuItem icon={IcWallet} label={text.support} color="#07C160" />
      </div>

      <div className="flex-1"></div>

      <div className="pb-10 flex justify-center gap-6 text-[13px] text-[#576B95]">
          <span>{text.identityInfo}</span>
          <div className="w-[1px] h-3 bg-gray-300 self-center"></div>
          <span
            className="cursor-pointer"
            {...bindTap<HTMLSpanElement>('paymentSettings.open')}
          >{text.paymentSettings}</span>
      </div>
    </div>
  );
};
