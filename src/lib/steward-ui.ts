import type {ExternalFinancialProvider} from './financial-connections';

export type BillSection = 'overview' | 'categories' | 'trend' | 'transactions';
export type BillUI = {sections:BillSection[];evidenceRefs:number[]};
export type BillFocus = {provider:ExternalFinancialProvider;id:string};
export type BillInteraction = {question:string;provider?:ExternalFinancialProvider;focus?:BillFocus;category?:string};
export type BillScene = {
  key:string;anchorId:string;question:string;ui?:BillUI;
  needsConsent?:boolean;provider?:ExternalFinancialProvider;
  focus?:BillFocus;
  category?:string;
  interpretationQuestion?:string;
};
const sections=['overview','categories','trend','transactions'];
const marker=/\[\[bill-ui:([\s\S]*?)\]\]/g;

/** Presentation only. No model-supplied amounts, URLs, code or executable actions. */
export function validBillUI(value:unknown):BillUI|undefined {
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['sections','evidenceRefs'].includes(k)))return undefined;
  if(!Array.isArray(v.sections)||!v.sections.length||v.sections.length>4||v.sections.some(s=>!sections.includes(s))||new Set(v.sections).size!==v.sections.length)return undefined;
  const refs=v.evidenceRefs??[];
  if(!Array.isArray(refs)||refs.length>3||refs.some(n=>!Number.isInteger(n)||n<1||n>3)||new Set(refs).size!==refs.length)return undefined;
  return {sections:[...v.sections] as BillSection[],evidenceRefs:[...refs]};
}
export function parseBillUI(content:string):{text:string;ui?:BillUI} {
  const matches=[...content.matchAll(marker)];
  const text=content.replace(marker,'').trim();
  if(matches.length!==1||matches[0][1].length>1000)return {text};
  try{return {text,ui:validBillUI(JSON.parse(matches[0][1]))};}catch{return {text};}
}
export function billProvider(question:string):ExternalFinancialProvider|undefined {
  const scope=question.split('；').reverse().find(part=>/微信|支付宝|全部平台/.test(part))??question;
  return /微信/.test(scope)&&!/支付宝|全部平台/.test(scope)?'wechat_pay':/支付宝/.test(scope)&&!/微信|全部平台/.test(scope)?'alipay':undefined;
}
export function billScopeQuestion(question:string,provider?:ExternalFinancialProvider) {
  // Keep the original period, not a growing chain of scope overrides.
  const base=question.split('；')[0].replace(/微信支付|微信|支付宝|全部平台/g,'').trim();
  return `${base||'本月支出'}；只看${provider==='wechat_pay'?'微信支付':provider==='alipay'?'支付宝':'全部平台'}账单`;
}
export function evidenceRefs(content:string) {
  return [...new Set([...content.matchAll(/\[\[evidence:([1-3])\]\]/g)].map(m=>Number(m[1])))];
}
export function restoreBillScenes(raw:string|null):Record<string,BillScene> {
  try{
    const value=JSON.parse(raw||'[]');if(!Array.isArray(value))return {};
    return Object.fromEntries(value.slice(-8).filter(v=>v&&typeof v.key==='string'&&v.key.length<=100&&typeof v.anchorId==='string'&&v.anchorId.length<=100&&typeof v.question==='string'&&v.question.length<=1000).map(v=>[v.key,{
      key:v.key,anchorId:v.anchorId,question:v.question,ui:validBillUI(v.ui),
      ...(v.needsConsent===true?{needsConsent:true}:{}),
      ...(['wechat_pay','alipay'].includes(v.provider)?{provider:v.provider}:{}),
      ...(v.focus&&['wechat_pay','alipay'].includes(v.focus.provider)&&typeof v.focus.id==='string'&&v.focus.id.length<=200?{focus:{provider:v.focus.provider,id:v.focus.id}}:{}),
      ...(typeof v.category==='string'&&v.category.length>0&&v.category.length<=80?{category:v.category}:{}),
      ...(typeof v.interpretationQuestion==='string'&&v.interpretationQuestion.length<=1000?{interpretationQuestion:v.interpretationQuestion}:{}),
    }]));
  }catch{return {};}
}
