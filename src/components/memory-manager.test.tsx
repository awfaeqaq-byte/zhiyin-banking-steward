import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {MemoryManager} from './memory-manager';
import {useStewardMemory} from '../lib/use-steward-memory';
import {emptyMemory,updateMemory} from '../lib/steward-memory';
afterEach(()=>vi.restoreAllMocks());
function Harness(){return <MemoryManager memory={useStewardMemory()}/>;}
it('保存来源、修改、撤销编辑、关闭、清空均真正更新服务器',async()=>{
  const user=userEvent.setup();let state=updateMemory(emptyMemory(),{type:'enabled',enabled:true,revision:0});
  state=updateMemory(state,{type:'save',text:'经常出差',category:'habit',origin:'conversation',quote:'我经常出差',revision:1});
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
    if(options?.method==='POST')state=updateMemory(state,JSON.parse(String(options.body)));
    return new Response(JSON.stringify(state));
  });
  render(<Harness/>);
  await user.click(await screen.findByText('查看来源'));expect(screen.getByText('我经常出差')).toBeVisible();
  await user.click(screen.getByRole('button',{name:'修改记忆：经常出差'}));
  await user.clear(screen.getByLabelText('记忆内容'));await user.type(screen.getByLabelText('记忆内容'),'近期减少出差');
  await user.selectOptions(screen.getByLabelText('分类'),'goal');await user.click(screen.getByRole('button',{name:'保存修改'}));
  expect(state.items[0].category).toBe('goal');expect(state.items[0].text).toBe('近期减少出差');
  await user.click(screen.getByRole('button',{name:'修改记忆：近期减少出差'}));await user.click(screen.getByRole('button',{name:'取消修改'}));
  await user.click(screen.getByRole('switch',{name:'允许记住我的偏好'}));expect(state.enabled).toBe(false);
  expect(screen.getByRole('button',{name:'添加记忆'})).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'清空全部记忆'}));await user.click(screen.getByRole('button',{name:'返回'}));expect(state.items).toHaveLength(1);
  await user.click(screen.getByRole('button',{name:'清空全部记忆'}));await user.click(screen.getByRole('button',{name:'确认清空全部记忆'}));
  expect(state.items).toHaveLength(0);
});
it('画像可确认、纠正、忘记，并保留明确与暂定区分',async()=>{
  const user=userEvent.setup();let state=updateMemory(emptyMemory(),{type:'enabled',enabled:true,revision:0});
  state=updateMemory(state,{type:'profile',profileAction:'enable',enabled:true,revision:state.revision});
  state=updateMemory(state,{type:'profile',profileAction:'observe',revision:state.revision,observation:{topic:'music',text:'两个音乐会员都使用',quote:'两个都用',userText:'两个都用'}});
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{if(options?.method==='POST')state=updateMemory(state,JSON.parse(String(options.body)));return new Response(JSON.stringify(state));});
  render(<Harness/>);
  await screen.findByText('两个音乐会员都使用');
  await user.click(screen.getByRole('button',{name:'理解得对'}));expect(state.profile?.items[0].status).toBe('confirmed');
  await user.click(screen.getByRole('button',{name:'纠正：两个音乐会员都使用'}));
  await user.click(screen.getByRole('button',{name:'取消纠正'}));
  await user.click(screen.getByRole('button',{name:'纠正：两个音乐会员都使用'}));
  await user.clear(screen.getByLabelText('你的实际偏好'));await user.type(screen.getByLabelText('你的实际偏好'),'只用QQ音乐');
  await user.click(screen.getByRole('button',{name:'保存理解'}));expect(state.profile?.items[0].text).toBe('只用QQ音乐');
  await user.click(screen.getByRole('button',{name:'忘记：只用QQ音乐'}));expect(state.profile?.items).toHaveLength(0);
  await user.click(screen.getByText('已停止积累的主题'));await user.click(screen.getByRole('button',{name:'恢复音乐偏好'}));expect(state.profile?.ignored).toHaveLength(0);
  await user.click(screen.getByRole('switch',{name:'从对话积累长期印象'}));expect(state.profile?.enabled).toBe(false);
});
it('服务失败可重试，写入失败不假装保存成功',async()=>{
  const user=userEvent.setup();let offline=true;
  const state=updateMemory(emptyMemory(),{type:'enabled',enabled:true,revision:0});
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
    if(offline)throw new Error('服务离线');
    return new Response(JSON.stringify(options?.method==='POST'?{error:'记忆已变化，请刷新后重试'}:state),{status:options?.method==='POST'?409:200});
  });
  render(<Harness/>);await screen.findByRole('alert');offline=false;await user.click(screen.getByRole('button',{name:'重试'}));
  await waitFor(()=>expect(screen.getByLabelText('记忆内容')).toBeEnabled());
  await user.type(screen.getByLabelText('记忆内容'),'喜欢高铁');await user.click(screen.getByRole('button',{name:'添加记忆'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('记忆已变化');expect(screen.getByLabelText('记忆内容')).toHaveValue('喜欢高铁');
});
