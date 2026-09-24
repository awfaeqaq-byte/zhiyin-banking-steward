import React, { useMemo } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { useActivityContext } from '@/os/ActivityContext';
import { IcNavBack } from '../res/icons';

const scopeCopy = {
  balance: ['账户余额', '用于知银汇总可支配资金'],
  transactions: ['交易账单', '用于消费分析和重复流水识别'],
  autopay: ['自动扣费', '用于识别未来的固定支出'],
} as const;

export const DataAuthorizationPage: React.FC = () => {
  const { activityId } = useActivityContext();
  const request = useMemo(() => {
    const payload = window.__OS__?.getIntentPayload?.(activityId);
    const data = payload?.data;
    const scopes = Array.isArray(data?.scopes)
      ? data.scopes.filter(
          (scope): scope is keyof typeof scopeCopy => typeof scope === 'string' && scope in scopeCopy,
        )
      : [];
    return {
      clientName: data?.clientId === 'zhiyin' ? '知银' : '合作服务',
      scopes,
    };
  }, [activityId]);

  const finish = (approved: boolean) => window.__OS__?.setResult({
    resultCode: approved ? 'OK' : 'CANCELED',
    data: approved ? { scopes: request.scopes } : undefined,
  });

  return (
    <div className="min-h-full bg-[#f5f5f5] flex flex-col text-[#222]" data-status-bar-foreground="dark">
      <header className="pt-10 h-[88px] px-4 flex items-center bg-white border-b border-[#eeeeee]">
        <button aria-label="拒绝并返回知银" className="w-10 h-10 flex items-center" onClick={() => finish(false)}>
          <IcNavBack size={24} />
        </button>
        <h1 className="flex-1 text-center text-[18px] font-medium pr-10">服务授权</h1>
      </header>

      <main className="flex-1 px-4 py-5">
        <section className="bg-white rounded-[12px] px-5 pt-6 pb-4">
          <div className="flex items-center gap-3 pb-5 border-b border-[#eeeeee]">
            <div className="w-12 h-12 rounded-[10px] bg-[#1677ff] text-white grid place-items-center text-[21px] font-bold">支</div>
            <div>
              <h2 className="text-[18px] font-semibold">{request.clientName}申请连接支付宝</h2>
              <p className="text-[12px] text-[#888] mt-1">合作机构数据服务</p>
            </div>
          </div>

          <p className="text-[13px] leading-6 text-[#666] py-4">
            你已在知银确认使用范围。支付宝仍需单独核验并取得你的同意，才会通过合作接口提供以下数据：
          </p>
          <div aria-label="将向知银开放的数据">
            {request.scopes.map((scope) => (
              <div key={scope} className="py-3.5 border-t border-[#eeeeee] flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-[#e8f1ff] text-[#1677ff] grid place-items-center">
                  <Check size={13} strokeWidth={2.5} />
                </span>
                <div className="min-w-0">
                  <strong className="block text-[15px] font-medium">{scopeCopy[scope][0]}</strong>
                  <span className="block text-[12px] leading-5 text-[#888] mt-0.5">{scopeCopy[scope][1]}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex gap-2.5 mt-4 px-1 text-[#777]">
          <ShieldCheck className="shrink-0 mt-0.5 text-[#1677ff]" size={17} />
          <p className="text-[12px] leading-5">本次授权仅用于数据读取和分析，不允许知银发起支付、转账或修改你的支付宝账户。</p>
        </div>
      </main>

      <footer className="px-4 py-4 pb-7 bg-white border-t border-[#eeeeee] space-y-2">
        <button className="w-full h-12 rounded-[8px] bg-[#1677ff] text-white text-[16px] font-medium active:bg-[#0f69e8]" onClick={() => finish(true)}>
          同意向知银开放
        </button>
        <button className="w-full h-11 text-[#1677ff] text-[14px]" onClick={() => finish(false)}>
          暂不同意
        </button>
      </footer>
    </div>
  );
};
