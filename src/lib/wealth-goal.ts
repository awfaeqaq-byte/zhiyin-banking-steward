export type WealthGoalScenario={
  id:'conservative'|'baseline'|'active';
  label:string;
  annualRate:number;
  monthlyContribution:number;
  futureFromCurrent:number;
  note:string;
};

export type WealthGoalPlan={target:number;current:number;months:number;gap:number;scenarios:WealthGoalScenario[]};
export const WEALTH_GOAL_KEY='zhiyin-wealth-goal-v1';
export type SavedWealthGoal={name:string;target:number;current:number;months:number;savedAt:number};

export function readSavedWealthGoal(storage:Pick<Storage,'getItem'>=localStorage):SavedWealthGoal|null{
  try{
    const raw=storage.getItem(WEALTH_GOAL_KEY);
    if(!raw)return null;
    const value=JSON.parse(raw) as Record<string,unknown>;
    const numeric=(item:unknown)=>typeof item==='number'||typeof item==='string'&&item.trim()!=='';
    if(!numeric(value.target)||!numeric(value.current)||!numeric(value.months))return null;
    const target=Number(value.target),current=Number(value.current),months=Number(value.months);
    if(typeof value.name!=='string'||!value.name.trim()||value.name.length>20||!buildWealthGoalPlan(target,current,months)||typeof value.savedAt!=='number'||!Number.isFinite(value.savedAt)||value.savedAt<0)return null;
    return {name:value.name,target,current,months,savedAt:value.savedAt};
  }catch{return null;}
}

const assumptions=[
  {id:'conservative',label:'保守情景',annualRate:.015,note:'更重视确定性与流动性'},
  {id:'baseline',label:'基准情景',annualRate:.025,note:'用于日常规划参考'},
  {id:'active',label:'积极情景',annualRate:.04,note:'波动与不确定性更高'},
] as const;

export function buildWealthGoalPlan(target:number,current:number,months:number):WealthGoalPlan|null{
  if(!Number.isFinite(target)||!Number.isFinite(current)||!Number.isInteger(months)||target<=0||current<0||months<1||months>360)return null;
  const cleanMonths=months;
  return {target,current,months:cleanMonths,gap:Math.max(0,target-current),scenarios:assumptions.map(item=>{
    const monthlyRate=item.annualRate/12;
    const growth=(1+monthlyRate)**cleanMonths;
    const futureFromCurrent=current*growth;
    const annuityFactor=(growth-1)/monthlyRate;
    return {...item,monthlyContribution:Math.max(0,(target-futureFromCurrent)/annuityFactor),futureFromCurrent};
  })};
}
