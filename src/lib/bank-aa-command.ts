import {bankRecipients,splitAA,type AAIntent} from './bank-transfer';

export function isBankAACommand(text:string):boolean {
 if(!/AA|分摊|均摊/i.test(text))return false;
 if(/银行|银行卡|常用卡/.test(text))return true;
 return !/微信群|群收款|记账|记一笔/.test(text)&&bankRecipients.some(person=>text.includes(person.name)||text.includes(person.phone));
}

/** Only prepare a draft when the amount and complete participant count agree. */
export function bankAAIntent(text:string):AAIntent|null {
 const participants=bankRecipients.filter(person=>text.includes(person.name)||text.includes(person.phone));
 const amounts=[...text.matchAll(/(-?\d+(?:\.\d+)?)\s*元/g)];
 const includeSelf=/不(?:含|包含|包括)(?:我|本人|自己)/.test(text)?false:/我[、，,和与]|包[含括](?:我|本人|自己)/.test(text)?true:undefined;
 const countMatch=text.match(/([一二两三四五六七八九十]|\d+)个?人/);
 const numerals:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
 const count=countMatch?(numerals[countMatch[1]]??Number(countMatch[1])):undefined;
 if(amounts.length!==1||!/^\d+(?:\.\d{1,2})?$/.test(amounts[0][1])||!participants.length||includeSelf===undefined)return null;
 if(count!==undefined&&count!==participants.length+Number(includeSelf))return null;
 // Natural-language lists must identify every member; unknown names need clarification.
 const list=text.match(/(?:参与人(?:就是|是|为)?[：:]?)?([\p{Script=Han}\d、和与，,]+?)(?:[一二两三四五六七八九十\d]+个?人|聚餐|总额)/u)?.[1];
 if(list&&/[、和与]/.test(list)){
  const unexplained=participants.reduce((rest,person)=>rest.replaceAll(person.name,'').replaceAll(person.phone,''),list).replace(/本人|自己|我|参与人|就是|是|为|[、和与，,\s]/g,'');
  if(unexplained)return null;
 }
 if(count===undefined&&!/银行|银行卡|常用卡/.test(text))return null;
 const amount=Math.round(Number(amounts[0][1])*100),recipientIds=participants.map(person=>person.id);
 try{splitAA(amount,recipientIds,includeSelf);return {amount,recipientIds,includeSelf};}catch{return null;}
}
