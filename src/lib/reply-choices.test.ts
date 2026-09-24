import {expect,it} from 'vitest';
import {parseReplyChoices} from './reply-choices';
it('只解析模型明确给出的2至3个不同短选项',()=>{
  expect(parseReplyChoices('还在用吗？\n[[choices:经常用|偶尔用|不太用了]]')).toEqual({text:'还在用吗？',choices:['经常用','偶尔用','不太用了']});
  expect(parseReplyChoices('普通回复')).toEqual({text:'普通回复',choices:[]});
  for(const raw of ['[[choices:同意]]','[[choices:同意|同意]]','[[choices:<script>|好的]]','[[choices:一|二|三|四]]'])expect(parseReplyChoices(raw)).toEqual({text:'',choices:[]});
});
