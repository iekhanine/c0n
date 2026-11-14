import {useState} from "react";
import {useSiteContent} from "./SiteText";
import {SITE_COPY} from "../shared/site-copy.js";
import "./PublicNavigation.css";

type NavId="compound"|"archive"|"militia";
const keys:NavId[]=["compound","archive","militia"];
const hrefs:Record<NavId,string>={compound:"/",archive:"/archive",militia:"/militia"};
const nameKeys:Record<NavId,string>={compound:"nav.compound",archive:"nav.archive",militia:"nav.militia"};
const setting="layout.nav.order";
function parse(value:string|undefined):NavId[]{
 try{
  const items=JSON.parse(value||"");
  if(Array.isArray(items)&&items.length===keys.length&&keys.every(k=>items.includes(k))&&new Set(items).size===keys.length)return items as NavId[];
 }catch{}
 return keys;
}
export default function PublicNavigation(){
 const {entries}=useSiteContent();
 const order=parse(entries[setting]?.value??SITE_COPY[setting]);
 return <nav aria-label="Community" className="con-public-nav">{order.map(key=><a key={key} aria-current={location.pathname===hrefs[key]?"page":undefined} href={hrefs[key]}>{entries[nameKeys[key]]?.removed?"":entries[nameKeys[key]]?.value??SITE_COPY[nameKeys[key]]}</a>)}</nav>;
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
 return <section className="con-nav-editor"><h2>Public navigation</h2><p>These are the three main links. Use the arrows to reorder them for every visitor.</p>
  {draft.map((key,i)=><div className="con-nav-editor-item" key={key}><span>{i+1}. {SITE_COPY[nameKeys[key]]}</span><div><button type="button" disabled={i===0} onClick={()=>move(i,-1)} aria-label={"Move "+key+" left"}>←</button><button type="button" disabled={i===draft.length-1} onClick={()=>move(i,1)} aria-label={"Move "+key+" right"}>→</button></div></div>)}
  <button type="button" disabled={saving||!ready} onClick={()=>void save()}>{saving?"Saving…":"Save order"}</button>{message&&<p role="status">{message}</p>}
 </section>;
}
