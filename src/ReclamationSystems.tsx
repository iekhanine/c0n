import { useState,type FormEvent } from "react";
import { Package, Hammer, Dices, Coins, Crown } from "lucide-react";
type GameView={
 character?:{profession_id:string}|null;
 storage?:Array<{storage_type:string;capacity:number;apartment:string|null;item_id:string|null;item_name:string|null;quantity:string|null}>;
 recipes?:Array<{id:string;title:string;profession_id:string;ingredients:Record<string,number>;products:Record<string,number>;duration_minutes:number;xp:number}>;
 crafting?:Array<{id:string;title:string;state:string;ready_at:string}>;
 campaigns?:Array<{id:string;title:string;synopsis:string;dm_discord_id:string;state:string}>;
 sessions?:Array<{id:string;campaign_id:string;started_at:string}>;
 dungeonMaster?:boolean;
 worldEvents?:Array<{id:string;title:string;description:string}>;
 overseer?:{treasury:string;pendingAwards?:Array<{id:string;recipient:string;xp:number;credits:string;items:Record<string,number>}>;members?:Array<{discord_id:string;name:string;profession_id:string}>;employment?:Array<{id:string;name:string;salary_weekly:string}>};
 settings?:{rules?:{income_tax_percent?:number;sales_tax_percent?:number}};
};
const panel={background:"#151b22",border:"1px solid #34404b",borderRadius:8,padding:18,marginBottom:16};
const label={display:"block",marginBottom:10} as const;
const input={display:"block",padding:8,maxWidth:"100%",width:360,marginTop:4} as const;
const money=(value:number|string)=>Number(value).toLocaleString("en-US");
export default function ReclamationSystems({game,run}:{game:GameView;run:(action:string,data:unknown)=>Promise<void>}){
 const [from,setFrom]=useState("carry"),[to,setTo]=useState("apartment"),[item,setItem]=useState(""),[quantity,setQuantity]=useState(1);
 const [receiver,setReceiver]=useState(""),[amount,setAmount]=useState(100);
 const [campaignTitle,setCampaignTitle]=useState(""),[campaignSynopsis,setCampaignSynopsis]=useState("");
 const [awardSession,setAwardSession]=useState(""),[awardMember,setAwardMember]=useState(""),[awardXp,setAwardXp]=useState(100),[awardCredits,setAwardCredits]=useState(100);
 const [dmId,setDmId]=useState(""),[salaryMember,setSalaryMember]=useState(""),[salaryWeekly,setSalaryWeekly]=useState(1000),[requiredUnits,setRequiredUnits]=useState(2);
 const [taxIncome,setTaxIncome]=useState(game.settings?.rules?.income_tax_percent??5),[taxSales,setTaxSales]=useState(game.settings?.rules?.sales_tax_percent??5);
 const [monday,setMonday]=useState(""),[stipend,setStipend]=useState(1000);
 const [campaignRoll,setCampaignRoll]=useState(20),[campaignModifier,setCampaignModifier]=useState(0);
 function submit(e:FormEvent,action:string,data:unknown){e.preventDefault();void run(action,data)}
 return <>
  {game.character&&<section style={panel}>
   <h2><Package size={19} style={{display:"inline"}}/> Inventory and apartment storage</h2>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:12,marginBottom:14}}>
    {["carry","apartment","warehouse"].map(type=>{
      const rows=(game.storage||[]).filter(x=>x.storage_type===type),space=rows[0]?.capacity;
      return <article key={type} style={{padding:12,border:"1px solid #34404b",borderRadius:7}}>
       <h3 style={{textTransform:"capitalize",marginTop:0}}>{type}</h3>
       <small>{space===undefined?"Not yet assigned":space+" unit capacity"}</small>
       {rows.filter(x=>x.item_id).map(x=><p key={x.item_id}>{x.item_name} × {x.quantity}</p>)}
       {!rows.some(x=>x.item_id)&&<p style={{opacity:0.6}}>Empty</p>}
      </article>
    })}
   </div>
   <form onSubmit={e=>submit(e,"inventory.transfer",{from,to,item,quantity})}>
    <h3>Move supplies</h3>
    <div style={{display:"flex",gap:9,flexWrap:"wrap",alignItems:"end"}}>
     <label>From <select value={from} onChange={e=>setFrom(e.target.value)}>{["carry","apartment","warehouse"].map(x=><option key={x}>{x}</option>)}</select></label>
     <label>To <select value={to} onChange={e=>setTo(e.target.value)}>{["carry","apartment","warehouse"].map(x=><option key={x}>{x}</option>)}</select></label>
     <label>Item <input value={item} required placeholder="lumber" onChange={e=>setItem(e.target.value)}/></label>
     <label>Quantity <input type="number" value={quantity} min={1} max={1000} onChange={e=>setQuantity(Number(e.target.value))} style={{width:75}}/></label>
     <button type="submit">Transfer</button>
    </div>
   </form>
  </section>}
  {game.character&&<section style={panel}>
   <h2><Hammer size={19} style={{display:"inline"}}/> Crafting workshop</h2>
   <p>Ingredients are consumed from your carry inventory. Finished items go back into that inventory.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12}}>
    {(game.recipes||[]).filter(r=>!r.profession_id||r.profession_id===game.character?.profession_id).map(r=><article key={r.id} style={{border:"1px solid #34404b",borderRadius:7,padding:12}}>
     <strong>{r.title}</strong>
     <p>Requires {Object.entries(r.ingredients).map(([k,v])=>k+" ×"+v).join(", ")}</p>
     <p>Produces {Object.entries(r.products).map(([k,v])=>k+" ×"+v).join(", ")}</p>
     <small>{r.duration_minutes} min · {r.xp} XP</small><div><button type="button" onClick={()=>void run("craft.start",{id:r.id})}>Start crafting</button></div>
    </article>)}
   </div>
   {(game.crafting||[]).filter(x=>x.state==="in_progress").map(c=><p key={c.id}>{c.title} · Ready {new Date(c.ready_at).toLocaleString()} <button type="button" onClick={()=>void run("craft.complete",{id:c.id})}>Collect</button></p>)}
  </section>}
  <section style={panel}>
   <h2><Dices size={19} style={{display:"inline"}}/> Campaigns & expeditions</h2>
   {(game.campaigns||[]).length===0&&<p>No published campaigns yet.</p>}
   {(game.campaigns||[]).map(c=><article key={c.id} style={{borderBottom:"1px solid #34404b",padding:"12px 0"}}>
    <strong>{c.title}</strong> <small>{c.state}</small><p>{c.synopsis}</p>
    {game.character&&c.state==="active"&&<button type="button" onClick={()=>void run("campaign.join",{id:c.id})}>Join campaign</button>}
    {game.dungeonMaster&&<>
     {c.state==="draft"&&<button type="button" onClick={()=>void run("campaign.state",{id:c.id,state:"active"})}>Activate</button>}
     {c.state==="active"&&<button type="button" onClick={()=>void run("session.start",{campaignId:c.id})}>Start voice session</button>}
    </>}
   </article>)}
   {(game.sessions||[]).map(s=><div key={s.id} style={{padding:"10px 0"}}>
    <small>Active session · {s.id.slice(0,8)}</small>{" "}
    <button type="button" onClick={()=>void run("session.join",{id:s.id})}>Join session</button>{" "}
    <button type="button" onClick={()=>void run("session.roll",{sessionId:s.id,sides:campaignRoll,count:1,modifier:campaignModifier,purpose:"Roleplaying check"})}>Roll d{campaignRoll}</button>
   </div>)}
   {(game.sessions||[]).length>0&&<div style={{marginTop:8}}>Die <select value={campaignRoll} onChange={e=>setCampaignRoll(Number(e.target.value))}>{[4,6,8,10,12,20,100].map(n=><option key={n} value={n}>d{n}</option>)}</select>{" "} Modifier <input type="number" min={-100} max={100} style={{width:70}} value={campaignModifier} onChange={e=>setCampaignModifier(Number(e.target.value))}/></div>}
   {game.dungeonMaster&&<>
    <form onSubmit={e=>submit(e,"campaign.create",{title:campaignTitle,synopsis:campaignSynopsis})}>
     <h3>Dungeon Master: new campaign</h3>
     <label style={label}>Title <input required value={campaignTitle} onChange={e=>setCampaignTitle(e.target.value)} style={input}/></label>
     <label style={label}>Story synopsis <textarea value={campaignSynopsis} onChange={e=>setCampaignSynopsis(e.target.value)} style={{display:"block",width:"min(100%,550px)",minHeight:75}}/></label>
     <button type="submit">Create draft campaign</button>
    </form>
    {(game.sessions||[]).length>0&&<form onSubmit={e=>submit(e,"award.propose",{sessionId:awardSession,recipient:awardMember,xp:awardXp,credits:awardCredits,items:{}})}>
     <h3>Propose campaign reward</h3>
     <label style={label}>Session <select value={awardSession} onChange={e=>setAwardSession(e.target.value)} required><option value="">Select active session</option>{(game.sessions||[]).map(s=><option key={s.id} value={s.id}>{s.id.slice(0,8)}</option>)}</select></label>
     <label style={label}>Recipient Discord ID <input required value={awardMember} onChange={e=>setAwardMember(e.target.value)} style={input}/></label>
     <label style={label}>XP <input type="number" min={0} max={10000} value={awardXp} onChange={e=>setAwardXp(Number(e.target.value))}/></label>
     <label style={label}>Credits <input type="number" min={0} max={100000} value={awardCredits} onChange={e=>setAwardCredits(Number(e.target.value))}/></label>
     <button type="submit">Send to Overseer for approval</button>
    </form>}
   </>}
  </section>
  {game.character&&<section style={panel}>
   <h2><Coins size={19} style={{display:"inline"}}/> Resident transfers</h2>
   <p>Credits paid to another resident incur the configured transaction tax.</p>
   <form onSubmit={e=>submit(e,"credits.transfer",{recipient:receiver,amount,key:crypto.randomUUID()})}>
    <label style={label}>Recipient Discord ID <input required value={receiver} onChange={e=>setReceiver(e.target.value)} style={input}/></label>
    <label style={label}>Amount in CC <input type="number" min={1} max={100000000} value={amount} onChange={e=>setAmount(Number(e.target.value))}/></label>
    <button type="submit">Transfer credits</button>
   </form>
  </section>}
  {!!(game.worldEvents||[]).length&&<section style={panel}><h2>World events</h2>{(game.worldEvents||[]).map(w=><p key={w.id}><strong>{w.title}</strong> · {w.description}</p>)}</section>}
  {game.overseer&&<section style={panel}>
   <h2><Crown size={19} style={{display:"inline"}}/> Overseer financial controls</h2>
   <p>Treasury: {money(game.overseer.treasury)} CC</p>
   <form onSubmit={e=>submit(e,"taxes.update",{income:taxIncome,sales:taxSales})}>
    <h3>Taxation</h3>
    <label style={label}>Income tax % <input type="number" min={0} max={25} value={taxIncome} onChange={e=>setTaxIncome(Number(e.target.value))}/></label>
    <label style={label}>Transaction tax % <input type="number" min={0} max={25} value={taxSales} onChange={e=>setTaxSales(Number(e.target.value))}/></label>
    <button type="submit">Update tax rules</button>
   </form>
   <form onSubmit={e=>submit(e,"employment.set",{discordId:salaryMember,profession:game.overseer?.members?.find(m=>m.discord_id===salaryMember)?.profession_id||"carpenter",type:"salary",weekly:salaryWeekly,requiredUnits})}>
    <h3>Appoint salaried worker</h3>
    <label style={label}>Member <select required value={salaryMember} onChange={e=>setSalaryMember(e.target.value)}><option value="">Select resident</option>{(game.overseer.members||[]).map(m=><option key={m.discord_id} value={m.discord_id}>{m.name} ({m.profession_id})</option>)}</select></label>
    <label style={label}>Weekly gross salary <input type="number" min={0} max={100000000} value={salaryWeekly} onChange={e=>setSalaryWeekly(Number(e.target.value))}/></label>
    <label style={label}>Required weekly jobs <input type="number" min={0} max={100} value={requiredUnits} onChange={e=>setRequiredUnits(Number(e.target.value))}/></label>
    <button type="submit">Save employment</button>
   </form>
   <form onSubmit={e=>submit(e,"payroll.run",{monday})}>
    <h3>Run payroll</h3>
    <p>Process a seven-day work period starting on Monday. Existing paid periods are not paid twice.</p>
    <label style={label}>Period start (Monday) <input type="date" required value={monday} onChange={e=>setMonday(e.target.value)}/></label>
    <button type="submit">Process payroll</button>
   </form>
   <form onSubmit={e=>submit(e,"overseer.stipend",{amount:stipend,key:crypto.randomUUID()})}>
    <h3>Overseer stipend</h3>
    <label style={label}>Amount in CC <input type="number" min={1} max={1000000} value={stipend} onChange={e=>setStipend(Number(e.target.value))}/></label>
    <button type="submit">Transfer stipend from treasury</button>
   </form>
   <form onSubmit={e=>submit(e,"dm.grant",{discordId:dmId,enabled:true})}>
    <h3>Assign Dungeon Master</h3>
    <label style={label}>Discord member ID <input required value={dmId} onChange={e=>setDmId(e.target.value)} style={input}/></label>
    <button type="submit">Grant DM game permissions</button>
   </form>
   <h3>Pending campaign awards</h3>
   {(game.overseer.pendingAwards||[]).length===0&&<p>No awards awaiting approval.</p>}
   {(game.overseer.pendingAwards||[]).map(a=><div key={a.id} style={{padding:"10px 0",borderBottom:"1px solid #34404b"}}>
    {a.recipient} · {a.xp} XP · {money(a.credits)} CC{" "}
    <button type="button" onClick={()=>void run("award.approve",{id:a.id})}>Approve and issue</button>
   </div>)}
  </section>}
 </>;
}
