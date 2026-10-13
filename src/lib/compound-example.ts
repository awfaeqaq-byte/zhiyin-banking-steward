export type CompoundExample={principal:number;rateBps:number;years:number;final:number;simple:number;amounts:number[];intro:string};
const chineseYears:Record<string,number>={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
/** Only visualize a verified chain already present in this reply. Never infer a product rate. */
export function parseCompoundExample(content:string,prompt:string):CompoundExample|null{
 if(!/复利/.test(content+prompt)||/每年(?:再|都|额外)?(?:存入?|投入?|追加)|每月(?:存入?|投入?|追加)|定投/.test(content+prompt))return null;
 const pattern=/第([一二三四五六七八九十]|\d{1,2})年\s*(?:存入?|本金(?:为|是)?|把)?\s*([\d,]+(?:\.\d{1,2})?)\s*元[，,\s]*(?:再)?(?:增长|增加)\s*(\d+(?:\.\d{1,2})?)\s*%[，,\s]*(?:变成|变为|达到)\s*([\d,]+(?:\.\d{1,2})?)\s*元/g;
 const matches=[...content.replace(/\*\*/g,'').matchAll(pattern)];if(matches.length<2||matches.length>10)return null;
 const cents=(text:string)=>Math.round(Number(text.replaceAll(',',''))*100),principal=cents(matches[0][2]),rateBps=Math.round(Number(matches[0][3])*100);
 if(!Number.isSafeInteger(principal)||principal<=0||principal>100000000||rateBps<0||rateBps>10000)return null;
 const amounts=[principal];
 for(const [index,match] of matches.entries()){
  const year=chineseYears[match[1]]??Number(match[1]),previous=amounts.at(-1)!;
  const result=Number((BigInt(previous)*BigInt(10000+rateBps)+5000n)/10000n);
  if(year!==index+1||cents(match[2])!==previous||Math.round(Number(match[3])*100)!==rateBps||cents(match[4])!==result||!Number.isSafeInteger(result))return null;
  amounts.push(result);
 }
 const marker=content.search(/(?:简单)?算术例子[：:]|(?:一个|简单的)?(?:复利)?例子[：:]/),intro=(marker>=0?content.slice(0,marker):content.slice(0,matches[0].index)).replace(/[\n\s*-]+$/,'').trim();
 const simple=Number((BigInt(principal)*BigInt(10000+rateBps*matches.length)+5000n)/10000n);
 return {principal,rateBps,years:matches.length,amounts,final:amounts.at(-1)!,simple,intro};
}
