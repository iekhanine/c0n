import {useEffect,useState,type FormEvent} from "react";
import {Activity,Check,ChevronDown,ClipboardList,LockKeyhole,Package,Radio,Shield,RefreshCw} from "lucide-react";
import "./FacilityPage.css";
type Entry={id:string;sku:string;cost:number;status:string;note:string;review:string;created_at:string;member_id?:string;member_name?:string;};
type Assignment={id:string;request_id:string;duty:string;status:string;report:string;created_at:string;member_id?:string;member_name?:string};
type Catalog={id:string;label:string;cost:number;qty:number};
type Duty={id:string;title:string;credits:number;xp:number;sector:string;question:string};
type State={wallet:{credits:number;xp:number;earnedVotes:number;reputation:number};requests:Entry[];assignments:Assignment[];inventory:{item:string;quantity:number}[];directive:string;catalog:Catalog[];duties:Duty[]};
type Control={requests:Entry[];assignments:Assignment[]};
async function request<T>(action:string,method="GET",body?:unknown):Promise<T>{
 const response=await fetch("/api/social?action=facility_"+action,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(!response.ok)throw Error(result.error||"Facility unavailable");return result as T;
}
export default function FacilityPage({control=false}:{control?:boolean}){
 const [data,setData]=useState<State|null>(null),[admin,setAdmin]=useState<Control|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [choice,setChoice]=useState("water"),[comment,setComment]=useState(""),[selectedJob,setSelectedJob]=useState("water"),[report,setReport]=useState<Record<string,string>>({}),[answer,setAnswer]=useState<Record<string,string>>({}),[directive,setDirective]=useState("");
 async function refresh(){try{const state=await request<State>("state");setData(state);setDirective(state.directive);if(control)setAdmin(await request<Control>("control"));setError("");}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{void refresh()},[control]);
 async function act(action:string,body:unknown){setNotice("");try{await request(action,"POST",body);setNotice("Request processed.");await refresh()}catch(e){setNotice((e as Error).message)}}
 const item=data?.catalog.find(x=>x.id===choice);
 return <div className="facility-page">
   <div className="facility-header"><div><span>ᴄ0ɴ / ꜱᴇᴄᴛᴏʀ ᴢᴇʀᴏ</span><h1>{control?"Facility Control":"ꜱᴜᴘᴘʟʏ ᴛᴇʀᴍɪɴᴀʟ"}</h1><p>{control?"RESTRICTED OPERATIONS DESK":"AUTHORITY UNDISCLOSED · ALL RESOURCES ARE FICTIONAL"}</p></div><Shield size={24}/></div>
   {loading?<p>Connecting to the supply terminal…</p>:error?<p role="alert">{error}</p>:data&&<>
     <div className="facility-balances"><div><span>CREDITS</span><strong>{data.wallet.credits}</strong></div><div><span>XP</span><strong>{data.wallet.xp}</strong></div><div><span>REPUTATION</span><strong>{data.wallet.reputation}</strong></div><div><span>VOTES EARNED</span><strong>{data.wallet.earnedVotes}</strong></div></div>
     <section className="facility-announcement"><Radio size={18}/><div><strong>FACILITY DIRECTIVE</strong><p>{data.directive}</p></div></section>
     {notice&&<p className="facility-notice" role="status">{notice}</p>}
     {control?<div className="facility-columns">
       <section><h2>Pending Requisitions</h2>{!admin?.requests.some(r=>["pending","assigned"].includes(r.status))&&<p>No pending requests.</p>}
         {admin?.requests.filter(r=>["pending","assigned"].includes(r.status)).map(r=><article className="facility-row" key={r.id}>
           <strong>{r.member_name||"Member"} · {data.catalog.find(c=>c.id===r.sku)?.label||r.sku}</strong><span>{r.cost} credits · {r.status}</span><p>{r.note}</p>
           {r.status==="pending"&&<div className="facility-actions">
             <button onClick={()=>void act("decide",{id:r.id,approve:true})}><Check size={14}/> Approve</button>
             <button onClick={()=>void act("decide",{id:r.id,approve:false})}>Deny</button>
             <select aria-label="Conditional duty" value={selectedJob} onChange={e=>setSelectedJob(e.target.value)}>{data.duties.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select>
             <button onClick={()=>void act("assign",{id:r.id,duty:selectedJob})}>Assign duty</button>
           </div>}
         </article>)}
       </section>
       <section><h2>Field Reports</h2>{!admin?.assignments.some(a=>a.status==="submitted")&&<p>No reports waiting.</p>}
         {admin?.assignments.filter(a=>a.status==="submitted").map(a=><article className="facility-row" key={a.id}><strong>{a.member_name||"Member"} · {data.duties.find(d=>d.id===a.duty)?.title}</strong><p>{a.report}</p><div className="facility-actions"><button onClick={()=>void act("review",{id:a.id,approve:true})}>Verify & reward</button><button onClick={()=>void act("review",{id:a.id,approve:false})}>Return</button></div></article>)}
         <h2>Issue Directive</h2><textarea value={directive} onChange={e=>setDirective(e.target.value)} maxLength={1200} rows={4}/><button onClick={()=>void act("directive",{directive})}>Publish directive</button>
       </section>
     </div>:<div className="facility-columns">
       <section><h2>Supply Requisition</h2><p>Credits are spent only after approval. XP and reputation are not spent.</p>
         <div className="facility-catalog">{data.catalog.map(c=><button type="button" className={choice===c.id?"active":""} key={c.id} onClick={()=>setChoice(c.id)}><span>{c.label}</span><strong>{c.cost} CR</strong></button>)}</div>
         <form onSubmit={(e:FormEvent)=>{e.preventDefault();void act("request",{sku:choice,note:comment});setComment("")}}>
           <label>Note to Facility Control<textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} maxLength={400}/></label>
           <button disabled={!item||data.wallet.credits<item.cost} type="submit">Request allocation</button>
         </form>
       </section>
       <section><h2>My Assignments</h2>{data.assignments.length===0&&<p>No work orders assigned.</p>}
         {data.assignments.map(a=>{const duty=data.duties.find(x=>x.id===a.duty);return <article className="facility-row" key={a.id}>
           <strong>{duty?.title||"Work order"}</strong><span>{a.status.toUpperCase()} · +{duty?.credits} CR · +{duty?.xp} XP</span>
           {a.status==="assigned"&&<form onSubmit={e=>{e.preventDefault();void act("submit",{id:a.id,answer:answer[a.id]||"",report:report[a.id]||""})}}><p>{duty?.question}</p><input aria-label="Answer" placeholder="Verification sequence" value={answer[a.id]||""} onChange={e=>setAnswer(v=>({...v,[a.id]:e.target.value}))}/><textarea placeholder="Completion report" value={report[a.id]||""} onChange={e=>setReport(v=>({...v,[a.id]:e.target.value}))}/><button type="submit">Submit report</button></form>}
         </article>})}
       </section>
     </div>}
     <section className="facility-history"><h2>{control?"All Requisitions":"My Requisition History"}</h2>{(control?admin?.requests||[]:data.requests).map(r=><div className="facility-history-row" key={r.id}><span>{data.catalog.find(c=>c.id===r.sku)?.label||r.sku}</span><small>{r.status}</small><small>{r.review}</small></div>)}</section>
     <div className="facility-inventory"><Package size={16}/><span>ISSUED SUPPLIES</span>{data.inventory.length?data.inventory.map(i=><span key={i.item}>{i.item}: {i.quantity}</span>):<span>None issued</span>}</div>
     <footer>SIMULATED GAME ECONOMY · NO REAL-WORLD RESOURCE ALLOCATION</footer>
   </>}
 </div>
}
