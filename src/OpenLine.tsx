import { useEffect, useRef, useState } from "react";
import { Mic, Square, Send, LockKeyhole, CheckCircle2 } from "lucide-react";
import "./OpenLine.css";

type AudioFile = {data:string;mime:string};
type Challenge = {choices:string[];sequence:string[];challenge:string};
async function api(action:string,body?:object) {
  const r=await fetch("/api/open-line?action="+action,{
    method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:{},
    body:body?JSON.stringify(body):undefined,cache:"no-store"
  });
  const d=await r.json();
  if(!r.ok)throw Error(d.error||"Request failed");
  return d;
}
function asFile(blob:Blob):Promise<AudioFile> {
  return new Promise((resolve,reject)=> {
    const rd=new FileReader();
    rd.onerror=()=>reject(Error("Unable to load recording"));
    rd.onload=()=>resolve({mime:blob.type.split(";")[0],data:String(rd.result).split(",")[1]});
    rd.readAsDataURL(blob);
  });
}
export function useVoiceRecorder() {
  const recorder=useRef<MediaRecorder|null>(null), stream=useRef<MediaStream|null>(null), chunks=useRef<Blob[]>([]);
  const [recording,setRecording]=useState(false),[clip,setClip]=useState<Blob|null>(null),[seconds,setSeconds]=useState(0);
  useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(v=>v+1),1000);return()=>clearInterval(timer)},[recording]);
  useEffect(()=>()=>{recorder.current?.state==="recording"&&recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop())},[]);
  async function start(){
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)throw Error("Your browser does not support microphone recording.");
    const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    stream.current=mic;chunks.current=[];setClip(null);setSeconds(0);
    const mime=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg"].find(x=>MediaRecorder.isTypeSupported(x));
    const rec=new MediaRecorder(mic,mime?{mimeType:mime,audioBitsPerSecond:32000}:undefined);
    recorder.current=rec;
    rec.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};
    rec.onstop=()=>{setClip(new Blob(chunks.current,{type:rec.mimeType.split(";")[0]}));mic.getTracks().forEach(t=>t.stop());setRecording(false)};
    rec.start();setRecording(true);
  }
  function stop(){if(recorder.current?.state==="recording")recorder.current.stop()}
  useEffect(()=>{if(recording&&seconds>=120)stop()},[seconds,recording]);
  return {start,stop,recording,clip,setClip,seconds};
}
export {api,asFile};
export default function OpenLine(){
  const [challenge,setChallenge]=useState<Challenge|null>(null),[steps,setSteps]=useState<string[]>([]);
  const [email,setEmail]=useState(""),[code,setCode]=useState(""),[alias,setAlias]=useState("");
  const [grant,setGrant]=useState(""),[stage,setStage]=useState<"challenge"|"code"|"record"|"done">("challenge");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[consent,setConsent]=useState(false);
  const recorder=useVoiceRecorder(),[preview,setPreview]=useState("");
  useEffect(()=>{api("challenge").then(setChallenge).catch(e=>setError(e.message))},[]);
  useEffect(()=>{if(!recorder.clip){setPreview("");return}const u=URL.createObjectURL(recorder.clip);setPreview(u);return()=>URL.revokeObjectURL(u)},[recorder.clip]);
  function press(v:string){if(steps.length<4)setSteps(old=>[...old,v])}
  async function sendCode(){
    if(!challenge)return;
    setBusy(true);setError("");
    try{await api("request",{email,challenge:challenge.challenge,sequence:steps});setStage("code")}
    catch(e){setError((e as Error).message);setSteps([]);api("challenge").then(setChallenge).catch(()=>{})}
    finally{setBusy(false)}
  }
  async function verify(){
    setBusy(true);setError("");
    try{const r=await api("verify",{email,code});setGrant(r.grant);setStage("record")}
    catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }
  async function submit(){
    if(!recorder.clip||!consent)return;
    setBusy(true);setError("");
    try{await api("submit",{grant,alias,consent:true,audio:await asFile(recorder.clip)});setStage("done")}
    catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }
  return <section className="open-line">
    <div className="ol-shell">
      <div className="ol-eyebrow"><span className="ol-dot"/> CULT OF NIX0N / OPEN LINE / GLOBAL TRANSMISSIONS</div>
      <div className="ol-main">
        <span className="ol-kicker">THE FLOOR IS YOURS.</span>
        <h1>Say it.<br/><em>We’re listening.</em></h1>
        <p className="ol-intro">A thought. A question. A confession. A completely terrible idea. Leave your voice on the record. We might have something to say back.</p>
        <div className="ol-panel">
          {stage==="challenge"&&<>
            <div className="ol-panel-head"><LockKeyhole size={18}/><span>01 / REQUEST TRANSMISSION ACCESS</span></div>
            <label htmlFor="ol-email">YOUR EMAIL ADDRESS</label>
            <input id="ol-email" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
            <p className="ol-micro">No account. No password. We’ll send a one-time access code and your eventual reply here.</p>
            <div className="ol-sequence"><span>PROVE YOU'RE HUMAN(ISH)</span><p>Press the four symbols in this order:</p><div className="ol-code">{challenge?.sequence.map((s,i)=><b key={i}>{s}</b>)}</div>
              <div className="ol-keypad">{challenge?.choices.map((s,i)=><button type="button" key={i} onClick={()=>press(s)} disabled={steps.length===4}>{s}</button>)}</div>
              <div className="ol-entered">{steps.join(" · ") || "— · — · — · —"} <button type="button" onClick={()=>setSteps([])}>CLEAR</button></div>
            </div>
            <button className="ol-primary" disabled={!email.trim()||steps.length!==4||busy} onClick={sendCode}>{busy?"SENDING…":"SEND MY ACCESS CODE"} <Send size={17}/></button>
          </>}
          {stage==="code"&&<>
            <div className="ol-panel-head"><LockKeyhole size={18}/><span>02 / VERIFY ACCESS</span></div>
            <p>Enter the six-digit code sent to <strong>{email}</strong>. Expires in ten minutes.</p>
            <label htmlFor="ol-code-entry">ACCESS CODE</label>
            <input id="ol-code-entry" inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="000000" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/>
            <button className="ol-primary" disabled={code.length!==6||busy} onClick={verify}>UNLOCK THE MICROPHONE</button>
            <button className="ol-text-button" onClick={()=>{setStage("challenge");setSteps([]);api("challenge").then(setChallenge).catch(()=>{})}}>Start over</button>
          </>}
          {stage==="record"&&<>
            <div className="ol-panel-head"><Mic size={18}/><span>03 / LEAVE YOUR MESSAGE</span></div>
            <label htmlFor="ol-alias">NAME OR ALIAS (OPTIONAL)</label><input id="ol-alias" maxLength={60} value={alias} onChange={e=>setAlias(e.target.value)} placeholder="Anonymous troublemaker"/>
            <div className={"ol-recorder"+(recorder.recording?" active":"")}>
              <div className="ol-time">{String(Math.floor(recorder.seconds/60)).padStart(2,"0")}:{String(recorder.seconds%60).padStart(2,"0")} <span>/ 02:00</span></div>
              <div className="ol-wave">{Array.from({length:40},(_,i)=><span key={i} style={{height:(8+Math.abs(Math.sin(i*2.34))*38)+"px"}}/>)}</div>
              {preview?<audio controls src={preview} className="ol-audio"/>:null}
              <div className="ol-actions"><button className="ol-primary" disabled={busy} onClick={async()=>{try{if(recorder.recording)recorder.stop();else await recorder.start()}catch(e){setError((e as Error).message)}}}>{recorder.recording?<><Square size={16}/> STOP RECORDING</>:<><Mic size={17}/> {recorder.clip?"RECORD AGAIN":"START RECORDING"}</>}</button></div>
              <p className="ol-micro">Use a quiet room. Listen back before submitting. Maximum 2 minutes.</p>
            </div>
            {recorder.clip&&!recorder.recording&&<><label className="ol-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I agree that this recording and any reply may be used publicly in CBN programming. My email stays private.</label><button className="ol-primary" disabled={!consent||busy||recorder.clip.size>3*1024*1024} onClick={submit}>{busy?"SUBMITTING…":"SUBMIT TRANSMISSION"} <Send size={16}/></button></>}
          </>}
          {stage==="done"&&<div className="ol-finished"><CheckCircle2 size={40}/><h2>Transmission received.</h2><p>Your message is in the queue. If we respond, you’ll receive a private listening link at <strong>{email}</strong>.</p></div>}
          {error&&<p className="ol-error" role="alert">{error}</p>}
        </div>
        <div className="ol-foot"><span>WORLDWIDE RECEPTION</span><span>NO LOGIN REQUIRED</span><span>LISTENING IS OPTIONAL. SPEAKING IS NOT.</span></div>
      </div>
    </div>
  </section>;
}
