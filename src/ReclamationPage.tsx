import { useEffect,useState,type FormEvent } from "react";
import { Dices, BriefcaseBusiness, Hammer, Wallet, Shield, RefreshCw } from "lucide-react";
import ReclamationSystems from "./ReclamationSystems";
type Task={version?:number;status?:string;id:string;title:string;description:string;profession_id:string|null;completion_type:string;duration_minutes:number;character_xp:number;profession_xp:number;pay_credits:string|number;stamina_cost:number;materials:Record<string,number>};
type Order={id:string;status:string;title:string;due_at:string|null};
type Character={id:string;name:string;profession_id:string;level:number;xp:string|number;health:number;stamina:number;attributes:Record<string,number>;skills:Record<string,number>};
type Game={character:Character|null;tasks:Task[];projects:{id:string;title:string;phase:number;state:string;requirements:Record<string,number>;progress:Record<string,number>}[];wallet:string;orders:Order[];settings:{rules?:{allocation_points?:number;starting_attribute?:number;starting_max?:number};story?:{stage:string}};overseer?:{treasury:string;taskTemplates:Task[]}};
const fields=["strength","intelligence","charisma","agility","endurance","perception"] as const;
const professions=["carpenter","metalworker","medic","farmer","engineer","scavenger"];
async function request<T>(action:string,method="GET",data?:unknown):Promise<T>{
 const response=await fetch("/api/social?action=game_"+encodeURIComponent(action),{method,cache:"no-store",headers:data?{"Content-Type":"application/json"}:undefined,body:data?JSON.stringify(data):undefined});
 const body=await response.json();if(!response.ok)throw Error(body.error||"Game server unavailable");return body as T;
}
const format=(n:number|string)=>Number(n).toLocaleString("en-US");
export default function ReclamationPage(){
 const [game,setGame]=useState<Game|null>(null),[pending,setPending]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [name,setName]=useState(""),[profession,setProfession]=useState("carpenter");
 const [attrs,setAttrs]=useState<Record<string,number>>({strength:5,intelligence:5,charisma:5,agility:5,endurance:5,perception:5});
 const [dice,setDice]=useState(20),[modifier,setModifier]=useState(0),[diceResult,setDiceResult]=useState<{faces:number[];total:number}|null>(null);
 const [donations,setDonations]=useState<Record<string,number>>({});
 const [task,setTask]=useState({title:"",profession:"carpenter",description:"",completionType:"timer",minutes:15,xp:35,skillXp:25,pay:350});
 const [editingTask,setEditingTask]=useState<{id:string;version:number;status:string}|null>(null);
 const load=async()=>{try{setGame(await request<Game>("state"));setError("")}catch(e){setError((e as Error).message)}finally{setPending(false)}};
 useEffect(()=>{void load()},[]);
 const run=async(action:string,data:unknown)=>{setNotice("");setError("");try{const response=await request<{result:unknown}>(action,"POST",data);setNotice("Action completed.");if(action==="dice.roll")setDiceResult(response.result as {faces:number[];total:number});await load()}catch(e){setError((e as Error).message)}};
 const points=game?.settings?.rules?.allocation_points??20;
 const base=game?.settings?.rules?.starting_attribute??5;
 const max=game?.settings?.rules?.starting_max??10;
 const remaining=points-Object.values(attrs).reduce((s,v)=>s+v-base,0);
 function changeAttr(key:string,delta:number){setAttrs(old=>{const value=old[key]+delta;if(value<base||value>max||(delta>0&&remaining<=0))return old;return {...old,[key]:value}})}
 function register(e:FormEvent){e.preventDefault();if(remaining!==0)return;void run("character.create",{name,profession,attributes:attrs})}
 function addTask(e:FormEvent){e.preventDefault();void run(editingTask?"task.update":"task.publish",editingTask?{...task,...editingTask}:task)}
 const style={background:"#151b22",border:"1px solid #34404b",borderRadius:8,padding:18} as const;
 return <div style={{maxWidth:1160,margin:"24px auto",padding:"0 16px",color:"#e5ebf1",fontFamily:"inherit"}}>
  <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap",marginBottom:20}}>
   <div><small style={{letterSpacing:3,color:"#91b2a7"}}>C0N / PROJECT RECLAMATION</small><h1 style={{margin:"5px 0"}}>The Underground Compound</h1><p style={{margin:0,color:"#a9b5c0"}}>The bunker has been discovered. Reclaim it together.</p></div>
   <button type="button" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</button>
  </header>
  {pending?<p>Connecting to the game database…</p>:error&&!game?<p role="alert">{error}</p>:game&&<>
   {notice&&<p role="status" style={{color:"#9fdeb8"}}>{notice}</p>}{error&&<p role="alert" style={{color:"#ff9c9c"}}>{error}</p>}
   {!game.character?<section style={style}><h2>Mandatory character registration</h2><p>You must allocate all starting points and choose a profession before taking jobs.</p>
    <form onSubmit={register}><label>Character name <input required maxLength={50} minLength={2} value={name} onChange={e=>setName(e.target.value)} style={{display:"block",margin:"7px 0 15px",padding:9,width:"min(100%,420px)"}}/></label>
     <label>Starting profession <select value={profession} onChange={e=>setProfession(e.target.value)} style={{display:"block",margin:"7px 0 15px",padding:9}}>{professions.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
     <h3>Distribute points ({remaining} remaining)</h3>
     <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12,marginBottom:20}}>{fields.map(k=><div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><label>{k}</label><div style={{display:"flex",alignItems:"center",gap:10}}><button type="button" disabled={attrs[k]<=base} onClick={()=>changeAttr(k,-1)}>−</button><b>{attrs[k]}</b><button type="button" disabled={attrs[k]>=max||remaining<=0} onClick={()=>changeAttr(k,1)}>+</button></div></div>)}</div>
     <button type="submit" disabled={remaining!==0||name.trim().length<2}>Create character</button>
    </form></section>:<>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginBottom:16}}>
     <section style={style}><Shield size={20}/><h2 style={{margin:"8px 0"}}>{game.character.name}</h2><p>{game.character.profession_id} · Level {game.character.level}</p><strong>{format(game.character.xp)} XP</strong><p>Health {game.character.health} · Stamina {game.character.stamina}</p></section>
     <section style={style}><Wallet size={20}/><h2>{format(game.wallet)} CC</h2><p>Personal credits</p><small>Fictional currency, no cash value</small></section>
     <section style={style}><Hammer size={20}/><h2>Project Reclamation</h2><p>{game.projects.filter(p=>p.state==="active").length} active phase(s)</p><small>Bunker restoration effort</small></section>
    </div>
    <section style={{...style,marginBottom:16}}><h2><BriefcaseBusiness size={20} style={{display:"inline",verticalAlign:"middle"}}/> Available work orders</h2>
     <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:10}}>
      {game.tasks.filter(t=>!t.profession_id||t.profession_id===game.character?.profession_id).map(t=><article key={t.id} style={{border:"1px solid #34404b",borderRadius:7,padding:12}}>
       <strong>{t.title}</strong><p>{t.description}</p><p style={{fontSize:13,color:"#a9b5c0"}}>{t.duration_minutes} min · {t.character_xp} XP · {t.profession_xp} profession XP · {format(t.pay_credits)} CC</p>
       <button type="button" onClick={()=>void run("task.accept",{id:t.id})}>Accept job</button>
      </article>)}
     </div></section>
    <section style={{...style,marginBottom:16}}><h2>My work orders</h2>{game.orders.length===0?<p>No accepted jobs yet.</p>:game.orders.map(o=><div key={o.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,borderBottom:"1px solid #34404b",padding:"10px 0"}}>
     <span>{o.title} · {o.status} {o.due_at?"· due "+new Date(o.due_at).toLocaleString():""}</span>
     {o.status==="in_progress"&&<button type="button" disabled={Boolean(o.due_at&&Date.now()<new Date(o.due_at).getTime())} onClick={()=>void run("task.complete",{id:o.id})}>Complete</button>}
    </div>)}</section>
    <section style={{...style,marginBottom:16}}><h2><Dices size={20} style={{display:"inline"}}/> Dice terminal</h2><p>Cryptographically generated and permanently recorded on the server.</p>
     <label>Die <select value={dice} onChange={e=>setDice(Number(e.target.value))}>{[4,6,8,10,12,20,100].map(n=><option value={n} key={n}>d{n}</option>)}</select></label>{" "}
     <label>Modifier <input type="number" min={-100} max={100} value={modifier} onChange={e=>setModifier(Number(e.target.value))} style={{width:65}}/></label>{" "}
     <button type="button" onClick={()=>void run("dice.roll",{sides:dice,count:1,modifier,purpose:"Free roll"})}>Roll</button>
     {diceResult&&<p role="status">Rolled {diceResult.faces.join(", ")} · Total <strong>{diceResult.total}</strong></p>}
    </section>
   </>}
   <section style={{...style,marginBottom:16}}><h2>Restoration milestones</h2>
    <p>Complete paid jobs to earn work units. Deliver salvaged materials from your carry inventory to advance construction.</p>
    {game.projects.map(p=><article key={p.id} style={{borderBottom:"1px solid #34404b",padding:"14px 0"}}>
     <strong>{p.title}</strong> <small>Phase {p.phase} · {p.state}</small>
     {Object.entries(p.requirements||{}).map(([item,needed])=>{
       const current=Number(p.progress?.[item]||0),remaining=Math.max(0,Number(needed)-current);
       return <div key={item} style={{display:"flex",alignItems:"center",gap:10,margin:"7px 0",flexWrap:"wrap"}}>
        <span style={{minWidth:220}}>{item.replaceAll("_"," ")}: {current}/{needed}</span>
        <progress value={current} max={Number(needed)} />
        {game.character&&p.state==="active"&&item!=="work_units"&&remaining>0&&<>
          <input type="number" aria-label={item+" donation quantity"} min={1} max={remaining} style={{width:78}} value={donations[p.id+":"+item]||1} onChange={e=>setDonations({...donations,[p.id+":"+item]:Number(e.target.value)})}/>
          <button type="button" onClick={()=>void run("project.contribute",{projectId:p.id,item,quantity:donations[p.id+":"+item]||1})}>Donate</button>
        </>}
       </div>
     })}
     {game.overseer&&p.state==="active"&&Object.entries(p.requirements||{}).every(([item,n])=>Number(p.progress?.[item]||0)>=Number(n))&&
       <button type="button" onClick={()=>void run("project.finalize",{id:p.id})}>Complete phase and open next sector</button>}
    </article>)}
   </section>
   {game.overseer&&<section style={style}><h2>Overseer: work-order editor</h2><p>Treasury: {format(game.overseer.treasury)} CC</p><label>Existing work orders <select value={editingTask?.id||""} onChange={e=>{const found=(game.overseer?.taskTemplates||[]).find((t:Task&{version?:number;status?:string})=>t.id===e.target.value) as (Task&{version?:number;status?:string})|undefined;if(!found){setEditingTask(null);setTask({title:"",profession:"carpenter",description:"",completionType:"timer",minutes:15,xp:35,skillXp:25,pay:350});return;}setEditingTask({id:found.id,version:found.version||1,status:found.status||"published"});setTask({title:found.title,profession:found.profession_id||"carpenter",description:found.description||"",completionType:found.completion_type,minutes:found.duration_minutes,xp:found.character_xp,skillXp:found.profession_xp,pay:Number(found.pay_credits)});}}><option value="">Create new task</option>{(game.overseer.taskTemplates||[]).map(x=><option value={x.id} key={x.id}>{x.title}</option>)}</select></label><form onSubmit={addTask} style={{display:"grid",gap:12,maxWidth:640}}>
    <label>Task title <input required value={task.title} onChange={e=>setTask({...task,title:e.target.value})}/></label>
    <label>Profession <select value={task.profession} onChange={e=>setTask({...task,profession:e.target.value})}>{professions.map(p=><option key={p}>{p}</option>)}</select></label>
    <label>Description <input value={task.description} onChange={e=>setTask({...task,description:e.target.value})}/></label>
    <label>Completion <select value={task.completionType} onChange={e=>setTask({...task,completionType:e.target.value})}>{["timer","quiz","dice","collaborative","dm_approval"].map(p=><option key={p}>{p}</option>)}</select></label>
    {([["minutes","Duration (minutes)"],["xp","Character XP"],["skillXp","Profession XP"],["pay","Payment (CC)"]] as const).map(([k,label])=><label key={k}>{label} <input type="number" min={0} max={k==="minutes"?10080:k==="pay"?1000000000:100000} value={task[k]} onChange={e=>setTask({...task,[k]:Number(e.target.value)})}/></label>)}
    {editingTask&&<label>Task status <select value={editingTask.status} onChange={e=>setEditingTask({...editingTask,status:e.target.value})}>{["draft","published","paused","retired"].map(x=><option key={x}>{x}</option>)}</select></label>}
    <button type="submit">{editingTask?"Save changes":"Publish new task"}</button>
   </form></section>}
   <ReclamationSystems game={game} run={run}/>
  </>}
 </div>;
}
