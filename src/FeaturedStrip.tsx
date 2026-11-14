import {useEffect,useState} from "react";
import {useSiteContent} from "./SiteText";
import "./FeaturedStrip.css";
type Slot={type:"announcement"|"project"|"member"|"notice";title:string;description:string;url:string;enabled:boolean};
const empty=():Slot=>({type:"notice",title:"",description:"",url:"",enabled:false});
const KEY="layout.featured";
function decode(input:string|undefined):Slot[]{try{const slots=JSON.parse(input||"[]");if(Array.isArray(slots))return Array.from({length:4},(_,i)=>({...empty(),...(slots[i]||{})}));}catch{}return Array.from({length:4},empty);}
function safeUrl(value:string){if(value.startsWith("/")&&!value.startsWith("//"))return value;try{const u=new URL(value);if(u.protocol==="https:")return u.href;}catch{}return undefined;}
export default function FeaturedStrip({manage=false}:{manage?:boolean}){
 const {entries,change,owner,ready}=useSiteContent();
 const stored=entries[KEY];
 const slots=decode(stored?.value);
 const [draft,setDraft]=useState<Slot[]>(slots),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{setDraft(decode(stored?.value))},[stored?.value,stored?.version]);
 const visible=slots.filter(s=>s.enabled&&s.title.trim());
 async function save(){setBusy(true);try{await change(KEY,JSON.stringify(draft),stored?.version||0,false);setNotice("Featured layout saved.");}catch(e){setNotice((e as Error).message);}finally{setBusy(false)}}
 function update(i:number,key:keyof Slot,value:string|boolean){setDraft(old=>old.map((slot,n)=>n===i?{...slot,[key]:value}:slot));}
 if(manage){
   if(!owner)return <p>Restricted layout administration.</p>;
   return <section className="con-feature-editor"><header><h1>Featured content</h1><p>Up to four optional pinned items above the main feed. Nothing is shown by default.</p></header>
     <div className="con-feature-editor-grid">{draft.map((slot,i)=><fieldset key={i}><legend>Slot {i+1}</legend>
       <label><input type="checkbox" checked={slot.enabled} onChange={e=>update(i,"enabled",e.target.checked)}/> Visible</label>
       <label>Content type<select value={slot.type} onChange={e=>update(i,"type",e.target.value)}><option value="announcement">Announcement or blog</option><option value="project">Project</option><option value="member">Member highlight</option><option value="notice">Notice</option></select></label>
       <label>Title<input value={slot.title} maxLength={120} onChange={e=>update(i,"title",e.target.value)}/></label>
       <label>Short description<textarea rows={2} maxLength={260} value={slot.description} onChange={e=>update(i,"description",e.target.value)}/></label>
       <label>Destination URL<input placeholder="/posts/… or /projects/…" value={slot.url} onChange={e=>update(i,"url",e.target.value)}/></label>
     </fieldset>)}</div><div className="con-feature-editor-actions"><button disabled={busy||!ready} onClick={()=>void save()}>Save featured items</button><button disabled={busy} onClick={()=>setDraft(Array.from({length:4},empty))}>Hide all</button></div>{notice&&<p role="status">{notice}</p>}
   </section>;
 }
 if(!visible.length)return null;
 return <section className="con-feature-strip" aria-label="Featured content" style={{gridTemplateColumns:`repeat(${visible.length},minmax(0,1fr))`}}>
   {visible.map((item,i)=><article key={i}><span>{item.type.toUpperCase()}</span><h2>{safeUrl(item.url)?<a href={safeUrl(item.url)}>{item.title}</a>:item.title}</h2>{item.description&&<p>{item.description}</p>}</article>)}
 </section>;
}
