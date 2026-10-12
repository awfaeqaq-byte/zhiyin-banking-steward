export type CardIntent=
 | {kind:'limit';yuan:number}
 | {kind:'freeze'}
 | {kind:'unfreeze'}
 | {kind:'control';key:'overseas'|'contactless'|'night';enabled:boolean}
 | {kind:'application'};
export function parseCardIntent(text:string):CardIntent|null{
 if(/申请.{0,6}(?:借记卡|银行卡|卡)|办.{0,4}(?:借记卡|银行卡|卡)/.test(text))return {kind:'application'};
 if(/挂失|锁卡|冻结卡/.test(text)&&!/解挂|解除挂失|取消挂失/.test(text))return {kind:'freeze'};
 if(/解挂|解除挂失|取消挂失|恢复.{0,5}卡|解锁.{0,5}卡/.test(text))return {kind:'unfreeze'};
 const limit=text.match(/(?:单笔|支付|交易).{0,6}(?:限额|额度).{0,8}?(?:到|为|成)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块)?/);
 if(limit){const yuan=Number(limit[1]);return Number.isFinite(yuan)?{kind:'limit',yuan}:null;}
 const key=/境外/.test(text)?'overseas':/无卡|免密|线上支付/.test(text)?'contactless':/夜间|晚上/.test(text)?'night':null;
 if(key){
  if(key==='night'){
   if(/关闭|停用|解除夜间保护/.test(text))return {kind:'control',key,enabled:false};
   if(/开启|打开|不要|限制|禁止/.test(text))return {kind:'control',key,enabled:true};
  }else{
   if(/关闭|禁止|限制|不要|停用|锁定/.test(text))return {kind:'control',key,enabled:false};
   if(/开启|打开|允许|恢复|解除限制|解锁/.test(text))return {kind:'control',key,enabled:true};
  }
 }
 return null;
}
