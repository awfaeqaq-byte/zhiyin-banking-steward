/** Screenshot-inspired, locally seeded demo data. Never treat these figures as live fund quotes. */
export type FundCategory = 'popularity' | 'performance' | 'sector';
export type Fund = {
  id: string;
  name: string;
  code: string;
  kind: string;
  week: number;
  year: number;
  quarter: number;
  tag: string;
  sector?: string;
  sectorWeight?: number;
};

export const fundDataDate = '2026-10-14';
export const funds: Fund[] = [
  { id:'bio-a', name:'汇添富纳斯达克生物科技ETF发起式联接A', code:'DEMO001', kind:'海外指数', week:-2.61, year:24.67, quarter:12.48, tag:'人气榜第一', sector:'生物科技', sectorWeight:72.4 },
  { id:'bio-c', name:'汇添富纳斯达克生物科技ETF发起式联接C', code:'DEMO002', kind:'海外指数', week:-2.61, year:24.35, quarter:12.32, tag:'人气榜第二', sector:'生物科技', sectorWeight:72.4 },
  { id:'nasdaq-a', name:'万家纳斯达克100指数发起(QDII)A', code:'DEMO003', kind:'海外指数', week:0.73, year:19.19, quarter:7.8, tag:'搜索榜第一', sector:'科技', sectorWeight:64.2 },
  { id:'supply', name:'易方达供给改革混合', code:'DEMO004', kind:'混合型', week:-0.95, year:145.63, quarter:32.14, tag:'自选榜第一', sector:'先进制造', sectorWeight:38.6 },
  { id:'medical', name:'招商前沿医疗保健股票A', code:'DEMO005', kind:'股票型', week:1.82, year:30.45, quarter:28.09, tag:'近三月涨幅第一', sector:'医药生物', sectorWeight:65.7 },
  { id:'qianhai', name:'前海开源沪港深乐享生活', code:'DEMO006', kind:'混合型', week:2.13, year:132.23, quarter:26.74, tag:'定投表现第一', sector:'消费', sectorWeight:43.5 },
  { id:'ai', name:'西部利得中证人工智能主题指数增强A', code:'DEMO007', kind:'指数增强', week:1.26, year:6.75, quarter:18.8, tag:'连续三年靠前', sector:'人工智能', sectorWeight:81.3 },
  { id:'energy', name:'天弘中证油气产业指数发起A', code:'DEMO008', kind:'行业指数', week:2.92, year:25.59, quarter:14.02, tag:'油气板块', sector:'油气开采及服务', sectorWeight:18.63 },
  { id:'gaming', name:'银华体育文化灵活配置混合A', code:'DEMO009', kind:'混合型', week:-1.4, year:-27.06, quarter:3.46, tag:'游戏板块', sector:'游戏', sectorWeight:52.37 },
  { id:'bond', name:'摩根瑞益纯债债券C', code:'DEMO010', kind:'债券型', week:0.11, year:2.56, quarter:0.62, tag:'稳健关注', sector:'债券', sectorWeight:88.6 },
  { id:'csi', name:'长信标普100等权重指数增强人民币', code:'DEMO011', kind:'海外指数', week:1.26, year:11.74, quarter:5.23, tag:'海外关注', sector:'全球投资', sectorWeight:79.2 },
];

export const fundSections: Record<FundCategory, { id: string; title: string; fundIds: string[]; change?: number; metric?: string }[]> = {
  popularity: [
    { id:'popular', title:'高人气的基金', fundIds:['bio-a','bio-c'] },
    { id:'searched', title:'最多人搜索的基金', fundIds:['nasdaq-a','csi'] },
    { id:'saved', title:'最多人加自选的基金', fundIds:['supply','medical'] },
    { id:'recurring', title:'最多人定投的基金', fundIds:['qianhai','bond'] },
  ],
  performance: [
    { id:'quarter', title:'近3个月涨幅领先的基金', fundIds:['medical','supply'], metric:'quarter' },
    { id:'market', title:'近1年涨幅超大盘的基金', fundIds:['supply','qianhai'], metric:'year' },
    { id:'recurring-3y', title:'近3年定投表现靠前的基金', fundIds:['qianhai','medical'], metric:'quarter' },
    { id:'consistent', title:'连续3年涨幅排名靠前的基金', fundIds:['ai','nasdaq-a'], metric:'year' },
  ],
  sector: [
    { id:'oil', title:'油气开采及服务', fundIds:['energy'], change:2.92 },
    { id:'games', title:'游戏', fundIds:['gaming'], change:1.84 },
    { id:'mobile-games', title:'手机游戏', fundIds:['gaming'], change:1.70 },
    { id:'bio', title:'生物科技', fundIds:['bio-a','bio-c'], change:1.31 },
  ],
};

export const findFund = (id: string) => funds.find(fund => fund.id === id);
