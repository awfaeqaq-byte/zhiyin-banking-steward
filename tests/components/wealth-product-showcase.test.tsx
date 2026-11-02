import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe,expect,it,vi} from 'vitest';
import {wealthProducts} from '../../src/lib/wealth-operation';
import {WealthProductShowcase} from '../../src/components/wealth-product-showcase';
import {WealthCatalogShelf} from '../../src/components/wealth-catalog-shelf';

describe('财富产品组件',()=>{
  it('按实际持有期分组，计划变更后恢复可见产品，并把解读交给管家草稿',async()=>{
    const user=userEvent.setup(),open=vi.fn(),ask=vi.fn();
    const view=render(<WealthProductShowcase products={wealthProducts} hasPlan stewardName="宁宁" onOpen={open} onAsk={ask}/>);
    await user.click(screen.getByRole('button',{name:'半年安排'}));
    const candidates=screen.getByRole('group',{name:'候选产品'});
    expect(within(candidates).getAllByRole('article')).toHaveLength(1);
    await user.click(within(candidates).getByRole('button',{name:/^稳健固收组合/}));
    expect(open).toHaveBeenCalledWith('steady-income');
    await user.click(screen.getByRole('button',{name:'请宁宁解读稳健固收组合'}));
    expect(ask).toHaveBeenCalledWith('steady-income');
    view.rerender(<WealthProductShowcase products={[wealthProducts[0]]} hasPlan stewardName="宁宁" onOpen={open} onAsk={ask}/>);
    expect(screen.getByRole('button',{name:'全部'})).toHaveAttribute('aria-pressed','true');
    expect(within(candidates).getByRole('button',{name:/^灵活现金管理/})).toBeInTheDocument();
  });
  it('全部模式下每张卡片独立解读，第二张不会使用第一张产品',async()=>{
    const user=userEvent.setup(),ask=vi.fn();
    render(<WealthProductShowcase products={wealthProducts} hasPlan stewardName="宁宁" onOpen={vi.fn()} onAsk={ask}/>);
    const secondCard=screen.getByRole('article',{name:'稳健固收组合'});
    await user.click(within(secondCard).getByRole('button',{name:'请宁宁解读稳健固收组合'}));
    expect(ask).toHaveBeenCalledOnce();
    expect(ask).toHaveBeenCalledWith('steady-income');
    expect(ask).not.toHaveBeenCalledWith('cash-plus');
  });
  it('目录默认跨类别预览，展开与类别切换都保留详情和分析的真实产品编号',async()=>{
    const user=userEvent.setup(),open=vi.fn(),ask=vi.fn();
    render(<WealthCatalogShelf onOpenFund={open} onAskNingning={ask}/>);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    await user.click(screen.getByRole('button',{name:'查看全部 11 项基金'}));
    expect(screen.getAllByRole('article')).toHaveLength(11);
    await user.click(screen.getByRole('button',{name:'债券型'}));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('button',{name:'查看摩根瑞益纯债债券C'}));
    expect(open).toHaveBeenCalledWith('bond');
    await user.click(screen.getByRole('button',{name:'请宁宁分析摩根瑞益纯债债券C'}));
    expect(ask).toHaveBeenCalledWith('bond');
    expect(screen.queryByRole('button',{name:/申购/})).not.toBeInTheDocument();
  });
});
