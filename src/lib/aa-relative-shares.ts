import type {AAGroup} from './group-aa';

type RelativeShares =
 | {status:'none'}
 | {status:'clarify';message:string}
 | {status:'resolved';shares:{memberId:string;weight:number}[];description:string};
const half = /半价|半份|一半|0[.．]5\s*倍/i;
const clarify = (message='请确认哪一笔费用、哪些参与人承担半份；其他参与人是否各承担一份？'):RelativeShares=>({status:'clarify',message});

/** A bounded whole-expense rule, grounded in selected members rather than model math. */
export function resolveRelativeAAShares(group:AAGroup,participantIds:string[],prompt:string):RelativeShares {
 if(!half.test(prompt))return {status:'none'};
 // Mixed amounts, exclusions, fixed personal costs and competing rules need a
 // specific clarification. Do not overwrite them with a whole-expense ratio.
 if(/不要|不是|并非|不按|不用|取消|假如|假设|比如|例如|[“”「」"']|双份|两份|两倍|2\s*(?:份|倍)|不参与|没吃|没喝|不吃|不喝|除外|除去|排除|不算|请客|独自|单独|个人|自己(?:买|付|承担)|[：:]\s*\d/.test(prompt))return clarify();
 if(/(?:总额|总价|总金额|账单金额|全部金额)的?一半/.test(prompt))return {status:'none'};
 if(/剩余|剩下|余款|其余部分|剩下部分/.test(prompt))return clarify('请确认按半份分摊的是哪项剩余费用，原有个人固定金额暂不修改。');
 const withoutRatio=prompt.replace(/0[.．]5\s*倍/g,'');
 if([...withoutRatio.matchAll(/\d+(?:\.\d+)?\s*(?:份|倍)/g)].some(match=>Number.parseFloat(match[0])!==1)||/[二三四五六七八九十两](?:份|倍)/.test(withoutRatio))return clarify();
 const amounts=[...withoutRatio.matchAll(/\d+(?:\.\d+)?/g)].filter(match=>!/^\s*(?:瓶|杯|罐|个|份|人|年|月|日)/.test(withoutRatio.slice(match.index!+match[0].length)));
 if(amounts.length>1)return clarify('这句话涉及多项金额，请确认哪一项按半份分摊；个人固定金额不会自动改成按份数分摊。');
 if(!participantIds.length||new Set(participantIds).size!==participantIds.length||participantIds.some(id=>!group.members.some(member=>member.id===id)))return clarify('请先确认这笔消费的参与人，再按半份分摊。');
 const participants=participantIds.map(id=>group.members.find(member=>member.id===id)!);
 const discounted=new Set<string>();
 for(const clause of prompt.split(/[，,。；;！？!?\n]+/).filter(value=>half.test(value))){
  const match=half.exec(clause)!;
  // A contrast starts a new subject: “我和小王一样，但李娜只用我们份额的一半”.
  const subject=clause.slice(0,match.index).split(/但是|但|而/).at(-1)!;
  const female=/女生|女性|女孩/.test(subject),male=/男生|男性|男孩/.test(subject);
  if(female&&male)return clarify();
  if(female||male){
   const unknown=participants.filter(member=>!member.gender||member.gender==='unknown');
   if(unknown.length)return clarify(`${unknown.map(member=>member.self?'你':member.name).join('、')}未填写性别。请直接告诉我哪些人承担半份。`);
   const targets=participants.filter(member=>member.gender===(female?'female':'male'));
   if(!targets.length)return clarify('当前参与人资料中没有符合条件的成员，请直接告诉我谁承担半份。');
   targets.forEach(member=>discounted.add(member.id));
  }else{
   const targets=group.members.filter(member=>!member.self&&subject.includes(member.name));
   if(/(?:^|[、和与及])我(?!们)/.test(subject)||/(?:改成|改为|让)我(?!们)/.test(subject))targets.push(...group.members.filter(member=>member.self));
   if(!targets.length)return clarify('请直接告诉我哪些参与人承担半份，其他人是否各一份？');
   if(targets.length>1&&/份额|份数|只用|承担/.test(subject))return clarify('请确认谁承担半份、谁各承担一份，比较对象不会同时被算成半份。');
   for(const member of targets){
    if(!member.self&&group.members.filter(candidate=>candidate.name===member.name).length>1)return clarify(`群里有同名的${member.name}，请明确是哪位成员承担半份。`);
    if(!participantIds.includes(member.id))return clarify(`${member.name}不在本次参与人中，请先确认参与范围。`);
    discounted.add(member.id);
   }
  }
 }
 if(!discounted.size)return clarify();
 const shares=participantIds.map(memberId=>({memberId,weight:discounted.has(memberId)?1:2}));
 const label=(id:string)=>{const member=participants.find(member=>member.id===id)!;return member.self?'你':member.name;};
 const normal=shares.filter(share=>share.weight===2).map(share=>label(share.memberId));
 const discountedNames=shares.filter(share=>share.weight===1).map(share=>label(share.memberId));
 return {status:'resolved',shares,description:`${normal.length?`${normal.join('、')}各1份，`:''}${discountedNames.join('、')}各半份，按相对份数分完总额。`};
}
