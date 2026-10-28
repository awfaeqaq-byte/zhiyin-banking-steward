import {funds, fundDataDate} from './fund-discovery-data';
import {wealthProducts} from './wealth-operation';

export type WealthCatalogProduct = {
  id:string; name:string; category:string; description:string;
  source:'account'|'fund'; risk:number|null; dataDate:string; purchasable:boolean;
  minAmount?:number; minTerm?:number; increment?:number; feeRate?:number; liquidity?:string;
  fundId?:string; sector?:string; metrics?:{week:number;quarter:number;year:number};
};

/** Stable IDs bridge browsing, comparison and the advisor; reference data is never transaction inventory. */
export const wealthCatalog:WealthCatalogProduct[] = [
  ...wealthProducts.map(product=>({
    id:product.id,name:product.name,category:product.risk===1?'现金管理':product.risk===2?'固收组合':'混合组合',
    description:product.description,source:'account' as const,risk:product.risk,dataDate:product.dataDate,purchasable:product.open,
    minAmount:product.minAmount,minTerm:product.minTerm,increment:product.increment,feeRate:product.feeRate,liquidity:product.liquidity,
  })),
  ...funds.map(fund=>({
    id:fund.id,name:fund.name,category:fund.kind,description:fund.sector?`${fund.sector}方向，风险、费用和交易状态待核验。`:'风险、费用和交易状态待核验。',
    source:'fund' as const,risk:null,dataDate:fundDataDate,purchasable:false,fundId:fund.id,sector:fund.sector,
    metrics:{week:fund.week,quarter:fund.quarter,year:fund.year},
  })),
];
export const findWealthCatalogProduct=(id:string)=>wealthCatalog.find(product=>product.id===id);

/** Deliberately omit historic performance: ranking a static percentage is not suitability. */
export function wealthCatalogModelData(){
  return wealthCatalog.map(product=>product.source==='account'?{
    id:product.id,name:product.name,type:'account',risk:product.risk,min:product.minAmount,months:product.minTerm,step:product.increment,fee:product.feeRate,liquidity:product.liquidity,
  }:{id:product.id,name:product.name,type:'reference',category:product.category,sector:product.sector});
}
