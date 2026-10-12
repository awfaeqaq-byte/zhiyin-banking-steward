import {validWechatShare,type WechatShare} from '../../../src/lib/wechat-message-share';
type Status = 'loading' | 'ready' | 'error';
type FinancialProvider = 'alipay' | 'wechat_pay';
type FinancialScope = 'balance' | 'transactions' | 'autopay';
type Options = {
  foodOrder?: (operation:string,payload:Record<string,unknown>)=>Promise<Record<string,unknown>>;
  occasionFood?: (operation:string,payload:Record<string,unknown>)=>Promise<Record<string,unknown>>;
  groupAA?: (operation:string,payload:Record<string,unknown>)=>Promise<Record<string,unknown>>;
  origin: string;
  peer: () => Window | null;
  onStatus: (status: Status) => void;
  onExit: () => void;
  isActive: () => boolean;
  loadContacts: () => Promise<{
    status: 'granted' | 'denied' | 'unavailable';
    contacts: Array<{ id: string; displayName: string; phoneLast4: string; avatarColor?: string }>;
  }>;
  loadFinancialSource: (provider: FinancialProvider, scopes: FinancialScope[]) => Promise<Record<string, unknown>>;
  authorizeFinancialSource: (provider: FinancialProvider, scopes: FinancialScope[]) => Promise<boolean>;
  hasFinancialAuthorization: (provider: FinancialProvider, scopes: FinancialScope[]) => boolean;
  revokeFinancialAuthorization: (provider: FinancialProvider) => boolean | Promise<boolean>;
  cancelFinancialAutopay: (provider: FinancialProvider, subscriptionId: string) => Promise<Record<string, unknown>>;
};

