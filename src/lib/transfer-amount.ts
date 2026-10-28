import {bankRecipients} from './bank-transfer';
import {cents} from './native-banking';
import {WECHAT_SHARE_PREFIX} from './wechat-message-share';

type Message = {role:'user'|'assistant';content:string};
const number = '[+−-]?(?:\\d[\\d,，]*(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const labels = [...new Set(bankRecipients.flatMap(person=>[person.name,person.phone,...person.remark.split(' ')]))];
const recipientAmount = new RegExp(`(?:给|向)\\s*(?:${labels.join('|')})\\s*(?:转账?|汇款?)?\\s*(${number})\\s*(?:元|块(?:钱)?)(?=[\\s，。！？!?]|吧|就行|即可|$)`);
const verbAmount = new RegExp(`(?:转账|汇款|转|汇)(?:金额)?\\s*(?:是|为)?\\s*(${number})(?=[\\s元块，。！？!?]|$)`);
const amountField = new RegExp(`金额\\s*(?:是|为|改成|改为|[:：])?\\s*(${number})(?=[\\s元块，。！？!?]|$)`);
const amendment = new RegExp(`^(?:把)?(?:金额)?(?:改成|改为|改到|调整为|更正为|更正回|改回|改|应(?:该)?是|应为)\\s*(${number})(?=[\\s元块，。！？!?]|$)`);
const amendedAmount=(text:string)=>text.split(/[，,；;]/).reverse().map(part=>amendment.exec(part.trim())?.[1]).find(value=>value!==undefined);
const amountAnswer = new RegExp(`^(${number})\\s*(?:元|块(?:钱)?)?(?:吧|就行|即可)?[。！!\\s]*$`);
const transferWords = /转账|汇款|转给|汇给|(?:给|向).{1,25}(?:转|汇)|从.{0,15}转\s*\d/;

/** Recognize registered-recipient shorthand without preparing or authorizing a transfer. */
export function hasRecipientTransferAmount(text:string):boolean {
  return !text.startsWith(WECHAT_SHARE_PREFIX) && recipientAmount.test(text);
}

function directAmount(text:string):string|undefined {
  return recipientAmount.exec(text)?.[1] || verbAmount.exec(text)?.[1]
    || (transferWords.test(text)?amountField.exec(text)?.[1]:undefined);
}

/** Bind a prepared amount to the latest explicit amount, including a short correction. */
export function explicitTransferCents(text:string):number|null {
 const raw=amendedAmount(text)||directAmount(text)||amountAnswer.exec(text)?.[1];
 if(raw!==undefined)return cents(raw.replace(/[,，]/g,'').replace(/^\+/,''));
 const chinese=text.match(/(?:转账?|汇款?)\s*([零〇一二两三四五六七八九十百千万]+)\s*元/)?.[1];
 if(!chinese)return null;
 const digits:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 const units:Record<string,number>={十:10,百:100,千:1000};
 let total=0,section=0,digit=0;
 for(const char of chinese){if(char in digits)digit=digits[char];else if(char==='万'){section+=digit;total+=(section||1)*10000;section=0;digit=0;}else{section+=(digit||1)*units[char];digit=0;}}
 const value=(total+section+digit)*100;
 return Number.isSafeInteger(value)&&value>0?value:null;
}

/** Validate only this turn's transfer amount, never replay an old amount or quoted share. */
export function transferAmountError(messages:readonly Message[]):string|undefined {
  const users=messages.filter(message=>message.role==='user');
  const latest=(users.at(-1)?.content.trim()||'').replace(/负\s*(?=\d)/g,'-');
  if(!latest || latest.startsWith(WECHAT_SHARE_PREFIX))return;
  let amount=directAmount(latest);
  if(amount===undefined) {
    let activeTransfer=false;
    for(const message of users.slice(-5,-1)) {
      if(/^(?:哦|好[的吧]?|那)?(?:算了|先别转了|不转了|不用转了|取消转账)[。！!\s]*$/.test(message.content.trim()))activeTransfer=false;
      else if(transferWords.test(message.content)||hasRecipientTransferAmount(message.content))activeTransfer=true;
    }
    if(activeTransfer)amount=amendedAmount(latest) || amountAnswer.exec(latest)?.[1];
  }
  else amount=amendedAmount(latest)||amount;
  if(amount===undefined)return;
  // Accept correctly grouped thousands, but never round sub-cent amounts into a payment.
  if(/^[+−-]?\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?$/.test(amount))amount=amount.replace(/[,，]/g,'');
  const normalized=amount.replace('−','-').replace(/^\+/,'').replace(/^\./,'0.');
  const value=cents(normalized);
  if(value===null || value<1)return '转账金额至少为0.01元，且最多保留两位小数。请修改金额后再核对，尚未付款。';
}
