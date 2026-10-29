import type {OccasionDraft} from './occasion-plans';

function localDate(value:string){const time=Date.parse(value+':00+08:00');if(!Number.isFinite(time)||new Date(time+8*3600000).toISOString().slice(0,16)!==value)throw Error('建议日期无法核对，请明确日期和时间后重试');return time;}

/** Extract only explicitly labelled current-turn fields. No default dates,
 * addresses or model-calculated timestamps are converted into user choices. */
export function explicitOccasionFields(prompt:string,draft:Partial<OccasionDraft>):Partial<OccasionDraft>{
 const patch:Partial<OccasionDraft>={};
 const budget=prompt.match(/预算(?:写错了?|不加[，,；;]?仍|仍为|仍|保持|是|为|改成|改为|改|调整为|[:：])?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|[，,；;。]|$)/)?.[1];
 if(budget)patch.budget=Math.round(Number(budget)*100);
 prompt=prompt.split(/[，,。；;]/).filter(part=>!/不变|保持原样|保持原值|别动|不要改|不修改/.test(part)).join('，');
 const title=prompt.match(/(?:安排名称|安排名|草案名|方案名|名称)\s*[:：]?\s*([^，,。；;]{1,60})/)?.[1]?.trim();if(title)patch.title=title;
 const recipient=prompt.match(/(?:准备对象|对象)(?:是|为|[:：])?\s*([^，,。；;]{1,30})/)?.[1]?.trim()||prompt.match(/为([^，,。；;]{1,30}?)准备/)?.[1]?.trim()||prompt.match(/(?:帮我)?安排([^，,。；;]{1,30}?)的?生日/)?.[1]?.trim();
 if(recipient)patch.recipient=recipient;
 const phone=prompt.match(/(?<!\d)1\d{10}(?!\d)/)?.[0];
 if(phone){const name=prompt.match(/(?:收件人|收货人|联系人)(?:仍|是|为|[:：])?\s*([^，,。；;\d]{1,20})/)?.[1]?.trim()||draft.contact?.replace(/1\d{10}/g,'').trim()||'';patch.contact=`${name} ${phone}`.trim();}
 const address=prompt.match(/(?:收货地址|地址)(?:是|为|[:：])?\s*([^，,。；;]{1,200})/)?.[1]?.trim()||prompt.split(/[，,。；;]/).find(part=>/^[^\d]{2,15}市.{1,100}(?:路|街|道|巷).{1,30}(?:号|室)/.test(part.trim()))?.trim();
 if(address&&/省|市|区|路|街|号|室/.test(address))patch.address=address;
 const dates=[...prompt.matchAll(/(\d{4})(?:年|-)(\d{1,2})(?:月|-)(\d{1,2})日?(?:\s|T)*(\d{1,2})(?:点|时|:)(?:(\d{1,2})分?)?/g)];
 for(const match of dates){
  const before=prompt.slice(Math.max(0,match.index!-18),match.index).split(/[，,；;。]/).at(-1)||'',after=prompt.slice(match.index!+match[0].length).split(/[，,；;。]/)[0].slice(0,12);
  const key=/送达|送到/.test(before)?'deliverAt':/筹备|开始准备|准备时间/.test(before)?'prepareAt':/送达|送到/.test(after)?'deliverAt':/筹备|开始准备|采购/.test(after)?'prepareAt':undefined;
  if(key)patch[key]=localDate(`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}T${match[4].padStart(2,'0')}:${(match[5]||'00').padStart(2,'0')}`);
 }
 const relative=prompt.match(/提前(?:两|二|2)天\s*(\d{1,2})(?:点|时)(?:开始)?(?:筹备|准备|采购)/);
 if(relative&&(patch.deliverAt||draft.deliverAt)){const delivery=patch.deliverAt||draft.deliverAt!;const date=new Date(delivery-2*86400000+8*3600000).toISOString().slice(0,10);patch.prepareAt=localDate(`${date}T${relative[1].padStart(2,'0')}:00`);}
 return patch;
}
