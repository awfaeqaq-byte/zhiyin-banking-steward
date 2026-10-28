import {expect,it} from 'vitest';
import {resolveRelativeAAShares} from './aa-relative-shares';
import type {AAGroup} from './group-aa';
const group:AAGroup={id:'g',name:'聚餐',revision:1,members:[{id:'me',name:'我',self:true,gender:'male'},{id:'li',name:'李娜',gender:'female'},{id:'wang',name:'小王',gender:'male'},{id:'other',name:'小陈',gender:'unknown'}]};
const participants=['me','wang','li'];
it.each(['夜宵220元，女生半价，其他人通a','夜宵220，女生半份','夜宵220，女生a一半','夜宵220，女生0.5倍','我和小王a的份额一样，但是李娜只用a我们份额的一半','刚才夜宵改成李娜半份，其他人平分'])('明确相对半份映射真实成员且不推断未参与人：%s',prompt=>{
 expect(resolveRelativeAAShares(group,participants,prompt)).toMatchObject({status:'resolved',shares:[{memberId:'me',weight:2},{memberId:'wang',weight:2},{memberId:'li',weight:1}]});
});
it.each(['饮料20，我可乐4，啤酒16女生半份','女生半份，小王双份','女生半份，小王3份','不要女生半价','例如女生半份','夜宵220，男生女生半份','小陈半份','半价','刚才饮料剩余部分女生半价','夜宵220元，李娜只用小王份额的一半'])('复杂或缺少范围时不能覆盖成默认半份：%s',prompt=>{
 expect(resolveRelativeAAShares(group,participants,prompt).status).toBe('clarify');
});
it('男生半份时按明确资料反向选择，不绑定姓名或固定性别',()=>{
 expect(resolveRelativeAAShares(group,participants,'男生半份，其他人各1份')).toMatchObject({status:'resolved',shares:[{memberId:'me',weight:1},{memberId:'wang',weight:1},{memberId:'li',weight:2}]});
});
it('性别未知不能从姓名推断；点名半份则不依赖性别',()=>{
 const unknown={...group,members:group.members.map(member=>member.id==='li'?{...member,gender:undefined}:member)};
 expect(resolveRelativeAAShares(unknown,participants,'女生半价')).toMatchObject({status:'clarify',message:expect.stringContaining('李娜')});
 expect(resolveRelativeAAShares(unknown,participants,'李娜半份').status).toBe('resolved');
});
it('同名成员先澄清，不能给两人同时打折',()=>{
 expect(resolveRelativeAAShares({...group,members:[...group.members,{id:'li2',name:'李娜',gender:'female'}]},[...participants,'li2'],'李娜半份').status).toBe('clarify');
});
it('不改变普通AA或明确固定金额',()=>{
 expect(resolveRelativeAAShares(group,participants,'夜宵220元大家平分').status).toBe('none');
 expect(resolveRelativeAAShares(group,participants,'李娜承担110元，其他人均摊').status).toBe('none');
 expect(resolveRelativeAAShares(group,participants,'夜宵220元，李娜承担总额的一半，其他人均摊').status).toBe('none');
});
