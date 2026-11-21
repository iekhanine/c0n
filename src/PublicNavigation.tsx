import {useState} from "react";
import {useSiteContent} from "./SiteText";
import {SITE_COPY} from "../shared/site-copy.js";
import "./PublicNavigation.css";

type NavId="compound"|"transmissions"|"archive"|"membership";
const keys:NavId[]=["compound","transmissions","archive","membership"];
const hrefs:Record<NavId,string>={compound:"https://thecompound.cultofnixon.com/",transmissions:"/transmissions",archive:"/archive",membership:"/membership"};
const labels:Record<NavId,string>={compound:"THE COMPOUND",transmissions:"TRANSMISSIONS",archive:"ARCHIVE",membership:"MEMBERSHIP"};
const setting="layout.nav.order";
function parse(value:string|undefined):NavId[]{
 try{
  const items=JSON.parse(value||"");
  if(Array.isArray(items)) { const valid=items.filter((x:unknown)=>keys.includes(x as NavId)) as NavId[]; if(valid.length>=2) return [...valid,...keys.filter(k=>!valid.includes(k))]; }
 }catch{}
 return keys;
}
export default function PublicNavigation(){
 const {entries}=useSiteContent();
 const order=parse(entries[setting]?.value??SITE_COPY[setting]);
 return <nav aria-label="Site navigation" className="con-public-nav">{order.map(key=><a key={key} aria-current={(key==="compound"?location.hostname==="thecompound.cultofnixon.com":location.pathname===hrefs[key])?"page":undefined} href={hrefs[key]}>{labels[key]}</a>)}</nav>;
}
export function NavigationEditor(){
 const {owner,entries,ready,change}=useSiteContent();
 const current=entries[setting];
 const [draft,setDraft]=useState<NavId[]>(()=>parse(current?.value??SITE_COPY[setting]));
 const [message,setMessage]=useState(""),[saving,setSaving]=useState(false);
 const [source,setSource]=useState(current?.value);
 if(source!==current?.value){setSource(current?.value);setDraft(parse(current?.value??SITE_COPY[setting]));}
 function move(index:number,delta:number){const target=index+delta;if(target<0||target>=draft.length)return;setDraft(old=>{const next=[...old];[next[index],next[target]]=[next[target],next[index]];return next;});}
 async function save(){setSaving(true);setMessage("");try{await change(setting,JSON.stringify(draft),current?.version??0);setMessage("Navigation order saved.");}catch(e){setMessage(e instanceof Error?e.message:"Could not save navigation.");}finally{setSaving(false);}}
 if(!owner)return <p>Restricted.</p>;
 return <section className="con-nav-editor"><h2>Public navigation</h2><p>These are the four main links. Use the arrows to reorder them for every visitor.</p>
  {draft.map((key,i)=><div className="con-nav-editor-item" key={key}><span>{i+1}. {labels[key]}</span><div><button type="button" disabled={i===0} onClick={()=>move(i,-1)} aria-label={"Move "+key+" left"}>←</button><button type="button" disabled={i===draft.length-1} onClick={()=>move(i,1)} aria-label={"Move "+key+" right"}>→</button></div></div>)}
  <button type="button" disabled={saving||!ready} onClick={()=>void save()}>{saving?"Saving…":"Save order"}</button>{message&&<p role="status">{message}</p>}
 </section>;
}
