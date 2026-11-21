import { useCallback, useEffect, useState } from "react";
import {
 Activity, ArrowUpRight, Bot, CheckCircle2, ChevronRight, CircleAlert,
 Clock3, Database, ExternalLink, FileText, Flag, Gamepad2, HardDrive,
 Hash, Layers3, Radio, RefreshCw, Send, ShieldCheck, Users, Wifi,
 Zap
} from "lucide-react";
import { adminApi, type StorageStatus } from "./adminApi";
import "./CommandCenter.css";

type Delivery={id:string;state:string;updated_at:string;last_error:string|null;title:string;kind:string;channel_name:string};
type Report={summary:{website_posts:number;active_channels:number;delivered:number;attention:number};deliveries:Delivery[]};
type Health={connected:boolean;initialized:boolean;needs_upgrade?:boolean};
const when=(s:string)=>{const d=new Date(s);return Number.isNaN(d.getTime())?"Unknown":d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});};
function Meter({label,value,max,icon:Icon,detail,tone="green"}:{label:string;value:number|null;max:number;icon:typeof Activity;detail:string;tone?:string}){
 const pct=value===null?0:Math.min(100,Math.max(0,Math.round(value/Math.max(1,max)*100)));
 return <div className="cc-meter">
   <div className={`cc-ring cc-${tone}`} style={{"--cc-progress":`${pct}%`} as React.CSSProperties}>
     <div className="cc-ring-inner"><Icon size={16}/><strong>{value===null?"—":value.toLocaleString()}</strong><span>{label}</span></div>
   </div><small>{detail}</small>
 </div>;
}
function Panel({heading,icon:Icon,children,link}:{heading:string;icon:typeof Activity;children:React.ReactNode;link?:string}){
 return <section className="cc-panel"><div className="cc-panel-head"><h3><Icon size={17}/>{heading}</h3>{link&&<a href={link} aria-label={`Open ${heading}`}><ArrowUpRight size={16}/></a>}</div>{children}</section>;
}
export default function CommandCenter({owner}:{owner:boolean}){
 const [report,setReport]=useState<Report|null>(null);
 const [health,setHealth]=useState<Health|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [filter,setFilter]=useState("all");
 const [stamp,setStamp]=useState<Date|null>(null);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const [r,h]=await Promise.allSettled([adminApi<Report>("reports"),adminApi<StorageStatus>("status")]);
  if(r.status==="fulfilled")setReport(r.value);else setError("Publishing reports are temporarily unavailable.");
  if(h.status==="fulfilled")setHealth(h.value);else setError(e=>e?e+" Database status is unavailable.":"Database status is unavailable.");
  setStamp(new Date());setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);
 const deliveries=report?.deliveries??[];
 const selected=deliveries.filter(x=>filter==="all"||(filter==="attention"? !["delivered","sent","success","published","done"].includes(x.state):x.kind===filter));
 const done=deliveries.filter(x=>["delivered","sent","success","published","done"].includes(x.state));
 const pending=deliveries.filter(x=>!["delivered","sent","success","published","done"].includes(x.state));
 const stats=report?.summary;
 const active=health?.connected&&health?.initialized&&!health?.needs_upgrade;
 return <div className="cc-shell">
  <div className="cc-topline"><div><span className="cc-kicker">C0N / ADMIN INFRASTRUCTURE</span><h2>Command Center <span className="cc-pulse"/></h2><p>Community operations, publishing and Discord delivery in one place.</p></div>
   <div className="cc-top-actions"><span className={`cc-status ${active?"cc-good":"cc-warn"}`}><span className="cc-status-dot"/>{health===null?"Checking systems":active?"Storage operational":"Storage needs attention"}</span><button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15} className={loading?"cc-spin":""}/> Refresh</button></div>
  </div>
  {error&&<p className="cc-error" role="status"><CircleAlert size={15}/>{error}</p>}
  <div className="cc-metrics">
   <Meter label="Website posts" value={stats?.website_posts??null} max={Math.max(stats?.website_posts??1,10)} icon={FileText} detail="Publishing inventory"/>
   <Meter label="Active channels" value={stats?.active_channels??null} max={Math.max(stats?.active_channels??1,10)} icon={Hash} detail="Connected channels"/>
   <Meter label="Deliveries" value={stats?.delivered??null} max={Math.max((stats?.delivered??0)+(stats?.attention??0),1)} icon={Send} detail="Reported successful deliveries"/>
   <Meter label="Need attention" value={stats?.attention??null} max={Math.max((stats?.delivered??0)+(stats?.attention??0),1)} icon={Flag} detail="Requires review" tone="amber"/>
   <Meter label="Database" value={health===null?null:active?1:0} max={1} icon={Database} detail={active?"Connected and initialized":"Check storage status"} tone={active?"green":"amber"}/>
  </div>
  <div className="cc-stage">
   <Panel heading="Services & automation" icon={Zap}>
    <div className="cc-services">
     {[
      {label:"Discord bot",desc:"Configuration and server controls",icon:Bot,href:"/admin/discord"},
      {label:"Campfire Questions",desc:"Schedule via /campfire interval",icon:Radio,href:"/admin/discord"},
      {label:"The Heist",desc:"Manage game rules",icon:Gamepad2,href:"/admin/heist"},
      {label:"Reaction roles",desc:"Discord role assignment",icon:ShieldCheck,href:"/admin/discord/reaction-roles"},
      {label:"Publishing channels",desc:"Webhooks and channel delivery",icon:Wifi,href:"/admin/webhooks"}
     ].map(s=><a className="cc-service" href={s.href} key={s.label}><span className="cc-service-icon"><s.icon size={20}/></span><span><strong>{s.label}</strong><small>{s.desc}</small></span><ChevronRight size={16}/></a>)}
    </div>
    <div className="cc-health"><b>CONNECTION HEALTH</b><div><span><Database size={14}/>Publishing database</span><em className={active?"good":"warn"}>{health===null?"Checking…":active?"Connected":"Check required"}</em></div><div><span><HardDrive size={14}/>Storage schema</span><em className={health?.initialized&&!health?.needs_upgrade?"good":"warn"}>{health===null?"Checking…":health.initialized&&!health.needs_upgrade?"Ready":"Needs setup"}</em></div></div>
   </Panel>
   <Panel heading="Happening now" icon={Activity} link="/admin/reports">
    <div className="cc-filter">{[{id:"all",label:"All"},{id:"update",label:"Transmissions"},{id:"project",label:"Projects"},{id:"attention",label:"Needs attention"}].map(f=><button type="button" key={f.id} className={filter===f.id?"selected":""} onClick={()=>setFilter(f.id)}>{f.label}</button>)}</div>
    <div className="cc-activity">
     {selected.length?selected.slice(0,6).map(d=><article key={d.id}><span className={`cc-event-dot ${["delivered","sent","success","published","done"].includes(d.state)?"positive":"caution"}`}/><div><div className="cc-event-title">{d.title||"Untitled transmission"}<span>{d.kind||"delivery"}</span></div><p>{d.channel_name||"No channel"} · {d.state}{d.last_error?` · ${d.last_error}`:""}</p></div><time>{when(d.updated_at)}</time></article>):<div className="cc-empty">{loading?"Loading recent activity…":"No activity for this filter. Delivery history will appear here once available."}</div>}
    </div>
    <div className="cc-panel-foot"><span><span className="cc-dot"/> {stamp?`Updated ${stamp.toLocaleTimeString()}`:"Checking latest records"}</span><a href="/admin/reports">Full delivery history <ArrowUpRight size={14}/></a></div>
   </Panel>
   <Panel heading="Recently finished" icon={CheckCircle2} link="/admin/reports">
    <div className="cc-completed">{done.slice(0,6).map(d=><article key={d.id}><CheckCircle2 size={17}/><div><strong>{d.title||"Untitled post"}</strong><small>{d.channel_name||"Publishing"} · {d.state}</small></div><time>{when(d.updated_at)}</time></article>)}{done.length===0&&<div className="cc-empty">{loading?"Loading recent deliveries…":"No recent completed deliveries reported."}</div>}</div>
   </Panel>
  </div>
  <div className="cc-bottom">
   <Panel heading="Needs attention" icon={Flag} link="/admin/reports"><div className="cc-list">{pending.slice(0,4).map(d=><a key={d.id} href="/admin/reports"><span className="cc-warn-mark"/><span><strong>{d.title||"Publishing delivery"}</strong><small>{d.state} · {d.channel_name||"Unknown channel"}</small></span><time>{when(d.updated_at)}</time></a>)}{pending.length===0&&<p className="cc-empty">No delivery issues in the recent report.</p>}</div></Panel>
   <Panel heading="Community" icon={Users}><div className="cc-links"><a href="/admin/discord/members"><Users size={17}/>Server members<ChevronRight size={15}/></a><a href="/admin/project"><Layers3 size={17}/>Featured projects<ChevronRight size={15}/></a><a href="/admin/approvals"><ShieldCheck size={17}/>Project approvals<ChevronRight size={15}/></a><a href="/admin/staff"><ShieldCheck size={17}/>Staff permissions<ChevronRight size={15}/></a></div></Panel>
   <Panel heading="Publishing snapshot" icon={Radio}><div className="cc-snapshot"><div><span>Website posts</span><strong>{stats?.website_posts??"—"}</strong></div><div><span>Active channels</span><strong>{stats?.active_channels??"—"}</strong></div><div><span>Delivered</span><strong>{stats?.delivered??"—"}</strong></div><div><span>Attention</span><strong>{stats?.attention??"—"}</strong></div></div><a className="cc-card-cta" href="/admin/update">Create transmission <ArrowUpRight size={15}/></a></Panel>
   <Panel heading="Operations" icon={Clock3}><div className="cc-links"><a href="/admin/audit"><FileText size={17}/>Content history<ChevronRight size={15}/></a><a href="/admin/discord/history"><Activity size={17}/>Discord action history<ChevronRight size={15}/></a><a href="/admin/heist"><Gamepad2 size={17}/>Heist settings<ChevronRight size={15}/></a>{owner&&<a href="https://thecompound.cultofnixon.com/operations"><ExternalLink size={17}/>Compound operations<ChevronRight size={15}/></a>}</div></Panel>
  </div>
  <div className="cc-footnote">LIVE DATA FROM C0N PUBLISHING API · No simulated activity or fabricated counts · Other admin pages retain their current design.</div>
 </div>;
}
