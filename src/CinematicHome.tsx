import {useEffect,useState} from "react";
import {ArrowRight,ArrowUpRight,BookOpen,Box,Building2,FileText,KeyRound,Layers3,Radio,Shield,Signal,Users,Wallet,Wrench} from "lucide-react";
import "./CinematicHome.css";

type CommunityStats={connected?:boolean;member_count?:number};
type ArchiveRecord={id:string;title:string;subtitle?:string;body?:string;collection:string;published:boolean};
const sectors=[
 {label:"RESIDENCY",desc:"A place within the Compound. An identity within the record.",icon:Building2,href:"https://thecompound.cultofnixon.com/apartments"},
 {label:"WORK ORDERS",desc:"Contribute to the continuing work.",icon:Wrench,href:"https://thecompound.cultofnixon.com/operations/work-orders"},
 {label:"TREASURY",desc:"Every allocation leaves an entry in the ledger.",icon:Wallet,href:"https://thecompound.cultofnixon.com/operations/finance"},
 {label:"THE ARCHIVE",desc:"A record of what was found. And what remains.",icon:BookOpen,href:"/archive"}
];
export default function CinematicHome({view="home",member=false}:{view?:"home"|"doctrine"|"transmissions";member?:boolean}){
 const [community,setCommunity]=useState<CommunityStats|null>(null);
 const [records,setRecords]=useState<ArchiveRecord[]>([]);
 useEffect(()=>{
  const c=new AbortController();
  void fetch("/api/discord-bot?action=public",{cache:"no-store",signal:c.signal}).then(r=>r.ok?r.json():null).then(d=>{if(d)setCommunity(d)}).catch(()=>{});
  void fetch("/api/site-content?action=archive_list",{cache:"no-store",signal:c.signal}).then(r=>r.ok?r.json():null).then(d=>{
   if(Array.isArray(d?.records))setRecords(d.records.filter((x:ArchiveRecord)=>x.published));
  }).catch(()=>{});
  return ()=>c.abort();
 },[]);
 const recent=records.slice(0,3);
 const transmissions=<section className="signal-section signal-transmissions" id="transmissions">
  <div className="signal-section-header"><div><span className="signal-label"><Radio size={15}/> RECOVERED COMMUNICATIONS</span><h2>Latest transmissions</h2></div><a href="/archive">ENTER THE ARCHIVE <ArrowUpRight size={15}/></a></div>
  <div className="signal-record-grid">{recent.length?recent.map((entry,i)=><a className="signal-record" href="/archive" key={entry.id}>
   <div className={"signal-record-symbol symbol-"+i}><FileText size={33}/><span>RECORD / {String(i+1).padStart(3,"0")}</span></div>
   <div><span className="signal-file-label">{entry.collection.toUpperCase()} / DECLASSIFIED</span><h3>{entry.title}</h3><p>{entry.subtitle||entry.body?.slice(0,110)||"Recovered material awaiting examination."}</p><small>OPEN FILE <ArrowUpRight size={12}/></small></div>
  </a>):<div className="signal-no-records"><Radio size={24}/><strong>NO PUBLIC RECORDS RELEASED</strong><span>Transmission archives remain restricted until the first release.</span><a href="/archive">Inspect archive <ArrowRight size={14}/></a></div>}</div>
 </section>;
 const doctrine=<section className="signal-section signal-doctrine" id="doctrine"><span className="signal-label">I. THE DOCTRINE</span>
  <h2>We do not worship a man.<br/><em>We follow the signal.</em></h2>
  <p>The Cult of nix0n is a continuity of purpose. Its members are archivists, builders, observers and participants in a story that does not end at the edge of the screen.</p>
  <p>No one is required to believe. Everyone is invited to question. The only requirement is that the work continues.</p>
  <a href="/doctrine">READ THE DOCTRINE <ArrowRight size={15}/></a>
 </section>;
 if(view==="doctrine")return <div className="signal-site-content signal-inner-page"><div className="signal-page-banner"><span className="signal-label">THE FOUNDING DIRECTIVE / DOCUMENT 001</span><h1>THE DOCTRINE</h1><p>The First Signal was not an answer. It was an invitation to ask better questions.</p></div>{doctrine}<section className="signal-seal"><Shield size={34}/><p>Question everything. Obey nothing blindly. Preserve the absurd.</p><a href="/membership">REQUEST ACCESS <ArrowRight size={14}/></a></section></div>;
 if(view==="transmissions")return <div className="signal-site-content signal-inner-page"><div className="signal-page-banner"><span className="signal-label">THE RECORD / ONGOING</span><h1>TRANSMISSIONS</h1><p>Messages appear when they are ready to be found.</p></div>{transmissions}<section className="signal-seal"><Radio size={32}/><p>Some transmissions are public. Others require clearance.</p><a href="/membership">ENTER WITH A CODE <ArrowRight size={14}/></a></section></div>;
 return <div className="signal-site-content">
   <section className="signal-hero">
    <div className="signal-hero-art" aria-hidden="true"><div className="signal-moon"/><div className="signal-mountains"/><div className="signal-fence"/><div className="signal-bunker"><span>THE COMPOUND<br/>A–17</span><div className="signal-bunker-door"/></div><div className="signal-tower"/><div className="signal-radar"/></div>
    <div className="signal-hero-copy"><div className="signal-emblem"><img src="/con-logo.png" alt=""/></div><span className="signal-label">THE CULT OF NIX0N / FIRST TRANSMISSION</span><h1>ANSWER<br/><em>THE SIGNAL.</em></h1><p>A community. A compound. A continuing directive.<br/>Initiation is a process, not an event.</p><div className="signal-hero-actions"><a className="signal-btn signal-btn-primary" href="/membership">{member?"VIEW YOUR CLEARANCE":"REQUEST ACCESS"} <ArrowRight size={16}/></a><a className="signal-btn" href="/transmissions"><Radio size={16}/> READ THE TRANSMISSION</a></div></div>
    <div className="signal-hero-bottom"><span>SECTOR A–17 / CONTINUITY ACTIVE</span><span><span className="signal-live-dot"/> SIGNAL ESTABLISHED</span></div>
   </section>
   <div className="signal-briefing"><div className="signal-briefing-copy">{doctrine}</div>
    <div className="signal-briefing-info">
     <div className="signal-stats">
      <div><Users size={23}/><strong>{typeof community?.member_count==="number"?community.member_count.toLocaleString():"—"}</strong><span>REGISTERED PERSONNEL</span><small>{community?.connected?"FIELD LINK ACTIVE":"LIVE COUNT UNAVAILABLE"}</small></div>
      <div><Radio size={23}/><strong>{records.length?records.length.toLocaleString():"—"}</strong><span>PUBLIC RECORDS</span><small>ARCHIVE INDEX</small></div>
      <div><KeyRound size={23}/><strong>CODE</strong><span>ACCESS PROTOCOL</span><small>INVITATION REQUIRED</small></div>
      <div><Signal size={23}/><strong>{community?.connected?"LIVE":"—"}</strong><span>NETWORK STATUS</span><small>CONTINUITY MONITOR</small></div>
     </div>{transmissions}
    </div>
   </div>
   <section className="signal-compound"><div className="signal-compound-intro"><span className="signal-label">II. THE COMPOUND</span><h2>A PLACE TO CONTINUE<br/>THE WORK.</h2><p>The Compound is a shared operational space—part residency, part archive, part ongoing experiment. Each assignment is recorded. Every member has a part to play.</p><a className="signal-btn" href="https://thecompound.cultofnixon.com/">EXPLORE THE COMPOUND <ArrowRight size={15}/></a></div>
    <div className="signal-sectors">{sectors.map(s=><a key={s.label} href={s.href}><s.icon size={20}/><span><strong>{s.label}</strong><small>{s.desc}</small></span><ArrowUpRight size={15}/></a>)}</div>
   </section>
   <section className="signal-initiation"><div><span className="signal-label">III. THE INITIATED</span><h2>MEMBERSHIP IS<br/>NOT AN ACCIDENT.</h2><p>Access is granted through a one-time invitation code. Those already initiated may return with their credentials. The first step is knowing the door exists.</p><a className="signal-btn signal-btn-primary" href="/membership">{member?"VIEW MEMBERSHIP":"ENTER AN INVITATION CODE"} <ArrowRight size={16}/></a></div>
    <div className="signal-initiation-art"><div className="signal-ID-card"><div><img src="/con-logo.png" alt=""/><span>THE CULT OF NIX0N<br/><small>VERIFIED MEMBER RECORD</small></span></div><Box size={34}/><strong>IDENTITY WITHHELD</strong><small>THE INITIATED / CLEARANCE PENDING</small><div className="signal-ID-lines"/></div></div>
   </section>
   <footer className="signal-footer"><span>© THE CULT OF NIX0N · ALL SIGNALS RESERVED</span><nav aria-label="Footer"><a href="/doctrine">DOCTRINE</a><a href="/archive">ARCHIVE</a><a href="/membership">ACCESS</a></nav><span><i className="signal-live-dot"/> THE SIGNAL CONTINUES</span></footer>
 </div>;
}