/** A narrow bridge for scoped reads and explicit, single-resource partner actions. */
export function createPhoneSession(options: Options) {
  let ready = false;
  let sequence = 0;
  let pending: string | null = null;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let backTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const shares=new Map<string,WechatShare>();
  const receivedShares=new Set<string>();
  const contactRequests = new Set<string>();
  const financeRequests = new Set<string>();
  const revocationRequests = new Set<string>();
  const cancellationRequests = new Set<string>();
  const send = (data: object) => options.peer()?.postMessage({ channel: 'zhiyin-phone', version: 1, ...data }, options.origin);
  const deliverShare=()=>{if(ready&&!disposed&&options.isActive())for(const share of shares.values())send({type:'wechat-share',share});};
  const exit = () => { if (options.isActive()) options.onExit(); };
  const reload = () => {
    clearTimeout(loadTimer);
    clearTimeout(backTimer);
    pending = null;
    ready = false;
    options.onStatus('loading');
    loadTimer = setTimeout(() => options.onStatus('error'), 8000);
  };
  reload();
  return {
    share:(value:unknown)=>{if(validWechatShare(value)&&!receivedShares.has(value.id)){shares.set(value.id,value);deliverShare();}},
    reload,
    ping: () => send({ type: 'ping' }),
    foreground: () => {
      if (ready && !disposed && options.isActive()) send({ type: 'foreground' });
      deliverShare();
    },
    receive(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>) {
      if (event.origin !== options.origin || !options.peer() || event.source !== options.peer()) return;
      const data = event.data;
      if (!data || data.channel !== 'zhiyin-phone' || data.version !== 1) return;
      if (data.type === 'ready') {
        ready = true;
        clearTimeout(loadTimer);
        options.onStatus('ready');
        deliverShare();
      }
      if(data.type==='wechat-share-result'&&data.status==='received'&&shares.has(data.id)){receivedShares.add(data.id);shares.delete(data.id);}
      if(data.type==='food-order-request'&&typeof data.requestId==='string'&&data.requestId.length>0&&data.requestId.length<=80&&['catalog','prepare','open','records'].includes(data.operation)&&options.isActive()&&options.foodOrder&&!financeRequests.has(data.requestId)){
        const id=data.requestId;financeRequests.add(id);
        void options.foodOrder(data.operation,{taskId:data.taskId,orderId:data.orderId,draft:data.draft,quote:data.quote,authorized:data.authorized}).then(result=>{if(!disposed)send({type:'food-order-result',requestId:id,...result});}).catch(e=>{if(!disposed)send({type:'food-order-result',requestId:id,status:'error',message:e instanceof Error?e.message:'无法核对点餐方案'});}).finally(()=>financeRequests.delete(id));
      }
      if(data.type==='occasion-food-request'&&typeof data.requestId==='string'&&data.requestId.length>0&&data.requestId.length<=80&&['prepare','open','records'].includes(data.operation)&&options.isActive()&&options.occasionFood&&!financeRequests.has(data.requestId)){
        const id=data.requestId;financeRequests.add(id);
        void options.occasionFood(data.operation,{planId:data.planId,productId:data.productId,orderId:data.orderId}).then(result=>{if(!disposed)send({type:'occasion-food-result',requestId:id,...result});}).catch(e=>{if(!disposed)send({type:'occasion-food-result',requestId:id,status:'error',message:e instanceof Error?e.message:'无法核对外卖订单'});}).finally(()=>financeRequests.delete(id));
      }
      if(data.type==='group-aa-request'&&typeof data.requestId==='string'&&data.requestId.length<=80&&options.isActive()&&options.groupAA&&!financeRequests.has(data.requestId)){
        const id=data.requestId;financeRequests.add(id);
        const payload={groupId:data.groupId,revision:data.revision,plan:data.plan,id:data.id};
        void options.groupAA(data.operation,payload).then(result=>{if(!disposed)send({type:'group-aa-result',requestId:id,...result});}).catch(e=>{if(!disposed)send({type:'group-aa-result',requestId:id,status:'error',message:e instanceof Error?e.message:'群收款失败'});}).finally(()=>financeRequests.delete(id));
      }
      if (
        data.type === 'contacts-request' && typeof data.requestId === 'string' &&
        data.requestId.length > 0 && data.requestId.length <= 64 &&
        options.isActive() && !contactRequests.has(data.requestId)
      ) {
        const requestId = data.requestId;
        contactRequests.add(requestId);
        void options.loadContacts().then((result) => {
          if (!disposed) send({ type: 'contacts-result', requestId, ...result });
        }).catch(() => {
          if (!disposed) send({ type: 'contacts-result', requestId, status: 'unavailable', contacts: [] });
        }).finally(() => contactRequests.delete(requestId));
      }
      if (
        ['finance-source-request', 'finance-source-refresh-request'].includes(data.type) &&
        typeof data.requestId === 'string' &&
        data.requestId.length > 0 && data.requestId.length <= 64 &&
        ['alipay', 'wechat_pay'].includes(data.provider) && Array.isArray(data.scopes) &&
        options.isActive() && !financeRequests.has(data.requestId)
      ) {
        const requestId = data.requestId;
        const provider = data.provider as FinancialProvider;
        const scopes = [...new Set(data.scopes)].filter(
          (scope): scope is FinancialScope => ['balance', 'transactions', 'autopay'].includes(String(scope)),
        );
        financeRequests.add(requestId);
        const authorization = data.type === 'finance-source-refresh-request'
          ? Promise.resolve(options.hasFinancialAuthorization(provider, scopes))
          : options.authorizeFinancialSource(provider, scopes);
        void authorization.then((authorized) => {
          if (!authorized) return { status: 'denied' };
          return options.loadFinancialSource(provider, scopes);
        }).then((result) => {
          if (!disposed) send({ type: 'finance-source-result', requestId, ...result });
        }).catch(() => {
          if (!disposed) send({ type: 'finance-source-result', requestId, status: 'unavailable' });
        }).finally(() => financeRequests.delete(requestId));
      }
      if (
        data.type === 'finance-source-revoke-request' && typeof data.requestId === 'string' &&
        data.requestId.length > 0 && data.requestId.length <= 64 &&
        ['alipay', 'wechat_pay'].includes(data.provider) && options.isActive() &&
        !revocationRequests.has(data.requestId)
      ) {
        const requestId = data.requestId;
        const provider = data.provider as FinancialProvider;
        revocationRequests.add(requestId);
        void Promise.resolve(options.revokeFinancialAuthorization(provider)).then((revoked) => {
          if (!disposed) send({
            type: 'finance-source-revoke-result', requestId, provider,
            status: revoked ? 'revoked' : 'error',
            ...(!revoked ? { message: '支付平台未能确认撤销授权' } : {}),
          });
        }).catch(() => {
          if (!disposed) send({
            type: 'finance-source-revoke-result', requestId, provider,
            status: 'error', message: '撤销授权失败，请稍后重试',
          });
        }).finally(() => revocationRequests.delete(requestId));
      }
      if (
        data.type === 'finance-autopay-cancel-request' && typeof data.requestId === 'string' &&
        data.requestId.length > 0 && data.requestId.length <= 64 &&
        ['alipay', 'wechat_pay'].includes(data.provider) &&
        typeof data.subscriptionId === 'string' && data.subscriptionId.trim().length > 0 &&
        data.subscriptionId.length <= 80 && options.isActive() &&
        !cancellationRequests.has(data.requestId)
      ) {
        const requestId = data.requestId;
        const provider = data.provider as FinancialProvider;
        const subscriptionId = data.subscriptionId.trim();
        cancellationRequests.add(requestId);
        const authorized = options.hasFinancialAuthorization(provider, ['autopay']);
        const cancellation = authorized
          ? options.cancelFinancialAutopay(provider, subscriptionId)
          : Promise.resolve({ status: 'error', provider, subscriptionId, message: '支付平台授权已失效，请重新连接' });
        void cancellation.then((result) => {
          if (!disposed) send({ type: 'finance-autopay-cancel-result', requestId, ...result });
        }).catch((cause) => {
          if (!disposed) send({
            type: 'finance-autopay-cancel-result', requestId, status: 'error',
            provider, subscriptionId,
            message: cause instanceof Error ? cause.message.slice(0, 120) : '取消失败',
          });
        }).finally(() => cancellationRequests.delete(requestId));
      }
      if (data.type === 'back-result' && pending !== null && data.requestId === pending && typeof data.handled === 'boolean') {
        pending = null;
        clearTimeout(backTimer);
        if (!data.handled) exit();
      }
    },
    back() {
      if (!ready || !options.peer()) return false;
      if (pending) return true;
      pending = String(++sequence);
      send({ type: 'back', requestId: pending });
      backTimer = setTimeout(() => { pending = null; exit(); }, 700);
      return true;
    },
    dispose() {
      disposed = true;
      clearTimeout(loadTimer);
      clearTimeout(backTimer);
    },
  };
}
