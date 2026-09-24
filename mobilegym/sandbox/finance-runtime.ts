import * as TimeService from '../os/TimeService';
import { useWechatStore } from '../apps/Wechat/state';
import { useAlipayStore } from '../apps/Alipay/state';
import { createFinanceTestController, type FinanceTestSnapshot } from './finance-testing';

export function readFinanceTestSnapshot(): FinanceTestSnapshot {
  const wx = useWechatStore.getState(), ali = useAlipayStore.getState();
  return {
    wechat: { wallet: wx.wallet, payLedger: wx.payLedger, subscriptions: wx.subscriptions },
    alipay: { balance: ali.balance, transferRecords: ali.transferRecords, subscriptions: ali.subscriptions },
  };
}

export const financeTestController = createFinanceTestController({
  read: readFinanceTestSnapshot,
  write: snapshot => {
    useWechatStore.setState(snapshot.wechat);
    useAlipayStore.setState(snapshot.alipay);
  },
  now: TimeService.now,
  setTime: timestamp => TimeService.useSimulatedTime(timestamp, false),
});
