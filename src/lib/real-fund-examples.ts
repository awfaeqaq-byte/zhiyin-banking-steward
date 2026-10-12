/** Read-only issuer facts. These funds are never passed to the sandbox order API. */
export const realFundExamples=[
  {code:'110006',name:'易方达货币A',kind:'货币市场基金',cost:'管理费 0.15%/年，托管费 0.05%/年；另有销售服务费',liquidity:'普通开放式；具体到账以销售渠道为准',risk:'货币基金仍有投资风险，不能当作存款',asOf:'2026-04-08',source:'https://cdn.efunds.com.cn/owch/data/bulletin/20260402/%E6%98%93%E6%96%B9%E8%BE%BE%E5%9F%BA%E9%87%91%E7%AE%A1%E7%90%86%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8%E5%85%B3%E4%BA%8E%E8%B0%83%E4%BD%8E%E6%98%93%E6%96%B9%E8%BE%BE%E8%B4%A7%E5%B8%81%E5%B8%82%E5%9C%BA%E5%9F%BA%E9%87%91%E8%B4%B9%E7%8E%87%E5%B9%B6%E4%BF%AE%E8%AE%A2%E5%9F%BA%E9%87%91%E5%90%88%E5%90%8C%E3%80%81%E6%89%98%E7%AE%A1%E5%8D%8F%E8%AE%AE%E7%9A%84%E5%85%AC%E5%91%8A.pdf'},
  {code:'026197',name:'易方达悦恒稳健债券A',kind:'债券型基金',cost:'管理费 0.60%/年、托管费 0.10%/年；申赎费按渠道及持有天数变化',liquidity:'官网列示个人持有未满 7 天赎回费 1.50%；赎回时间须核对',risk:'投资范围含债券与部分权益资产，净值可能波动',asOf:'2026-09',source:'https://www.efunds.com.cn/fund/026197.shtml'},
  {code:'510330',name:'华夏沪深300ETF',kind:'股票指数 ETF',cost:'管理费 0.15%/年、托管费 0.05%/年；场内交易佣金因券商而异',liquidity:'场内交易；成交价、价差和券商规则须另查',risk:'跟踪沪深300，存在较明显权益市场波动',asOf:'2026-05',source:'https://www.chinaamc.com/fund/510330/index.shtml'},
] as const;
