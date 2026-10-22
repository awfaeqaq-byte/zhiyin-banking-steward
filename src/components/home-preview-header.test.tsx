import {it,expect,vi} from 'vitest';
import {render,screen} from '@testing-library/react';import userEvent from '@testing-library/user-event';
import {HomePreviewHeader} from './home-preview-header';
const props={stewardName:'宁宁',stewardImage:'/ningning.png',onSwitchSteward:vi.fn(),onTasks:vi.fn(),onSubscriptions:vi.fn(),onProfile:vi.fn()};
it('页头保留日程、订阅、个人中心与管家选择入口',async()=>{
 const user=userEvent.setup();render(<HomePreviewHeader {...props}/>);
 await user.click(screen.getByRole('button',{name:'任务日历'}));expect(props.onTasks).toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'订阅'}));expect(props.onSubscriptions).toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'个人中心'}));expect(props.onProfile).toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'选择私人管家'}));expect(props.onSwitchSteward).toHaveBeenCalled();
});
it('首页提供常驻指南入口时，不重复底部的个人中心',async()=>{
 const onHelp=vi.fn();render(<HomePreviewHeader {...props} onHelp={onHelp}/>);
 await userEvent.click(screen.getByRole('button',{name:'查看使用指南'}));
 expect(onHelp).toHaveBeenCalledOnce();
 expect(screen.queryByRole('button',{name:'个人中心'})).not.toBeInTheDocument();
});
