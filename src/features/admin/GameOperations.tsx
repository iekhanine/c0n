import {useCallback,useEffect,useState} from "react";
import {Activity,ArrowUpRight,BookOpen,BriefcaseBusiness,Gamepad2,
 Hammer,HeartPulse,RefreshCw,Shield,Users,Wallet,Zap} from "lucide-react";
import "./GameOperations.css";

type Overview={
 residents:number;trivia_results:number;heists:number;work_orders:number;
};
const modules=[
 {name:"The Heist",subtitle:"Robbery economy, risk, payouts and cooldowns",
  to:"/admin/heist",icon:Wallet,tag:"RULES · IN-APP"},
 {name:"Trivia",subtitle:"Community trivia rounds and recorded results",
  to:"https://thecompound.cultofnixon.com/operations",icon:BookOpen,tag:"GAME OPERATIONS"},
 {name:"Residents & characters",subtitle:"Character attributes, apartments and residency",
  to:"https://thecompound.cultofnixon.com/admin/residents",icon:Users,tag:"MEMBER RECORDS"},
 {name:"Work orders",subtitle:"Jobs, production tasks and payouts",
  to:"https://thecompound.cultofnixon.com/overseer/work-orders",icon:Hammer,tag:"OVERSEER"},
 {name:"Campaigns & expeditions",subtitle:"Encounters and ongoing campaigns",
  to:"https://thecompound.cultofnixon.com/overseer/campaigns",icon:Shield,tag:"FIELD COMMAND"},
 {name:"Treasury & payroll",subtitle:"Game currency, economy and transactions",
  to:"https://thecompound.cultofnixon.com/overseer/finance",icon:BriefcaseBusiness,tag:"FINANCE"},
 {name:"Compound operations",subtitle:"Restoration, resources and system operations",
  to:"https://thecompound.cultofnixon.com/operations",icon:HeartPulse,tag:"COMMAND"}
];
export default function GameOperations(){
 const [data,setData]=useState<Overview|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/discord-bot?action=operations_summary",{cache:"no-store"});
   const value=await r.json();
   if(!r.ok)throw Error(value.error||"Game data unavailable");
   setData(value);
  }catch(e){setError(e instanceof Error?e.message:"Game data unavailable")}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const metrics=[
  ["Compound residents",data?.residents],["Trivia results",data?.trivia_results],
  ["Recorded heists",data?.heists],["Work orders",data?.work_orders]
 ] as const;
 return <section className="con-game-command">
  <div className="cgc-header"><div><span className="cgc-eyebrow"><Zap size={14}/> THE COMPOUND · OPERATIONS</span><h2>Game Administration</h2><p>One command directory for resident data, game systems, and Overseer operations. Existing game controls remain authoritative.</p></div><button type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh data</button></div>
  <div className="cgc-stats">{metrics.map(([name,value])=><div key={name}><span>{name}</span><strong>{value===undefined||value===null?"—":value.toLocaleString()}</strong><small>{loading?"Updating…":"Recorded database total"}</small></div>)}</div>
  {error&&<p className="cgc-warning" role="status">{error}. Existing game controls remain available through the links below.</p>}
  <div className="cgc-section-label"><Activity size={16}/> SYSTEMS & TOOLS <small>Only implemented management destinations are linked</small></div>
  <div className="cgc-grid">{modules.map(m=><a href={m.to} key={m.name} className="cgc-module"><div className="cgc-module-icon"><m.icon size={22}/></div><div><strong>{m.name}</strong><p>{m.subtitle}</p><small>{m.tag}</small></div><ArrowUpRight size={16}/></a>)}</div>
  <p className="cgc-notice"><Gamepad2 size={16}/> This panel aggregates existing game administration. No game rules, wallets, role assignments or member data are altered by opening it.</p>
 </section>;
}
