export const choiceInstructions='只有需要用户澄清需求或选择下一步时，才在末尾输出 [[choices:选项一|选项二|选项三]]，给2至3个不同的简短自然回答，每项不超过30字。不要每次都给选项，不重复正文列出选项；用户可以自由输入。选项文字会原样作为用户回复，不是执行授权，取消或资金操作仍需独立确认。';

export function parseReplyChoices(content:string) {
  const pattern=/\[\[choices:([\s\S]*?)\]\]/g;
  const matches=[...content.matchAll(pattern)];
  const text=content.replace(pattern,'').trim();
  if(matches.length!==1)return {text,choices:[] as string[]};
  const choices=matches[0][1].split('|').map(value=>value.trim());
  const valid=choices.length>=2 && choices.length<=3 && new Set(choices).size===choices.length
    && choices.every(value=>value.length>0 && value.length<=30 && !/[\r\n<>\[\]]/.test(value));
  return {text,choices:valid?choices:[]};
}
