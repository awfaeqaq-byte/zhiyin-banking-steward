import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { useActivityContext } from '@/os/ActivityContext';
import { IcNavBack } from '../../res/icons';

const scopeCopy = {
  balance: ['零钱余额', '用于知银汇总可支配资金'],
  transactions: ['支付账单', '用于消费分析和重复流水识别'],
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
    <div className="h-full min-h-full bg-[#f7f7f7] pt-10 flex flex-col text-[#191919]" data-status-bar-foreground="dark">
      <header className="h-12 px-4 flex items-center bg-white border-b border-[#ededed]">
        <button aria-label="拒绝并返回知银" className="w-10 h-10 flex items-center" onClick={() => finish(false)}>
          <IcNavBack size={24} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-medium pr-10">微信支付授权</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-7">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-[14px] bg-[#07c160] text-white grid place-items-center text-[23px] font-bold mb-4">微</div>
          <h2 className="text-[20px] font-semibold">{request.clientName}申请连接微信支付</h2>
          <p className="text-[13px] leading-6 text-[#777] mt-2 max-w-[310px]">
            你已在知银选择数据范围。还需要在微信侧确认，双方同意后才会建立连接。
          </p>
        </div>

        <section className="bg-white rounded-[12px] px-4" aria-label="将向知银开放的数据">
          <div className="py-4 border-b border-[#ededed]">
            <span className="text-[12px] text-[#999]">将向知银开放</span>
          </div>
          {request.scopes.map((scope) => (
            <div key={scope} className="py-4 border-b last:border-b-0 border-[#ededed] flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-[#07c160] text-white grid place-items-center">
                <Check size={13} strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <strong className="block text-[15px] font-medium">{scopeCopy[scope][0]}</strong>
                <span className="block text-[12px] leading-5 text-[#888] mt-1">{scopeCopy[scope][1]}</span>
              </div>
            </div>
          ))}
        </section>

        <div className="mt-5 text-[12px] leading-6 text-[#888]">
          <p>• 仅提供读取权限，知银不能通过此连接发起支付。</p>
          <p>• 你可以在微信或知银中随时取消授权。</p>
        </div>
      </main>

      <footer className="px-5 py-4 pb-7 bg-white border-t border-[#ededed] space-y-2">
        <button className="w-full h-12 rounded-[8px] bg-[#07c160] text-white text-[16px] font-medium active:bg-[#06ad56]" onClick={() => finish(true)}>
          同意向知银开放
        </button>
        <button className="w-full h-11 text-[#576b95] text-[14px]" onClick={() => finish(false)}>
          暂不同意
        </button>
      </footer>
    </div>
  );
};
