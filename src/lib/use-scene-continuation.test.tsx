import {it,expect,vi,afterEach} from 'vitest';
import {renderHook,act} from '@testing-library/react';
import {useSceneContinuation} from './use-scene-continuation';
import {emptyWorkspaces} from './workspaces';
import {reconcileSceneSources} from './scene-service';
vi.mock('./scene-service',()=>({reconcileSceneSources:vi.fn()}));
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it('在途核对期间返回事件不丢失，后台间隔继续核对，卸载才停止',async()=>{
 vi.useFakeTimers();let resolve!:(value:ReturnType<typeof emptyWorkspaces>)=>void;
 vi.mocked(reconcileSceneSources).mockImplementationOnce(()=>new Promise(done=>resolve=done)).mockResolvedValue(emptyWorkspaces());
 const accept=vi.fn(),view=renderHook(()=>useSceneContinuation(true,accept,'same'));
 expect(reconcileSceneSources).toHaveBeenCalledTimes(1);
 act(()=>window.dispatchEvent(new Event('zhiyin-phone-foreground')));
 await act(async()=>{resolve(emptyWorkspaces());await Promise.resolve();});expect(reconcileSceneSources).toHaveBeenCalledTimes(2);expect(accept).toHaveBeenCalledTimes(2);
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});expect(reconcileSceneSources).toHaveBeenCalledTimes(3);
 view.unmount();await vi.advanceTimersByTimeAsync(30000);expect(reconcileSceneSources).toHaveBeenCalledTimes(3);
});
it('网络失败保留现场，下一次前台事件重试；关闭期间的晚到状态不覆盖',async()=>{
 vi.mocked(reconcileSceneSources).mockRejectedValueOnce(Error('网络失败')).mockResolvedValue(emptyWorkspaces());const accept=vi.fn(),view=renderHook(()=>useSceneContinuation(true,accept,'same'));
 await act(async()=>{await Promise.resolve();});expect(accept).not.toHaveBeenCalled();
 await act(async()=>{window.dispatchEvent(new Event('zhiyin-phone-foreground'));});expect(accept).toHaveBeenCalled();view.unmount();
});

it('未启动时不后台读取，重新前台可启动；visibility事件能核对',async()=>{vi.mocked(reconcileSceneSources).mockResolvedValue(emptyWorkspaces());const accept=vi.fn(),view=renderHook(({enabled})=>useSceneContinuation(enabled,accept,'same'),{initialProps:{enabled:false}});expect(reconcileSceneSources).not.toHaveBeenCalled();await act(async()=>view.rerender({enabled:true}));await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(reconcileSceneSources).toHaveBeenCalledTimes(2);view.unmount();});

it('原群恢复授权后只重试原账本，保存中断时保留恢复请求到下一轮',async()=>{
 vi.useFakeTimers();vi.mocked(reconcileSceneSources).mockResolvedValue(emptyWorkspaces());
 const view=renderHook(()=>useSceneContinuation(true,vi.fn(),'same'));
 await act(async()=>{});
 vi.mocked(reconcileSceneSources).mockRejectedValueOnce(new Error('保存中断'));
 await act(async()=>window.dispatchEvent(new CustomEvent('zhiyin-group-aa-authorized',{detail:{bookId:'original-book'}})));
 expect(reconcileSceneSources).toHaveBeenLastCalledWith(undefined,{retryExpenseBookIds:['original-book']});
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});
 expect(reconcileSceneSources).toHaveBeenLastCalledWith(undefined,{retryExpenseBookIds:['original-book']});
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});
 expect(reconcileSceneSources).toHaveBeenLastCalledWith(undefined,{retryExpenseBookIds:[]});
 view.unmount();
});
