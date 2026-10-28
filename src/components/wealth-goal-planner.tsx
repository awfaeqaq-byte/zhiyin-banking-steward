import {useMemo,useState} from 'react';
import {CheckCircle2,Flag,Info,Save,Target} from 'lucide-react';
import {buildWealthGoalPlan,WEALTH_GOAL_KEY} from '../lib/wealth-goal';

const cny=(value:number)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:0}).format(value);
type SavedGoal={name:string;target:string;current:string;months:string;savedAt:number};
function readGoal():SavedGoal|null{try{const value=localStorage.getItem(WEALTH_GOAL_KEY);return value?JSON.parse(value) as SavedGoal:null;}catch{return null;}}

export function WealthGoalPlanner(){
  const [initial]=useState(readGoal);
  const [name,setName]=useState(initial?.name||'旅行基金');
  const [target,setTarget]=useState(initial?.target||'50000');
  const [current,setCurrent]=useState(initial?.current||'10000');
  const [months,setMonths]=useState(initial?.months||'12');
  const [savedAt,setSavedAt]=useState(initial?.savedAt||0);
  const plan=useMemo(()=>buildWealthGoalPlan(Number(target),Number(current),Number(months)),[target,current,months]);
  function saveGoal(){
    if(!plan)return;
    const saved={name:name.trim()||'未命名目标',target,current,months,savedAt:Date.now()};
    try{localStorage.setItem(WEALTH_GOAL_KEY,JSON.stringify(saved));}catch{/* Optional local persistence. */}
    setSavedAt(saved.savedAt);
  }
  return <section className="surface wealth-goal" aria-labelledby="wealth-goal-title">
    <div className="section-line"><div><h2 id="wealth-goal-title"><Target size={19}/>目标型资金规划</h2><p>先明确想完成的事，再比较不同假设下每月需要准备多少。</p></div><span className="pill">规划，不是收益承诺</span></div>
    <div className="wealth-goal-form">
      <label><span>目标名称</span><input value={name} maxLength={20} onChange={event=>setName(event.target.value)}/></label>
      <label><span>目标金额</span><input aria-label="目标金额" inputMode="decimal" value={target} onChange={event=>setTarget(event.target.value)}/></label>
      <label><span>已经准备</span><input aria-label="已经准备" inputMode="decimal" value={current} onChange={event=>setCurrent(event.target.value)}/></label>
      <label><span>计划月数</span><input aria-label="计划月数" inputMode="numeric" value={months} onChange={event=>setMonths(event.target.value)}/></label>
    </div>
    {!plan?<p className="form-error" role="alert">请填写有效金额，计划周期须为 1–360 的整数月数。</p>:<>
      <div className="wealth-goal-summary"><Flag size={20}/><div><span>{name.trim()||'未命名目标'}还差</span><strong>{cny(plan.gap)}</strong><small>{plan.months} 个月后达到 {cny(plan.target)}</small></div></div>
      <div className="wealth-scenarios">{plan.scenarios.map(scenario=><article key={scenario.id} data-scenario={scenario.id}><header><strong>{scenario.label}</strong><span>年化假设 {(scenario.annualRate*100).toFixed(1)}%</span></header><p>每月需准备 <b>{cny(scenario.monthlyContribution)}</b></p><small>{scenario.note}</small></article>)}</div>
      <p className="wealth-goal-note"><Info size={15}/>三档收益率只是压力测试假设，不来自模型预测；实际规划还需结合风险测评、紧急备用金和产品期限。</p>
      <div className="wealth-goal-actions">{savedAt>0&&<p role="status"><CheckCircle2 size={15}/>目标已保存 · {new Date(savedAt).toLocaleString('zh-CN')}</p>}<button type="button" onClick={saveGoal}><Save size={15}/>保存目标</button></div>
    </>}
  </section>;
}
