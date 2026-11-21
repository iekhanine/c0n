import {useEffect,useState,type FormEvent} from "react";
import {ArrowRight,Check,ChevronDown,Shield,Info,Minus,Plus,RotateCcw,UserRound,LockKeyhole} from "lucide-react";
import "./CharacterRegistration.css";

export const CHARACTER_ATTRIBUTES=["strength","intelligence","charisma","agility","endurance","perception"] as const;
const attributeCopy:Record<string,{title:string;description:string}>={
 strength:{title:"Strength",description:"Heavy lifting, construction and physical tasks"},
 intelligence:{title:"Intelligence",description:"Research, medicine and technical problem-solving"},
 charisma:{title:"Charisma",description:"Leadership, negotiation and crew coordination"},
 agility:{title:"Agility",description:"Movement, precision and quick reactions"},
 endurance:{title:"Endurance",description:"Long shifts, recovery and surviving difficult conditions"},
 perception:{title:"Perception",description:"Scouting, observation and discovering hidden resources"}
};
export const CHARACTER_PROFESSIONS=[
 {id:"carpenter",title:"Carpentry",subtitle:"Structures & repairs",description:"Reinforce shelters, construct fittings and rebuild the Compound."},
 {id:"metalworker",title:"Metalworking",subtitle:"Forge & salvage",description:"Restore fittings, maintain equipment and work recovered metal."},
 {id:"medic",title:"Medical",subtitle:"Health & recovery",description:"Maintain the infirmary and prepare supplies for expeditions."},
 {id:"farmer",title:"Agriculture",subtitle:"Food & cultivation",description:"Grow food, manage crops and secure a sustainable supply."},
 {id:"engineer",title:"Engineering",subtitle:"Systems & power",description:"Restore electrical, mechanical and infrastructure systems."},
 {id:"scavenger",title:"Scavenging",subtitle:"Recon & recovery",description:"Explore the surface and recover materials for the settlement."}
] as const;

