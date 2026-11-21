import {useCallback,useEffect,useState} from "react";
import {Activity,ArrowUpRight,Ban,Bot,Gamepad2,Hash,History,Shield,Users,Zap} from "lucide-react";
import "./OperationsSnapshot.css";
type OpEvent={id:string;operation:string;actor_name:string;state:string;created_at:string;error?:string|null};
type Summary={
 member_count:number|null;active_humans:number;active_bots:number;cached_members:number;
 bot_channel_snapshot_count:number;channel_snapshot_at:string|null;last_heartbeat:string|null;
 residents:number;trivia_results:number;heists:number;work_orders:number;
 commands:OpEvent[];
};
export default function OperationsSnapshot(){
 const [data,setData]=useState<Summary|null>(null);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
  try{
   const r=await fetch("/api/discord-bot?action=operations_summary",{cache:"no-store"});
   const d=await r.json();
   if(!r.ok)throw Error(d.error||"Discord operations unavailable");
   setData(d);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Discord operations unavailable")}
 },[]);
 useEffect(()=>{void load()},[load]);
 const cards=[
  {label:"Discord members",value:data?.member_count,description:"Bot-reported server member count",icon:Users,to:"/admin/discord/members"},
  {label:"Channel snapshot",value:data?.bot_channel_snapshot_count,description:"Bot-visible channels, not total guild channels",icon:Hash,to:"/admin/discord/channels"},
  {label:"Compound residents",value:data?.residents,description:"Database resident profiles",icon:Gamepad2,to:"/admin/games"},
  {label:"Recorded heists",value:data?.heists,description:"Heist sessions in database",icon:Zap,to:"/admin/heist"},
  {label:"Trivia results",value:data?.trivia_results,description:"Recorded trivia results",icon:Activity,to:"/admin/games"},
  {label:"Work orders",value:data?.work_orders,description:"Existing game work orders",icon:Bot,to:"/admin/games"}
 ];
 return <section className="ops-snapshot" aria-label="Discord and game operations">
  <header><h3><Activity size={17}/> SERVER & GAME OPERATIONS</h3><span>{data?.last_heartbeat? `Bot heartbeat: ${new Date(data.last_heartbeat).toLocaleString()}`:"Server snapshot not yet available"}</span></header>
  <div className="ops-cards">{cards.map(x=><a href={x.to} key={x.label}><x.icon size={19}/><span><b>{x.value===undefined||x.value===null?"—":x.value.toLocaleString()}</b><strong>{x.label}</strong><small>{x.description}</small></span><ArrowUpRight size={14}/></a>)}</div>
  <div className="ops-lower">
   <div><h4><Shield size={16}/> MODERATION & MEMBERS</h4><div className="ops-quick">
    <a href="/admin/discord/members"><Users size={16}/> Member list, kick, timeout & roles</a>
    <a href="/admin/discord/bans"><Ban size={16}/> Bans and unbans</a>
    <a href="/admin/discord/roles"><Shield size={16}/> Role management</a>
    <a href="/admin/discord/history"><History size={16}/> Discord action history</a>
   </div></div>
   <div><h4><History size={16}/> RECENT ADMIN ACTIONS</h4>
    <div className="ops-events">{data?.commands?.length?data.commands.slice(0,4).map(e=><a href="/admin/discord/history" key={e.id}><span><b>{e.operation.replaceAll("."," / ")}</b><small>{e.actor_name} · {e.state}</small></span><time>{new Date(e.created_at).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time></a>):<p>No recent Discord commands recorded.</p>}</div>
   </div>
  </div>
  {error&&<p className="ops-error">Live operations data unavailable: {error}. Existing Discord controls remain accessible.</p>}
 </section>;
}
