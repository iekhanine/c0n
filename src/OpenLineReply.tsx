import {useEffect,useRef,useState} from "react";
import "./OpenLine.css";
type Info={alias:string;hasCue:boolean};
export default function OpenLineReply(){
  const token=decodeURIComponent(location.pathname.split("/")[2]||"");
  const [info,setInfo]=useState<Info|null>(null),[error,setError]=useState(""),[step,setStep]=useState(0),[playing,setPlaying]=useState(false);
  const player=useRef<HTMLAudioElement|null>(null);
  useEffect(()=>{fetch("/api/feed?open_line=public-reply&token="+encodeURIComponent(token),{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Response unavailable");setInfo(d)}).catch(e=>setError(e.message))},[token]);
  const parts=info?["original",...(info.hasCue?["cue"]:[]),"reply"]:[];
  const play=(n=0)=>{setStep(n);setPlaying(true);requestAnimationFrame(()=>{const node=player.current;if(node){node.src="/api/feed?open_line=public-reply&token="+encodeURIComponent(token)+"&part="+parts[n];void node.play().catch(()=>setPlaying(false))}})};
  return <main className="open-line"><div className="ol-shell"><div className="ol-main"><span className="ol-kicker">PRIVATE FREQUENCY / CBN OPEN LINE</span><h1>We've got<br/><em>a response.</em></h1><p className="ol-intro">This listening link was delivered to the email address used for the original transmission. Anyone with the link can listen, so keep it private.</p><div className="ol-panel">
    {error&&<p className="ol-error" role="alert">{error}</p>}
    {info&&<><div className="ol-panel-head">INCOMING TRANSMISSION · {info.alias||"ANONYMOUS"}</div><p>One continuous conversation in three parts: your recording, our station break, and our response.</p><audio ref={player} controls onEnded={()=>{if(step+1<parts.length)play(step+1);else setPlaying(false)}} onError={()=>{setError("Audio playback failed. Try again.");setPlaying(false)}} style={{display:"block",width:"100%",margin:"20px 0"}}/><button className="ol-primary" onClick={()=>play(0)}>{playing?"RESTART FROM THE BEGINNING":"PLAY THE RESPONSE"}</button><p className="ol-micro">Segment {step+1} of {parts.length}: {parts[step]||"original"}</p></>}
  </div></div></div></main>;
}