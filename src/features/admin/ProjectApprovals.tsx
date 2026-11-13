import { useEffect, useState } from "react";
import { projectApi } from "../../ProjectPages";

type Submission = {
  id: string; version: number; owner_name: string;
  draft: { title:string; body:string; category:string; image_url:string; link_url:string; git_url:string };
  published?: object | null;
};
export default function ProjectApprovals() {
  const [queue,setQueue]=useState<Submission[]>([]);
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  async function load() {
    try { const response=await projectApi("review"); setQueue(response.projects); setError(""); }
    catch(e) { setError(e instanceof Error ? e.message : "Review queue unavailable."); }
  }
  useEffect(() => { void load(); }, []);
  async function decide(p:Submission,decision:string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await projectApi("review","PUT",{id:p.id,version:p.version,decision,note});
      setNotice(decision==="approve" ? "Published." : "Review recorded.");
      setNote(""); await load();
    } catch(e) {setError(e instanceof Error ? e.message : "Review failed.");}
    finally {setBusy(false);}
  }
  return <div className="con-approvals con-surface">
    <header><h2>Project approval queue</h2><p>Review member submissions before they appear publicly. Existing approved versions remain visible while edits are reviewed.</p></header>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <label>Review note (optional)
      <textarea rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/>
    </label>
    <button type="button" onClick={()=>void load()} disabled={busy}>Refresh queue</button>
    {!queue.length && !error && <p>No submissions waiting for review.</p>}
    <div className="con-approval-grid">{queue.map(p=><article key={p.id}>
      {p.draft.image_url?.startsWith("https://") && <img src={p.draft.image_url} alt="" loading="lazy"/>}
      <div className="con-approval-copy">
        <span>{p.draft.category} · by {p.owner_name}</span>
        <h3>{p.draft.title}</h3>
        <p>{p.draft.body}</p>
        <div className="con-approval-links">
          {p.draft.link_url?.startsWith("https://") && <a href={p.draft.link_url} target="_blank" rel="noreferrer">View work</a>}
          {p.draft.git_url?.startsWith("https://") && <a href={p.draft.git_url} target="_blank" rel="noreferrer">View repository</a>}
        </div>
        <div className="con-approval-actions">
          <button disabled={busy} onClick={()=>void decide(p,"approve")}>Approve & publish</button>
          <button disabled={busy} onClick={()=>void decide(p,"reject")}>Reject</button>
          {p.published && <button disabled={busy} onClick={()=>void decide(p,"unpublish")}>Unpublish</button>}
        </div>
      </div>
    </article>)}</div>
  </div>;
}
