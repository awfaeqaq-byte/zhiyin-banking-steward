import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {StatusToast} from '../../src/components/status-toast';
import {TaskCardHeader} from '../../src/components/task-card-header';

const listeners=new Set<()=>void>();
const cancel=vi.fn();
const animate=vi.fn(()=>({cancel}));
let reduced=false;
beforeEach(()=>{
 reduced=false;
 vi.stubGlobal('matchMedia',()=>({matches:reduced,
  addEventListener:(_type:string,listener:()=>void)=>listeners.add(listener),
  removeEventListener:(_type:string,listener:()=>void)=>listeners.delete(listener),
 }));
 Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:animate});
 vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:100}] as unknown as DOMRectList);
});
afterEach(()=>{
 cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();
 listeners.clear();cancel.mockClear();animate.mockClear();
 delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

it('提示关闭期间保留文字，但停止播报和点击，退出结束后移除',()=>{
 vi.useFakeTimers();
 const onDismiss=vi.fn();
 const view=render(<StatusToast message="已保存安排" onDismiss={onDismiss}/>);
 fireEvent.click(screen.getByRole('button',{name:'关闭提示'}));
 expect(onDismiss).toHaveBeenCalledTimes(1);
 view.rerender(<StatusToast message="" onDismiss={onDismiss}/>);
 const closing=screen.getByText('已保存安排').parentElement;
 expect(closing).toHaveAttribute('data-state','closed');
 expect(closing).toHaveAttribute('aria-hidden','true');
 expect(closing).toHaveAttribute('aria-live','off');
 expect(closing).toHaveAttribute('inert');
 const button=screen.getByRole('button',{name:'关闭提示',hidden:true});
 expect(button).toBeDisabled();
 fireEvent.click(button);
 expect(onDismiss).toHaveBeenCalledTimes(1);
 act(()=>vi.advanceTimersByTime(160));
 expect(screen.queryByText('已保存安排')).not.toBeInTheDocument();
});
it('退出中出现新提示会取消旧计时，更新同一个播报节点',()=>{
 vi.useFakeTimers();
 const onDismiss=vi.fn();
 const view=render(<StatusToast message="已保存安排" onDismiss={onDismiss}/>);
 const status=screen.getByRole('status');
 view.rerender(<StatusToast message="" onDismiss={onDismiss}/>);
 act(()=>vi.advanceTimersByTime(80));
 view.rerender(<StatusToast message="暂时无法同步，请重试" onDismiss={onDismiss}/>);
 act(()=>vi.advanceTimersByTime(200));
 expect(screen.getByRole('status')).toBe(status);
 expect(status).toHaveTextContent('暂时无法同步，请重试');
 expect(status).not.toHaveTextContent('已保存安排');
 expect(status).toHaveAttribute('aria-live','polite');
 expect(status).not.toHaveAttribute('inert');
 expect(screen.getByRole('button',{name:'关闭提示'})).toBeEnabled();
});
it('减少动态效果时提示立即移除，空初始状态不产生播报节点',()=>{
 reduced=true;
 const onDismiss=vi.fn();
 const view=render(<StatusToast message="" onDismiss={onDismiss}/>);
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 view.rerender(<StatusToast message="已保存安排" onDismiss={onDismiss}/>);
 expect(screen.getByRole('status')).toHaveTextContent('已保存安排');
 view.rerender(<StatusToast message="" onDismiss={onDismiss}/>);
 expect(screen.queryByText('已保存安排')).not.toBeInTheDocument();
});
it('初次恢复任务不动画，只有真实状态文案改变时反馈且不改写状态',()=>{
 const view=render(<TaskCardHeader title="给妈妈的生活费" icon={null} status="待核对"/>);
 expect(animate).not.toHaveBeenCalled();
 view.rerender(<TaskCardHeader title="修改后的生活费" icon={null} status="待核对" tone="attention"/>);
 expect(animate).not.toHaveBeenCalled();
 view.rerender(<TaskCardHeader title="修改后的生活费" icon={null} status="执行失败" tone="danger"/>);
 expect(animate).toHaveBeenCalledTimes(1);
 expect(screen.getByText('执行失败')).toHaveAttribute('data-tone','danger');
 expect(screen.queryByText('已完成')).not.toBeInTheDocument();
 view.rerender(<TaskCardHeader title="修改后的生活费" icon={null} status="等待授权" tone="attention"/>);
 expect(cancel).toHaveBeenCalledTimes(1);
 expect(animate).toHaveBeenCalledTimes(2);
 view.unmount();
 expect(cancel).toHaveBeenCalledTimes(2);
});
it('后台隐藏和减少动态偏好抑制任务状态动画，运行时更改偏好会停止',()=>{
 const view=render(<TaskCardHeader title="生活费" icon={null} status="待核对"/>);
 vi.spyOn(document,'hidden','get').mockReturnValue(true);
 view.rerender(<TaskCardHeader title="生活费" icon={null} status="等待授权"/>);
 expect(animate).not.toHaveBeenCalled();
 vi.spyOn(document,'hidden','get').mockReturnValue(false);
 reduced=true;
 view.rerender(<TaskCardHeader title="生活费" icon={null} status="处理中"/>);
 expect(animate).not.toHaveBeenCalled();
 reduced=false;
 view.rerender(<TaskCardHeader title="生活费" icon={null} status="执行失败" tone="danger"/>);
 expect(animate).toHaveBeenCalledTimes(1);
 act(()=>{reduced=true;listeners.forEach(listener=>listener());});
 expect(cancel).toHaveBeenCalledTimes(1);
});
it('保持挂载但不可见的后台任务不播放状态变化',()=>{
 vi.mocked(HTMLElement.prototype.getClientRects).mockReturnValue([] as unknown as DOMRectList);
 const view=render(<TaskCardHeader title="生活费" icon={null} status="等待授权"/>);
 view.rerender(<TaskCardHeader title="生活费" icon={null} status="执行失败" tone="danger"/>);
 expect(animate).not.toHaveBeenCalled();
});