export function newStartingAttributes(base:number){
 return Object.fromEntries(CHARACTER_ATTRIBUTES.map(key=>[key,base])) as Record<string,number>;
}
export function calculatePointsLeft(attributes:Record<string,number>,base:number,points:number){
 return points-CHARACTER_ATTRIBUTES.reduce((total,key)=>total+(attributes[key]-base),0);
}
type Props={
 assignedName:string|null;
 isOverseer:boolean;
 points:number;
 base:number;
 max:number;
 submitting:boolean;
 error?:string;
 onRegister:(data:{profession:string;attributes:Record<string,number>})=>void;
};
export default function CharacterRegistration({assignedName,isOverseer,points,base,max,submitting,error,onRegister}:Props){
 const [profession,setProfession]=useState("carpenter");
 const [attributes,setAttributes]=useState<Record<string,number>>(()=>newStartingAttributes(base));
 const [showInfo,setShowInfo]=useState(false);
 useEffect(()=>{setAttributes(newStartingAttributes(base));},[base]);
 const remaining=calculatePointsLeft(attributes,base,points);
 const spent=points-remaining;
 const valid=Boolean(assignedName)&&remaining===0&&!submitting;
 function adjust(key:string,delta:number){
  setAttributes(old=>{
   const available=calculatePointsLeft(old,base,points);
   const next=old[key]+delta;
   if(next<base||next>max||(delta>0&&available<=0))return old;
   return {...old,[key]:next};
  });
 }
 function submit(event:FormEvent){
  event.preventDefault();
  if(!valid)return;
  onRegister({profession,attributes});
 }
 return <div className="con-registration">
  <div className="con-registration-masthead">
   <div className="con-registration-kicker"><span className="con-registration-signal"/> PROJECT RECLAMATION / PERSONNEL INTAKE</div>
   <div className="con-registration-title-row">
    <div><h2>Register your character</h2><p>Every resident has a place in the reconstruction. Choose your trade, distribute your starting points, then report for duty.</p></div>
    <span className="con-registration-stage">01 / 03 <span>INTAKE</span></span>
   </div>
  </div>
  <form onSubmit={submit} className="con-registration-form">
   <section className="con-registration-section">
    <div className="con-registration-section-head">
     <div className="con-registration-section-number">01</div>
     <div><h3>Identity on file</h3><p>Your codename is issued by the Compound. You do not need to create another name.</p></div>
    </div>
    <div className="con-registration-identity">
     <div className="con-registration-identity-symbol"><UserRound size={25}/></div>
     <div className="con-registration-identity-content">
      <small>ASSIGNED CHARACTER NAME</small>
      <strong>{assignedName||"Awaiting assigned codename"}</strong>
      <span><LockKeyhole size={13}/> Automatically linked to your membership record</span>
     </div>
     <span className={"con-registration-identity-status"+(assignedName?" ready":"")}>{assignedName?"IDENTITY VERIFIED":"UNAVAILABLE"}</span>
    </div>
    {!assignedName&&<p className="con-registration-error">Your membership does not have an assigned codename yet. Contact the Overseer before registering.</p>}
   </section>
   <section className="con-registration-section">
    <div className="con-registration-section-head">
     <div className="con-registration-section-number">02</div>
     <div><h3>Choose a profession</h3><p>Pick a starting trade. It determines the type of work you can take on in the Compound.</p></div>
    </div>
    <div className="con-registration-profession-select-wrap">
     <label htmlFor="con-starting-profession">STARTING SPECIALIZATION</label>
     <div className="con-registration-select-shell">
      <select id="con-starting-profession" value={profession} onChange={e=>setProfession(e.target.value)}>
       {CHARACTER_PROFESSIONS.map(p=><option value={p.id} key={p.id}>{p.title}</option>)}
      </select>
      <ChevronDown size={17} aria-hidden/>
     </div>
    </div>
    <div className="con-registration-trades" role="group" aria-label="Choose your starting profession">
     {CHARACTER_PROFESSIONS.map(p=><button key={p.id} type="button" className={"con-registration-trade"+(profession===p.id?" selected":"")} onClick={()=>setProfession(p.id)} aria-pressed={profession===p.id}>
      <span className="con-registration-trade-title"><strong>{p.title}</strong><span className="con-registration-radio">{profession===p.id&&<Check size={13}/>}</span></span>
      <span className="con-registration-trade-sub">{p.subtitle}</span>
      <span className="con-registration-trade-copy">{p.description}</span>
     </button>)}
    </div>
   </section>
   <section className="con-registration-section">
    <div className="con-registration-section-head">
     <div className="con-registration-section-number">03</div>
     <div><h3>Allocate your attributes</h3><p>Every attribute starts at {base}. Spend all {points} bonus points to complete your character.</p></div>
    </div>
    <div className="con-registration-budget">
     <div><small>POINTS AVAILABLE</small><div className="con-registration-budget-number" aria-live="polite">{remaining}<span> / {points}</span></div></div>
     <div className="con-registration-budget-meter"><div className="con-registration-budget-rail"><div style={{width:(points>0?Math.max(0,Math.min(100,spent/points*100)):100)+"%"}}/></div><span>{remaining===0?"Allocation complete":"Spend all remaining points to continue"}</span></div>
     <button type="button" className="con-registration-reset" onClick={()=>setAttributes(newStartingAttributes(base))}><RotateCcw size={14}/> Reset</button>
    </div>
    <div className="con-registration-attributes">
     {CHARACTER_ATTRIBUTES.map(key=>{const attr=attributeCopy[key];const value=attributes[key];return <div className="con-registration-attribute" key={key}>
      <div className="con-registration-attr-copy"><label id={"con-attr-"+key}>{attr.title}</label><p>{attr.description}</p></div>
      <div className="con-registration-stepper" aria-labelledby={"con-attr-"+key}>
       <button type="button" aria-label={"Decrease "+attr.title} disabled={value<=base} onClick={()=>adjust(key,-1)}><Minus size={16}/></button>
       <output aria-label={attr.title+" score"}>{value}</output>
       <button type="button" aria-label={"Increase "+attr.title} disabled={value>=max||remaining<=0} onClick={()=>adjust(key,1)}><Plus size={16}/></button>
      </div>
     </div>})}
    </div>
   </section>
   <div className="con-registration-footer">
    <div className="con-registration-footer-copy">
     <Shield size={20}/>
     <div><strong>Ready for assignment?</strong><p>Once registered, your profession and starting attributes become part of your permanent character record.</p></div>
    </div>
    {error&&<p className="con-registration-error" role="alert">{error}</p>}
    <button type="submit" className="con-registration-submit" disabled={!valid}>{submitting?"Registering…":"Complete registration"}<ArrowRight size={17}/></button>
    {remaining>0&&<small className="con-registration-help">Allocate {remaining} more {remaining===1?"point":"points"} to continue.</small>}
    {isOverseer&&<div className="con-registration-overseer"><div><Shield size={16}/> <strong>OVERSEER ACCESS</strong><span>Your character can remain unregistered while you manage the Compound.</span></div><a href="/">Skip for now <ArrowRight size={15}/></a></div>}
   </div>
  </form>
  <button type="button" className="con-registration-about" onClick={()=>setShowInfo(!showInfo)} aria-expanded={showInfo}><Info size={15}/> How does character registration work? <ChevronDown size={14}/></button>
  {showInfo&&<p className="con-registration-about-copy">Your membership record determines your codename. This form only sets your initial profession and six game attributes. Registration is required for normal residents before accessing the game's job, crafting and campaign systems. The Overseer can return later without losing access to site administration.</p>}
 </div>;
}
