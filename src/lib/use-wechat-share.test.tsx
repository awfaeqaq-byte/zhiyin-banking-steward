import {act,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useWechatShare} from './use-wechat-share';
import {buildWechatShare,receiveWechatShare} from './wechat-message-share';
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
const sample=()=>buildWechatShare({id:'g',name:'朋友群',kind:'group'},[{id:'m',sender:'朋友',text:'生日地址换了',sentAt:1791770000000}],['m'],'','share');
it('刷新恢复待处理材料，完成后不再恢复，接收事件只通知展示',()=>{
 receiveWechatShare(sample());const open=vi.fn();const view=renderHook(()=>useWechatShare(open));expect(view.result.current.share?.id).toBe('share');expect(open).toHaveBeenCalledOnce();
 act(()=>window.dispatchEvent(new Event('zhiyin-wechat-share')));expect(view.result.current.share?.messages[0].text).toBe('生日地址换了');
 act(()=>view.result.current.done('share'));expect(view.result.current.share).toBeUndefined();view.unmount();const restored=renderHook(()=>useWechatShare(open));expect(restored.result.current.share).toBeUndefined();
});
it('读取和写入失败均保留错误说明，不误报材料已经移除',()=>{
 localStorage.setItem('zhiyin-wechat-share-inbox','bad');const view=renderHook(()=>useWechatShare(vi.fn()));expect(view.result.current.error).toBeTruthy();
 localStorage.clear();receiveWechatShare(sample());act(()=>window.dispatchEvent(new Event('zhiyin-wechat-share')));
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('存储不可用');});act(()=>view.result.current.done('share'));expect(view.result.current.error).toBe('存储不可用');expect(view.result.current.share?.id).toBe('share');
 act(()=>window.dispatchEvent(new CustomEvent('zhiyin-wechat-share-error',{detail:'分享未保存'})));expect(view.result.current.error).toBe('分享未保存');
});
