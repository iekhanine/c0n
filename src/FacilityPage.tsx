import {useEffect,useState,type FormEvent} from "react";
import {Check,Package,Radio,Shield,ClipboardList,BriefcaseBusiness,Gauge,ScrollText,Archive} from "lucide-react";
import ArchivePage from "./ArchivePage";
import "./FacilityPage.css";
type Entry={id:string;sku:string;cost:number;status:string;note:string;review:string;created_at:string;member_id?:string;member_name?:string;};
type Assignment={id:string;request_id:string;duty:string;status:string;report:string;created_at:string;member_id?:string;member_name?:string};
type Catalog={id:string;label:string;cost:number;qty:number};
type Duty={id:string;title:string;credits:number;xp:number;sector:string;question:string};
type State={wallet:{credits:number;xp:number;earnedVotes:number;reputation:number};requests:Entry[];assignments:Assignment[];inventory:{item:string;quantity:number}[];progress:{sector:string;completed:number;goal:number}[];directive:string;catalog:Catalog[];duties:Duty[]};
type Control={requests:Entry[];assignments:Assignment[];members:{user_id:string;codename:string;member_no:number}[];grants:{id:string;member_id:string;member_name:string;item:string;quantity:number;note:string;created_at:string}[]};
async function request<T>(action:string,method="GET",body?:unknown):Promise<T>{
 const response=await fetch("/api/social?action=facility_"+action,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(!response.ok)throw Error(result.error||"Facility unavailable");return result as T;
}
export default function FacilityPage({control=false}:{control?:boolean}){
 const [data,setData]=useState<State|null>(null),[admin,setAdmin]=useState<Control|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [section,setSection]=useState<"overview"|"requisitions"|"assignments"|"supplies"|"directives"|"archive">("overview");
 const [grantMember,setGrantMember]=useState(""),[grantItem,setGrantItem]=useState("water"),[grantQty,setGrantQty]=useState(1),[grantNote,setGrantNote]=useState("");
 const [choice,setChoice]=useState("water"),[comment,setComment]=useState(""),[selectedJob,setSelectedJob]=useState("water"),[report,setReport]=useState<Record<string,string>>({}),[answer,setAnswer]=useState<Record<string,string>>({}),[directive,setDirective]=useState("");
 async function refresh(){try{const state=await request<State>("state");setData(state);setDirective(state.directive);if(control)setAdmin(await request<Control>("control"));setError("");}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{void refresh()},[control]);
 async function act(action:string,body:unknown){setNotice("");try{await request(action,"POST",body);setNotice("Request processed.");await refresh()}catch(e){setNotice((e as Error).message)}}
 const item=data?.catalog.find(x=>x.id===choice);

 const tabs: Array<{id:typeof section;label:string;icon:typeof Gauge}>=[
  {id:"overview",label:"Overview",icon:Gauge},
  {id:"requisitions",label:"Requisitions",icon:ClipboardList},
  {id:"assignments",label:"Assignments",icon:BriefcaseBusiness},
  {id:"supplies",label:"Supplies & credits",icon:Package},
  {id:"directives",label:"Directives",icon:ScrollText},
  {id:"archive",label:"The Archive",icon:Archive},
 ];
 return <div className={`facility-page ${control?"facility-admin":"facility-member"}`}>
  <div className="facility-header"><div><span>ᴄ0ɴ / ꜰᴀᴄɪʟɪᴛʏ ꜱʏꜱᴛᴇᴍꜱ</span><h1>{control?"The Compound · Overseer Control":"The Compound · Operations"}</h1><p>{control?"RESTRICTED WORKSPACE":"SUPPLIES · FUNDS · ASSIGNMENTS"}</p></div><Shield size={24}/></div>
  {loading?<p>Connecting to facility systems…</p>:error?<p role="alert">{error}</p>:data&&<div className="facility-workspace">
   <nav className="facility-section-menu" aria-label="Facility systems">
    <span>FACILITY SYSTEMS</span>
    {tabs.map(t=><button key={t.id} type="button" aria-current={section===t.id?"page":undefined} onClick={()=>setSection(t.id)}><t.icon size={17}/>{t.label}</button>)}
    <small>{control?"PRIVATE CONTROL DESK":"MEMBER TERMINAL"}</small>
   </nav>
   <div className="facility-workspace-body">
    {notice&&<p className="facility-notice" role="status">{notice}</p>}
    {section==="overview"&&<>
     <h2>Facility overview</h2>
     <div className="facility-balances"><div><span>CREDITS</span><strong>{data.wallet.credits}</strong></div><div><span>XP</span><strong>{data.wallet.xp}</strong></div><div><span>REPUTATION</span><strong>{data.wallet.reputation}</strong></div><div><span>VOTES EARNED</span><strong>{data.wallet.earnedVotes}</strong></div></div>
     <section className="facility-progress"><strong>RESTORATION STATUS</strong><div>{data.progress.map(p=><div key={p.sector}><span>{p.sector.toUpperCase()} · {p.completed}/{p.goal}</span><div className="facility-progress-bar"><i style={{width:Math.min(100,p.completed/p.goal*100)+"%"}}/></div></div>)}</div></section>
     <section className="facility-announcement"><Radio size={18}/><div><strong>FACILITY DIRECTIVE</strong><p>{data.directive}</p></div></section>
     {control&&<div className="facility-summary-counts"><button onClick={()=>setSection("requisitions")}>{admin?.requests.filter(r=>r.status==="pending").length||0} pending requisitions</button><button onClick={()=>setSection("assignments")}>{admin?.assignments.filter(a=>a.status==="submitted").length||0} reports awaiting review</button></div>}
    </>}
    {section==="requisitions"&&(control?<section><h2>Member requisitions</h2>{!admin?.requests.some(r=>["pending","assigned"].includes(r.status))&&<p>No pending requests.</p>}
      {admin?.requests.filter(r=>["pending","assigned"].includes(r.status)).map(r=><article className="facility-row" key={r.id}><strong>{r.member_name||"Member"} · {data.catalog.find(c=>c.id===r.sku)?.label||r.sku}</strong><span>${r.cost} · {r.status}</span><p>{r.note}</p>{r.status==="pending"&&<div className="facility-actions"><button onClick={()=>void act("decide",{id:r.id,approve:true})}><Check size={14}/> Approve</button><button onClick={()=>void act("decide",{id:r.id,approve:false})}>Deny</button><select aria-label="Conditional duty" value={selectedJob} onChange={e=>setSelectedJob(e.target.value)}>{data.duties.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select><button onClick={()=>void act("assign",{id:r.id,duty:selectedJob})}>Assign duty</button></div>}</article>)}
     </section>:<section><h2>Request supplies</h2><p>Credits are spent only when a request is approved. XP and reputation are never spent.</p><div className="facility-catalog">{data.catalog.map(c=><button type="button" className={choice===c.id?"active":""} key={c.id} onClick={()=>setChoice(c.id)}><span>{c.label}</span><strong>{c.cost} CR</strong></button>)}</div><form onSubmit={(e:FormEvent)=>{e.preventDefault();void act("request",{sku:choice,note:comment});setComment("")}}><label>Note to Facility Control<textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} maxLength={400}/></label><button disabled={!item||data.wallet.credits<item.cost} type="submit">Request allocation</button></form></section>)}
    {section==="assignments"&&(control?<section><h2>Field reports</h2>{!admin?.assignments.some(a=>a.status==="submitted")&&<p>No reports awaiting review.</p>}{admin?.assignments.filter(a=>a.status==="submitted").map(a=><article className="facility-row" key={a.id}><strong>{a.member_name||"Member"} · {data.duties.find(d=>d.id===a.duty)?.title}</strong><p>{a.report}</p><div className="facility-actions"><button onClick={()=>void act("review",{id:a.id,approve:true})}>Verify & reward</button><button onClick={()=>void act("review",{id:a.id,approve:false})}>Return</button></div></article>)}</section>:<section><h2>My assignments</h2>{data.assignments.length===0&&<p>No work orders assigned.</p>}{data.assignments.map(a=>{const duty=data.duties.find(x=>x.id===a.duty);return <article className="facility-row" key={a.id}><strong>{duty?.title||"Work order"}</strong><span>{a.status.toUpperCase()} · +${duty?.credits} · +{duty?.xp} XP</span>{a.status==="assigned"&&<form onSubmit={e=>{e.preventDefault();void act("submit",{id:a.id,answer:answer[a.id]||"",report:report[a.id]||""})}}><p>{duty?.question}</p><input aria-label="Answer" placeholder="Verification sequence" value={answer[a.id]||""} onChange={e=>setAnswer(v=>({...v,[a.id]:e.target.value}))}/><textarea placeholder="Completion report" value={report[a.id]||""} onChange={e=>setReport(v=>({...v,[a.id]:e.target.value}))}/><button type="submit">Submit report</button></form>}</article>})}</section>)}
    {section==="supplies"&&<section><h2>{control?"Requisition history":"My supply inventory"}</h2><div className="facility-inventory"><Package size={16}/><span>ISSUED SUPPLIES</span>{data.inventory.length?data.inventory.map(i=><span key={i.item}>{i.item}: {i.quantity}</span>):<span>None issued</span>}</div>{control&&<div className="facility-grants">
  <h2>Issue items to a member</h2>
  <p>Direct allocations bypass member requisitions and do not deduct credits.</p>
  <form onSubmit={async e=>{e.preventDefault();if(!grantMember)return;await act("grant",{member_id:grantMember,sku:grantItem,quantity:grantQty,note:grantNote});setGrantNote("")}}>
   <label>Recipient<select required value={grantMember} onChange={e=>setGrantMember(e.target.value)}><option value="">Select member</option>{admin?.members.map(m=><option key={m.user_id} value={m.user_id}>{m.codename} · #{String(m.member_no).padStart(4,"0")}</option>)}</select></label>
   <label>Item<select value={grantItem} onChange={e=>setGrantItem(e.target.value)}>{data.catalog.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
   <label>Quantity<input type="number" min="1" max="100" required value={grantQty} onChange={e=>setGrantQty(Number(e.target.value))}/></label>
   <label>Allocation note<textarea value={grantNote} maxLength={400} onChange={e=>setGrantNote(e.target.value)}/></label>
   <button type="submit" disabled={!grantMember}>Issue items</button>
  </form>
  <h2>Recent direct allocations</h2>
  {admin?.grants.map(g=><div className="facility-history-row" key={g.id}><span>{g.member_name||"Member"} · {g.item} × {g.quantity}</span><small>{g.note}</small></div>)}
 </div>}<div className="facility-history"><h2>{control?"All requisitions":"My requisition history"}</h2>{(control?admin?.requests||[]:data.requests).map(r=><div className="facility-history-row" key={r.id}><span>{data.catalog.find(c=>c.id===r.sku)?.label||r.sku}</span><small>{r.status}</small><small>{r.review}</small></div>)}</div></section>}
    {section==="archive"&&<ArchivePage />}
    {section==="directives"&&<section><h2>Facility directives</h2><section className="facility-announcement"><Radio size={18}/><p>{data.directive}</p></section>{control&&<><label>Issue a new directive<textarea value={directive} onChange={e=>setDirective(e.target.value)} maxLength={1200} rows={5}/></label><button onClick={()=>void act("directive",{directive})}>Publish directive</button></>}</section>}

   </div>
  </div>}
 </div>;
}
