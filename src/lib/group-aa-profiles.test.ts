import { afterEach, expect, it, vi } from 'vitest';
import { calculateGroupAA, requestGroupAAPlan, validAAGroup } from './group-aa';
const group = { id:'g',name:'聚餐群',revision:1,members:[
  {id:'self',name:'我',self:true,gender:'male' as const},
  {id:'li',name:'李娜',gender:'female' as const,avatar:'/@app-assets/Wechat/avatars/avatar_30.jpg'},
  {id:'wang',name:'小王',gender:'male' as const},
]};
afterEach(()=>vi.unstubAllGlobals());
it('accepts explicit profile data but rejects invalid genders and unsafe avatar URLs',()=>{
  expect(validAAGroup(group)).toBe(true);
  expect(validAAGroup({...group,members:group.members.map(m=>({...m,gender:'guessed'}))})).toBe(false);
  expect(validAAGroup({...group,members:group.members.map(m=>({...m,avatar:'javascript:alert(1)'}))})).toBe(false);
});
it('passes explicit gender and relative-share semantics to the model, without visual inference',async()=>{
  const plan={title:'晚饭',items:[{id:'dinner',title:'餐费',amount:60000,shares:[{memberId:'self',weight:2},{memberId:'li',weight:1},{memberId:'wang',weight:2}]}]};
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({output_text:JSON.stringify({message:'你和小王各1份，李娜0.5份。',plan})})});
  vi.stubGlobal('fetch',fetcher);
  const result=await requestGroupAAPlan(group,{title:'聚餐',items:[]},'600元，女生a一半',[],['self','li','wang']);
  const instructions=JSON.parse(fetcher.mock.calls[0][1].body).instructions;
  expect(instructions).toContain('gender');
  expect(instructions).toContain('未知');
  expect(instructions).toContain('2.5');
  expect(instructions).toContain('不是先均摊');
  expect(instructions).not.toContain('avatar_30.jpg');
  expect(calculateGroupAA(group,result.plan!).members.map(m=>m.amount)).toEqual([24000,12000,24000]);
});
