import {render,screen,act,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi,afterEach} from 'vitest';
const worker=vi.hoisted(()=>({mounts:0,unmounts:0,finish:undefined as undefined|(()=>void)}));
vi.mock('../../src/components/steward-workspaces',async()=>{const React=await import('react');return {StewardWorkspaces:()=>{
 const [reply,setReply]=React.useState('等待交代');React.useEffect(()=>{worker.mounts++;return()=>{worker.unmounts++;};},[]);
 return <section aria-label="后台管家测试"><button onClick={()=>{setReply('正在整理');worker.finish=()=>setReply('离开首页后任务已完成');}}>开始后台测试</button><p>{reply}</p></section>;
}};});
import App from '../../src/App';
afterEach(()=>{vi.restoreAllMocks();worker.mounts=0;worker.unmounts=0;worker.finish=undefined;});
it('离开首页后处理器不卸载，异步结果完成并在返回后展示',async()=>{
 localStorage.setItem('zhiyin-mode','"native"');vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({version:1,revision:0,enabled:false,items:[],tasks:[]})));
 const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:'开始后台测试'}));await user.click(screen.getByRole('button',{name:'我的'}));
 expect(worker.unmounts).toBe(0);expect(screen.queryByRole('button',{name:'开始后台测试'})).not.toBeInTheDocument();
 await act(async()=>worker.finish?.());await user.click(screen.getByRole('button',{name:'返回'}));
 await waitFor(()=>expect(screen.getByText('离开首页后任务已完成')).toBeVisible());expect(worker.mounts).toBe(1);
});
