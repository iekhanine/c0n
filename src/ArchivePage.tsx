import {useEffect,useState,type FormEvent} from "react";
import {Archive,FileAudio,Plus,Radio,Save,Trash2,Upload} from "lucide-react";
import "./ArchivePage.css";
type RecordEntry={id:string;collection:"index"|"remnants";title:string;subtitle:string;body:string;position:number;published:boolean;audio_id:string|null};
async function archiveApi<T>(action:string,method="GET",body?:unknown):Promise<T>{
 const r=await fetch("/api/site-content?action=archive_"+action,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const result=await r.json();if(!r.ok)throw Error(result.error||"Archive unavailable");return result as T;
}
const blank=():RecordEntry=>({id:"",collection:"index",title:"",subtitle:"",body:"",position:0,published:false,audio_id:null});
function audioUrl(id:string){return "/api/site-content?action=archive_audio&id="+encodeURIComponent(id);}
const exampleNames=["The Compound","The Name","The Chain"];
export default function ArchivePage({manage=false}:{manage?:boolean}){
 const [view,setView]=useState<"index"|"remnants">(()=>new URLSearchParams(location.search).get("archive")==="remnants"?"remnants":"index");
 const [all,setAll]=useState<RecordEntry[]>([]),[canEdit,setCanEdit]=useState(false),[selected,setSelected]=useState(""),[draft,setDraft]=useState<RecordEntry>(blank),[file,setFile]=useState<File|null>(null);
 const [notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 async function load(){try{const r=await archiveApi<{records:RecordEntry[];canEdit:boolean}>("list");setAll(r.records);setCanEdit(r.canEdit);setNotice("");}catch(e){setNotice((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 function switchView(v:"index"|"remnants"){setView(v);const u=new URL(location.href);if(v==="remnants")u.searchParams.set("archive","remnants");else u.searchParams.delete("archive");history.replaceState(null,"",u.pathname+u.search);}
 const entries=all.filter(x=>x.collection===view&&(manage||x.published)).sort((a,b)=>a.position-b.position);
 const active=entries.find(x=>x.id===selected)||entries[0];
 function start(e?:RecordEntry){setDraft(e?{...e}:{...blank(),collection:view,position:entries.length+1});setFile(null);setNotice("");}
 async function save(e:FormEvent){e.preventDefault();setBusy(true);try{const r=await archiveApi<{id:string}>("save","POST",draft);if(file){if(file.size>2500000||!(/\.mp3$/i.test(file.name)||file.type==="audio/mpeg"))throw Error("Choose an MP3 under 2.5 MB");const data=await new Promise<string>((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result).split(",")[1]||"");fr.onerror=()=>reject(Error("File unavailable"));fr.readAsDataURL(file)});await archiveApi("upload","POST",{id:r.id,data,filename:file.name});}setNotice("Record saved.");setSelected(r.id);await load();}catch(e){setNotice((e as Error).message)}finally{setBusy(false)}}
 async function remove(){if(!draft.id||!confirm("Remove this archive record?"))return;try{await archiveApi("remove","POST",{id:draft.id});setSelected("");start();await load()}catch(e){setNotice((e as Error).message)}}
 return <section className="con-archive">
   <header className="con-archive-head"><div><span>ᴄ0ɴ / ʀᴇᴄᴏᴠᴇʀᴇᴅ ʀᴇᴄᴏʀᴅꜱ</span><h1>ᴛʜᴇ ᴀʀᴄʜɪᴠᴇ</h1></div>
     <nav aria-label="Archive collections"><button className={view==="index"?"active":""} onClick={()=>switchView("index")}>ɪɴᴅᴇx</button><button className={view==="remnants"?"active":""} onClick={()=>switchView("remnants")}>ʀᴇᴍɴᴀɴᴛꜱ</button></nav>
   </header>
   {loading?<p>Opening the recovered archive…</p>:manage&&!canEdit?<p>Restricted archive administration.</p>:<>
     {manage?<div className="con-archive-admin">
        <aside><h2>Records</h2><button onClick={()=>start()}><Plus size={14}/> New record</button>{all.map(x=><button className="con-archive-admin-item" key={x.id} onClick={()=>{setDraft({...x});setFile(null)}}>{x.collection.toUpperCase()} / {x.title} {x.published?"":"· DRAFT"}</button>)}</aside>
        <form onSubmit={e=>void save(e)}><h2>Editor</h2><label>Collection<select value={draft.collection} onChange={e=>setDraft(d=>({...d,collection:e.target.value as "index"|"remnants"}))}><option value="index">Index: narrated accounts</option><option value="remnants">Remnants: artifacts</option></select></label><label>Title<input required maxLength={130} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>Archive subtitle<input maxLength={160} value={draft.subtitle} onChange={e=>setDraft(d=>({...d,subtitle:e.target.value}))}/></label><label>Written material (not the audio transcript)<textarea rows={10} value={draft.body} onChange={e=>setDraft(d=>({...d,body:e.target.value}))}/></label><label>Order<input type="number" min="0" max="100000" value={draft.position} onChange={e=>setDraft(d=>({...d,position:Number(e.target.value)}))}/></label><label>Attach or replace MP3 (max 2.5 MB)<input type="file" accept="audio/mpeg,.mp3" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><label className="con-archive-check"><input type="checkbox" checked={draft.published} onChange={e=>setDraft(d=>({...d,published:e.target.checked}))}/> Published</label><div className="con-archive-actions"><button disabled={busy} type="submit"><Save size={15}/> {busy?"Saving":"Save record"}</button>{draft.id&&<button type="button" onClick={()=>void remove()}><Trash2 size={15}/> Remove</button>}</div></form>
       </div>:<div className="con-archive-reader">
         <aside><h2>{view==="index"?"ᴄᴏɴᴛᴇɴᴛꜱ":"ʀᴇᴄᴏʀᴅɪɴɢꜱ"}</h2>{entries.map((r,i)=><button key={r.id} className={active?.id===r.id?"active":""} onClick={()=>setSelected(r.id)}><span>{String(i+1).padStart(2,"0")}</span>{r.title}</button>)}</aside>
         <article>{active?<><div className="con-archive-kicker">{active.subtitle||"Recovered record"}</div><h2>{active.title}</h2>{active.body.split(/\n\s*\n/).filter(Boolean).map((p,i)=><p key={i}>{p}</p>)}<div className="con-archive-player"><Radio size={17}/><strong>{view==="index"?"Recovered narration":"Recovered audio"}</strong>{active.audio_id?<audio key={active.audio_id} controls preload="metadata" src={audioUrl(active.audio_id)}/>:<span>Audio restoration pending.</span>}</div></>:<p>No records have been released in this collection.</p>}</article>
       </div>}
     {notice&&<p role="status" className="con-archive-notice">{notice}</p>}
   </>}
 </section>;
}
