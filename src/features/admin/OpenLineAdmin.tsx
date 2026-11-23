import {useEffect,useState} from "react";
import {Mic,Square,Download,RefreshCw,Send} from "lucide-react";
import {api,asFile,useVoiceRecorder} from "../../OpenLine";
import "./OpenLineAdmin.css";
type Message={id:string;alias:string;email:string;created_at:string;mime:string;status:string;has_reply:boolean;emailed_at:string|null};
type Cue={id:string;label:string;recorded:boolean};
function AudioCapture({onCaptured,label}:{onCaptured:(v:{data:string;mime:string})=>Promise<void>;label:string}){
  const r=useVoiceRecorder();const [busy,setBusy]=useState(false),[error,setError]=useState(""),[preview,setPreview]=useState("");
  useEffect(()=>{if(!r.clip){setPreview("");return}const url=URL.createObjectURL(r.clip);setPreview(url);return()=>URL.revokeObjectURL(url)},[r.clip]);
  async function save(){if(!r.clip)return;setBusy(true);setError("");try{await onCaptured(await asFile(r.clip));r.setClip(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <div className="open-admin-capture">
    <div className="open-capture-header"><strong>{label}</strong><span>{r.seconds}s / 120s</span></div>
    <div className="open-admin-actions"><button onClick={async()=>{try{if(r.recording)r.stop();else await r.start()}catch(e){setError((e as Error).message)}}}>{r.recording?<><Square size={15}/> Stop</>:<><Mic size={15}/> {r.clip?"Record again":"Record"}</>}</button>{preview&&<audio controls src={preview}/>}</div>
    {r.clip&&!r.recording&&<button disabled={busy||r.clip.size>3*1024*1024} className="open-admin-save" onClick={save}>{busy?"Saving…":"Use this recording"}</button>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
export default function OpenLineAdmin(){
  const [messages,setMessages]=useState<Message[]>([]),[cues,setCues]=useState<Cue[]>([]);
  const [selected,setSelected]=useState<string|null>(null),[cueId,setCueId]=useState(""),[note,setNote]=useState("");
  const [error,setError]=useState(""),[success,setSuccess]=useState(""),[version,setVersion]=useState(0);
  const current=messages.find(x=>x.id===selected);
  useEffect(()=>{Promise.all([api("list"),api("cues")]).then(([m,c])=>{setMessages(m.messages);setCues(c.cues)}).catch(e=>setError(e.message))},[version]);
  const src=(type:"original"|"reply"|"cue",id:string)=>"/api/feed?open_line=listen&type="+type+"&id="+encodeURIComponent(id);
  async function saveReply(audio:{data:string;mime:string}){
    if(!current)return;
    if(!confirm("Save this recording and email the listener a private reply link?"))return;
    setError("");setSuccess("");
    try{await api("reply",{id:current.id,audio,cueId,note});setSuccess("Reply saved and email sent.");setVersion(v=>v+1)}
    catch(e){setError((e as Error).message+" If the message was saved but email failed, it is not marked delivered.")}
  }
  return <section className="open-admin">
    <div className="open-admin-heading"><h2>CBN / Open Line</h2><button onClick={()=>setVersion(v=>v+1)}><RefreshCw size={16}/> Refresh</button></div>
    <p>Private incoming recordings. Choose a submission, listen, record your reply, and email it back. Nothing is published on the public homepage.</p>
    {error&&<p className="open-admin-error" role="alert">{error}</p>}{success&&<p className="open-admin-success" role="status">{success}</p>}
    <div className="open-admin-grid">
      <div className="open-admin-list">
        <h3>Inbox · {messages.length}</h3>
        {!messages.length&&<p>No submissions yet.</p>}
        {messages.map(x=><button key={x.id} className={selected===x.id?"selected":""} onClick={()=>{setSelected(x.id);setSuccess("");setError("")}}>
          <span><strong>{x.alias||"Anonymous"}</strong><small>{x.email}</small></span>
          <span><small>{new Date(x.created_at).toLocaleDateString()}</small><em>{x.emailed_at?"EMAIL SENT":x.has_reply?"REPLY SAVED":"NEW"}</em></span>
        </button>)}
      </div>
      <div className="open-admin-detail">
        {!current?<p>Select a recording to review.</p>:<>
          <h3>{current.alias||"Anonymous"}</h3>
          <p>{current.email} · Received {new Date(current.created_at).toLocaleString()}</p>
          <div className="open-audio-row"><span>INCOMING VOICE</span><audio controls key={current.id} src={src("original",current.id)}/><a href={src("original",current.id)+"&download=1"} download><Download size={16}/> Download original</a></div>
          {current.has_reply&&<div className="open-audio-row"><span>YOUR SAVED RESPONSE</span><audio controls src={src("reply",current.id)}/><a href={src("reply",current.id)} download><Download size={16}/> Download reply</a></div>}
          <h3>Build your response</h3>
          <label htmlFor="open-cue">PRE-RECORDED BREAK</label>
          <select id="open-cue" value={cueId} onChange={e=>setCueId(e.target.value)}><option value="">No break</option>{cues.filter(x=>x.recorded).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select>
          {cueId&&<audio controls src={src("cue",cueId)} />}
          <label htmlFor="open-note">PRIVATE EMAIL NOTE (OPTIONAL)</label><textarea id="open-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={600} placeholder="Optional show notes for this response"/>
          <AudioCapture key={current.id} label="Record your response" onCaptured={saveReply}/>
          <p className="open-admin-help"><Send size={14}/> The recipient receives a private link that plays their message, your selected recorded break, and your response in sequence.</p>
        </>}
      </div>
    </div>
    <div className="open-admin-cues"><h3>Station IDs / Recorded breaks</h3><p>Record these once, then insert them between a listener's message and your reply.</p>
      <div className="open-admin-cue-grid">{cues.map(x=><div key={x.id}><strong>{x.label}</strong><small>{x.recorded?"Ready to use":"No clip recorded yet"}</small>{x.recorded&&<audio controls src={src("cue",x.id)}/>}
        <AudioCapture label={x.recorded?"Replace interlude":"Record interlude"} onCaptured={async audio=>{await api("save-cue",{id:x.id,audio});setVersion(v=>v+1)}}/></div>)}</div>
    </div>
  </section>;
}