import {it,expect} from 'vitest';
import {parseCompoundExample} from '../../src/lib/compound-example';
const reply='储蓄是本金的起点。\n\n简单算术例子：\n- 第一年存1000元，增长10%变成1100元\n- 第二年1100元再增长10%变成1210元\n- 第三年1210元再增长10%变成1331元\n复利多出31元。';
it('将回复中一致的一次存入示例整理为初始与三年数据，不把收益当成产品承诺',()=>{const example=parseCompoundExample(reply,'解释复利并给个算术例子');expect(example).toMatchObject({principal:100000,rateBps:1000,years:3,final:133100,simple:130000,intro:'储蓄是本金的起点。'});expect(example?.amounts).toEqual([100000,110000,121000,133100]);});
it('金额或年份前后不一致时保留文字，不绘制错误图表',()=>{expect(parseCompoundExample(reply.replace('1210元再','1200元再'),'复利')).toBeNull();expect(parseCompoundExample(reply.replace('1331元','1500元'),'复利')).toBeNull();expect(parseCompoundExample(reply.replace('第三年','第四年'),'复利')).toBeNull();});
it('逐年追加本金与其他话题不套用一次投入图表',()=>{expect(parseCompoundExample(reply,'假设每年存入1000元')).toBeNull();expect(parseCompoundExample('每年存入1000元。'+reply,'解释复利')).toBeNull();expect(parseCompoundExample('订单已送达','外卖')).toBeNull();});
