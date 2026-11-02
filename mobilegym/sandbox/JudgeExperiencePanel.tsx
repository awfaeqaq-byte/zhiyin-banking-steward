import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Check,Copy,Download,Play,RotateCcw} from 'lucide-react';
import {judgeScenarios,readJudgeNotes,updateJudgeNote,formatJudgeReport,type JudgeNotes} from '../../src/lib/judge-scenarios';
import {launchJudgeStep} from '../../src/lib/judge-bridge';
import './judge-experience.css';

const NOTES_KEY='zhiyin-judge-notes-v1';
function loadNotes(){try{return readJudgeNotes(localStorage.getItem(NOTES_KEY));}catch{return {};}}
type Props={active:boolean;disabled?:boolean;onOpened:()=>void;onModel:()=>void;onPrepare:()=>void};
export function JudgeExperiencePanel({active,disabled=false,onOpened,onModel,onPrepare}:Props){
  const [selected,setSelected]=useState('overview'),[stepIndex,setStepIndex]=useState(0);
  const [model,setModel]=useState<'checking'|'configured'|'missing'|'error'>('checking');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const [notes,setNotes]=useState<JudgeNotes>(loadNotes);
  const opening=useRef<AbortController|null>(null);
  const scenario=judgeScenarios.find(item=>item.id===selected)!;
  const step=scenario.steps[stepIndex];
  useEffect(()=>()=>opening.current?.abort(),[]);
  useEffect(()=>{
    if(!active)return;
    const controller=new AbortController();setModel('checking');
    fetch('/api/sandbox/model-config',{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('配置读取失败');
      const value=await response.json();
      if(!controller.signal.aborted)setModel(value.hasApiKey===true&&Boolean(value.baseUrl)&&Boolean(value.model)?'configured':'missing');
    }).catch(()=>{if(!controller.signal.aborted)setModel('error');});
    return()=>controller.abort();
  },[active]);
  function select(id:string){setSelected(id);setStepIndex(0);setError('');setFeedback('');}
  async function launch(){
    if(opening.current||disabled)return;
    const controller=new AbortController();opening.current=controller;setBusy(true);setError('');setFeedback('');
    try{
      await launchJudgeStep(selected,stepIndex,{
        host:window,signal:controller.signal,
        openApp:(id,route)=>{if(!window.__OS__?.openApp)throw new Error('手机尚未就绪');window.__OS__.openApp(id,route);},
        getPeer:()=>document.querySelector<HTMLIFrameElement>('.zhiyin-phone-frame')?.contentWindow??null,
      });
      if(!controller.signal.aborted){setFeedback(`已打开「${step.title}」。可回到这里继续下一步。`);onOpened();}
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'未能打开，请重试。');}
    finally{if(opening.current===controller){opening.current=null;setBusy(false);}}
  }
  const example=step.target.app==='zhiyin'?step.target.prompt:step.example;
  async function copy(){
    try{await navigator.clipboard.writeText(example||'');setFeedback('示例已复制，请在对应聊天中粘贴并自行发送。');setError('');}
    catch{setError('浏览器未允许复制，请直接选中下方示例文字复制。');}
  }
  function mark(status:'observed'|'issue'){
    const next=updateJudgeNote(notes,selected,status,Date.now());setNotes(next);
    try{localStorage.setItem(NOTES_KEY,JSON.stringify(next));setFeedback('已保存你的人工观察标记。');setError('');}
    catch{setError('浏览器未允许保存，标记仅保留在本次页面中；可以导出记录。');}
  }
  function exportNotes(){
    const url=URL.createObjectURL(new Blob([formatJudgeReport(notes)],{type:'text/markdown;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='知银评委体验记录.md';document.body.append(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="judge-experience" aria-label="评委体验场景">
    <p className="judge-intro">从一个场景开始。打开真实功能，按步骤核对结果。</p>
    <div className="judge-shortcuts" aria-label="快速体验">
      {(['overview','bills','elder','merchant'] as const).map(id=><button key={id} type="button" aria-pressed={selected===id} disabled={busy||disabled} onClick={()=>select(id)}>{({overview:'资产与卡包',bills:'账单分析',elder:'长辈版',merchant:'我的小店'})[id]}</button>)}
    </div>
    <label className="judge-select">选择体验场景 <span>{judgeScenarios.length} 个场景</span>
      <select value={selected} onChange={event=>select(event.target.value)} disabled={busy||disabled}>
        {[...new Set(judgeScenarios.map(s=>s.group))].map(group=><optgroup key={group} label={group}>{judgeScenarios.filter(s=>s.group===group).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</optgroup>)}
      </select>
    </label>
    <div className="judge-scenario-heading"><h2>{scenario.title}</h2><span className="judge-requirement">{scenario.model?'对话需模型':'页面可直接看'}</span></div>
    <p className="judge-summary">{scenario.summary}</p>
    {scenario.model&&<div className="judge-model-status">
      <p>{model==='checking'?'正在读取模型配置…':model==='configured'?'文字模型已配置，实际响应需体验验证。':model==='missing'?'尚未配置文字模型。可先看页面，配置后再发送示例。':'暂时无法读取模型状态，可打开配置检查。'}</p>
      <button type="button" disabled={busy||disabled} onClick={onModel}>模型配置<ArrowUpRight size={14} aria-hidden="true"/></button>
    </div>}
    {scenario.prepare&&<div className="judge-prepare"><p>{scenario.prepare}</p><button type="button" disabled={busy||disabled} onClick={onPrepare}>准备测试样例<ArrowUpRight size={14} aria-hidden="true"/></button></div>}
    <button type="button" className="judge-launch" disabled={busy||disabled} onClick={()=>void launch()}>
      {busy?<span className="sandbox-console-spinner"/>:<Play size={17} aria-hidden="true"/>}{busy?'正在打开功能…':example&&step.target.app==='zhiyin'?'打开知银并填入问题':'打开这一步'}
    </button>
    <p className="judge-boundary">只跳转或填写草稿。发送、授权和付款都由你确认。已有草稿请先处理，再选择新问题。</p>
    {error&&<div className="judge-error" role="alert"><p>{error}</p>{error.includes('未发送')&&<button type="button" onClick={onOpened}>返回知银处理草稿</button>}</div>}
    {feedback&&<p className="judge-feedback" role="status">{feedback}</p>}
    <ol className="judge-steps" aria-label="体验步骤">
      {scenario.steps.map((item,index)=><li key={item.title}><button type="button" aria-current={stepIndex===index?'step':undefined} disabled={busy||disabled} onClick={()=>{setStepIndex(index);setError('');setFeedback('');}}><span className="judge-step-number">{index+1}</span><span>{item.title}</span></button></li>)}
    </ol>
    <div className="judge-step-detail" aria-live="polite">
      <h3>这一步怎么做</h3><p>{step.instruction}</p>
      {example&&<div className="judge-example"><div><strong>示例问题</strong><button type="button" onClick={()=>void copy()}><Copy size={14} aria-hidden="true"/>复制示例</button></div><p>{example}</p></div>}
      <h3>预期看到</h3><p>{step.expected}</p>
    </div>
    <details className="judge-observation"><summary>记录本场景的人工观察{notes[selected]?` · ${notes[selected].status==='observed'?'符合预期':'需要排查'}`:''}</summary>
      <p>体验后再标记。打开页面不会自动记为通过。</p>
      <div><button type="button" onClick={()=>mark('observed')} aria-pressed={notes[selected]?.status==='observed'}><Check size={15} aria-hidden="true"/>符合预期</button><button type="button" onClick={()=>mark('issue')} aria-pressed={notes[selected]?.status==='issue'}><RotateCcw size={15} aria-hidden="true"/>需要排查</button></div>
      <button type="button" onClick={exportNotes}><Download size={15} aria-hidden="true"/>导出体验记录</button>
    </details>
  </section>;
}
