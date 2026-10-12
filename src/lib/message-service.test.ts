import {afterEach,it,expect,vi} from 'vitest';
import {messageStateRequest,messageReplyRequest} from './message-service';
import {emptyWorkspaces} from './workspaces';
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();});
it('提交网络结果未知时重试相同消息ID和请求体，不创建另一条交代',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(new Response(JSON.stringify(emptyWorkspaces())));
 await messageStateRequest({type:'submit',id:'original',text:'给妈妈转500',currentId:'',memoryRevision:0});
 expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
 expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-Zhiyin-Expense-Scope')).toBe(localStorage.getItem('zhiyin-expense-scope'));
});
it('读取不盲目重试，HTTP失败和损坏状态保留原记录并说明失败',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new TypeError('offline'));await expect(messageStateRequest()).rejects.toThrow('offline');expect(fetcher).toHaveBeenCalledOnce();
 fetcher.mockResolvedValueOnce(new Response(JSON.stringify({error:'归属变化'}),{status:409}));await expect(messageStateRequest({type:'claim',id:'r',jobId:'j',owner:'o'})).rejects.toThrow('归属变化');
 fetcher.mockResolvedValueOnce(new Response(JSON.stringify({version:1})));await expect(messageStateRequest()).rejects.toThrow('格式无效');
});
it('服务端回复携带同一任务标识，正文与持久状态缺一时拒绝作为成功回复',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({state:emptyWorkspaces(),reply:{text:'我在'}})));
 const input={id:'r',jobId:'j',owner:'o',request:{stewardName:'宁宁',subscriptions:[],messages:[]}};
 expect((await messageReplyRequest(input)).reply.text).toBe('我在');expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({type:'reply',id:'r',jobId:'j',owner:'o'});
 fetcher.mockResolvedValueOnce(new Response(JSON.stringify({state:emptyWorkspaces(),reply:{}})));await expect(messageReplyRequest(input)).rejects.toThrow('格式无效');
});
