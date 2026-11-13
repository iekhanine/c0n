import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, Copy, Gift, LockKeyhole, Ticket, UserRoundCheck, ShieldCheck, ArrowRight } from "lucide-react";
import "./Membership.css";
type Member = {member_no:number;display_name:string;joined_at:string;active:boolean;invite_allowance:number;founding:boolean;invited_by:null|{member_no:number;name:string}};
type Invite = {serial:string;batch_no:number;status:string;city:string;state:string;created_at:string;redeemed_at?:string|null};
type Issued = {serial:string;code:string;url:string};
async function request<T>(action:string,method="GET",data?:unknown):Promise<T>{
  const r=await fetch("/api/membership?action="+action,{method,credentials:"same-origin",cache:"no-store",headers:data?{"Content-Type":"application/json"}:undefined,body:data?JSON.stringify(data):undefined});
  const answer=await r.json();if(!r.ok)throw Error(answer.error||"Request failed");return answer as T;
}
const pad=(n:number)=>String(n).padStart(6,"0");
export function MembershipPage({merch=false}:{merch?:boolean}){
  const [signedIn,setSignedIn]=useState<boolean|null>(null);
  const [member,setMember]=useState<Member|null>(null);
  const [counts,setCounts]=useState<{issued:number;redeemed:number;unused:number}|null>(null);
  const [invites,setInvites]=useState<Invite[]>([]);
  const [issued,setIssued]=useState<Issued[]>([]);
  const [code,setCode]=useState(()=>new URLSearchParams(location.search).get("code")||sessionStorage.getItem("con-pending-invite")||"");
  const [count,setCount]=useState(5);
  const [city,setCity]=useState("");
  const [state,setState]=useState("");
  const [zip,setZip]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  async function refresh(){
    const account=await fetch("/api/auth/session",{cache:"no-store"}).then(x=>x.json());
    setSignedIn(!!account.user);
    if(!account.user)return;
    const result=await request<{member:Member|null;counts?:{issued:number;redeemed:number;unused:number}}>("me");
    setMember(result.member);setCounts(result.counts||null);
    if(result.member?.active){const list=await request<{invites:Invite[]}>("invites");setInvites(list.invites);}
  }
  useEffect(()=>{
    const invite=new URLSearchParams(location.search).get("code");
    if(invite){sessionStorage.setItem("con-pending-invite",invite);history.replaceState({}, "", "/membership");}
    void refresh().catch(e=>setError(e.message));
  },[]);
  async function redeem(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{await request("redeem","POST",{code:code.trim()});history.replaceState({}, "", "/membership");sessionStorage.removeItem("con-pending-invite");window.location.assign("/");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function issue(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");setIssued([]);
    try{const result=await request<{issued:Issued[]}>("issue","POST",{count,city,state,zip});setIssued(result.issued);setNotice("Invitations created. Copy or share the links before leaving this page.");await refresh();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function revoke(serial:string){
    if(!window.confirm("Revoke this unused invitation?"))return;
    try{await request("revoke","POST",{serial});setNotice("Invitation revoked.");await refresh();}
    catch(e){setError((e as Error).message);}
  }
  const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);setNotice("Copied to clipboard.");}catch{setError("Copy failed. Select and copy the text manually.");}};
  return <div className="con-membership-page">
    <div className="con-membership-intro"><span className="con-member-eyebrow">THE COMPOUND / ACCESS</span><h1>{merch?"Member supply":"C0N membership"}</h1><p>{merch?"Official merch is available to verified members. Purchasing merchandise does not grant membership.":"Membership is invitation-only. Every member is connected to the person who invited them."}</p></div>
    {error&&<p className="con-member-error" role="alert">{error}</p>}
    {notice&&<p className="con-member-notice" role="status">{notice}</p>}
    {signedIn===null?<p>Checking your access…</p>:!signedIn?<div className="con-member-panel"><LockKeyhole/><h2>Sign in to continue</h2><p>Use your Discord account to activate an invitation or access your membership.</p><a className="con-member-action" href="/api/auth/discord/login">Continue with Discord <ArrowRight size={17}/></a></div>:
    merch?(!member?.active?<div className="con-member-panel"><LockKeyhole/><h2>Members only</h2><p>Official C0N merchandise is reserved for verified members. You can join through an invitation from an existing member.</p><a className="con-member-action" href="/membership">Redeem an invitation</a></div>:<div className="con-member-panel"><BadgeCheck/><h2>Welcome to Supply, member {pad(member.member_no)}</h2><p>The members-only storefront is ready for merchandise listings. Products and checkout are not connected yet; no orders are being accepted.</p><a className="con-member-action" href="/membership">Your membership card</a></div>):
    !member?<div className="con-member-panel"><Ticket/><h2>Have an invitation?</h2><p>Enter the one-time code provided by a verified member. A merch purchase will not activate membership.</p><form onSubmit={redeem} className="con-member-form"><label htmlFor="member-code">Invitation code</label><input id="member-code" value={code} autoCapitalize="characters" onChange={e=>setCode(e.target.value)} placeholder="XXXXXX-XXXXXX-XXXXXX" required/><button disabled={busy}>Activate membership</button></form></div>:
    <div className="con-membership-layout">
      <div className="con-membership-main">
        <section className="con-pass-section"><div className="con-member-section-head"><div><span className="con-member-eyebrow">MEMBERSHIP / DIGITAL</span><h2>Your membership pass</h2></div><span className="con-member-status"><BadgeCheck size={15}/> {member.active?"ACTIVE":"INACTIVE"}</span></div>
          <div className="con-digital-pass">
            <div className="con-pass-top"><img src="/con-logo.png" alt="C0N"/><div><b>CULT OF NIX0N</b><span>THE COMPOUND</span></div></div>
            <div className="con-pass-identity"><span><ShieldCheck size={17}/> VERIFIED MEMBER</span><h2>@{member.display_name}</h2><p>MEMBER NO. <strong>{pad(member.member_no)}</strong></p></div>
            <div className="con-pass-bottom"><span>{member.founding?"FOUNDING MEMBER":"VERIFIED MEMBER"}</span><span>MEMBER SINCE {new Date(member.joined_at).getFullYear()}</span></div>
            <div className="con-pass-lineage">INVITED BY: {member.invited_by?member.invited_by.name+" / "+pad(member.invited_by.member_no):"GENESIS"}</div>
          </div>
          <p className="con-member-muted">This is your digital C0N card. Apple Wallet and Samsung Wallet passes will be added after issuer enrollment. A membership number alone is not proof of identity.</p>
        </section>
        {member.active&&<section className="con-member-panel"><div className="con-member-section-head"><div><span className="con-member-eyebrow">DISTRIBUTION</span><h2>Issue digital invitations</h2></div><Gift/></div><p>Each one-use link connects a new member to your account. Your allowance is {member.invite_allowance} issued invitations.</p>
          <form className="con-member-form" onSubmit={issue}>
            <div className="con-invite-fields"><label>Number of invitations<input type="number" min={1} max={10} value={count} onChange={e=>setCount(Number(e.target.value))}/></label><label>City (optional)<input value={city} maxLength={64} onChange={e=>setCity(e.target.value)} placeholder="Racine"/></label><label>State (optional)<input value={state} maxLength={24} onChange={e=>setState(e.target.value)} placeholder="WI"/></label><label>ZIP (optional)<input value={zip} maxLength={12} onChange={e=>setZip(e.target.value)} placeholder="53403"/></label></div>
            <button disabled={busy}>Generate invitations</button>
          </form>
          {issued.length>0&&<div className="con-issued-list"><h3>New invitations · save these now</h3>{issued.map(item=><div key={item.serial} className="con-invite-item"><div><strong>{item.serial}</strong><code>{item.code}</code></div><button onClick={()=>void copy(item.url)}><Copy size={15}/> Copy link</button></div>)}</div>}
        </section>}
        {member.active&&<section className="con-member-panel"><h2>Invitation history</h2>{invites.length===0?<p>No invitations issued yet.</p>:<div className="con-member-invite-list">{invites.map(item=><div className="con-invite-item" key={item.serial}><div><strong>{item.serial}</strong><small>{item.status.toUpperCase()}{item.city?", "+item.city:""}</small></div>{item.status==="available"&&<button onClick={()=>void revoke(item.serial)}>Revoke</button>}</div>)}</div>}</section>}
      </div>
      <aside className="con-membership-side"><div className="con-member-panel"><UserRoundCheck/><h3>The network</h3><div className="con-member-stat"><strong>{pad(member.member_no)}</strong><span>Your member number</span></div><div className="con-member-stat"><strong>{counts?.redeemed||0}</strong><span>Members invited</span></div><div className="con-member-stat"><strong>{counts?.unused||0}</strong><span>Invitations available</span></div></div><a href="/merch" className="con-member-panel con-merch-link"><Gift/><h3>Member supply</h3><p>Members-only merchandise</p><span>Explore merch →</span></a></aside>
    </div>}
  </div>;
}
