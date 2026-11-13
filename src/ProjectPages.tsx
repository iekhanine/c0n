import { useEffect, useState } from "react";
import { ArrowUp, MessageCircle, ArrowUpRight, ImagePlus } from "lucide-react";
import { readImage, socialApi } from "./Social";
export type Project = {
  id: string;
  title: string;
  body: string;
  category: string;
  image_url: string;
  git_url: string;
  link_url: string;
  author_name: string;
  avatar_url?: string;
  owner_id?: string;
  votes: number;
  comments: number;
  voted?: boolean;
};
type Draft = {
  title: string;
  body: string;
  category: string;
  image_url: string;
  git_url: string;
  link_url: string;
};
type Owned = {
  id: string;
  version: number;
  draft: Draft;
  published: Draft | null;
  status: string;
  owner_name: string;
  review_note: string;
};
export async function projectApi(
  action: string,
  method = "GET",
  body?: unknown,
  id?: string,
) {
  const r = await fetch(
    `/api/projects?action=${action}${id ? "&id=" + encodeURIComponent(id) : ""}`,
    {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Could not complete that request.");
  return d;
}
export function VoteButton({
  project,
  onChange,
}: {
  project: Project;
  onChange: (votes: number, voted: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function vote() {
    setBusy(true);
    setError("");
    try {
      const d = await projectApi("vote", "PUT", {
        id: project.id,
        voted: !project.voted,
      });
      onChange(d.votes, d.voted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="vote-control">
      <button
        className="project-vote"
        aria-label={`Upvote ${project.title}`}
        aria-pressed={Boolean(project.voted)}
        disabled={busy}
        onClick={() => void vote()}
      >
        <ArrowUp size={18} />
        {project.votes || 0}
      </button>
      {error && (
        <span className="vote-error" role="alert">
          {error} <a href="/api/auth/discord/login">Discord sign-in</a>
        </span>
      )}
    </span>
  );
}
const safe = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
export function ProjectPage({ id }: { id: string }) {
  const [data, setData] = useState<{
      project: Project;
      comments: {
        id: string;
        user_id: string;
        user_name: string;
        body: string;
        created_at: string;
      }[];
      canEdit: boolean;
      canModerate?: boolean;
      isPublished?: boolean;
    } | null>(null),
    [user, setUser] = useState<{ id: string } | null>(null),
    [error, setError] = useState(""),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setData(await projectApi("detail", "GET", undefined, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load project.");
    }
  }
  useEffect(() => {
    void load();
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, [id]);
  async function post() {
    setBusy(true);
    setError("");
    try {
      await projectApi("comment", "POST", { id, body: comment });
      setComment("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comment failed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(commentId: string) {
    try {
      await projectApi("comment", "DELETE", { id, comment_id: commentId });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove comment.");
    }
  }
  if (!data)
    return (
      <section className="project-detail">
        <p role="status">{error || "Loading project…"}</p>
        <a href="/projects">Back to projects</a>
      </section>
    );
  const p = data.project;
  return (
    <section className="project-detail">
      <a href="/projects">← All projects</a>
      <div className="project-detail-heading">
        <div>
          <span className="project-tag">{p.category}</span>
          <h1>{p.title}</h1>
          <p className="project-detail-author">
            {p.avatar_url && <img src={p.avatar_url} alt="" className="member-initial project-author-avatar" />}
            <span>Created by{" "}
              {p.owner_id ? (
                <a href={`/members/${p.owner_id}`}>{p.author_name}</a>
              ) : p.author_name}
            </span>
          </p>
        </div>
        {data.canEdit && (
          <a className="rail-button" href={`/my-projects?edit=${id}`}>
            Edit my project
          </a>
        )}
      </div>
      {safe(p.image_url) && (
        <img
          className="project-detail-image"
          src={safe(p.image_url)}
          alt={p.title}
        />
      )}
      <p className="project-detail-body">{p.body}</p>
      <div className="project-detail-actions">
        {!data.isPublished ? (
          <p>
            Draft preview. Publish your project to enable voting and comments.
          </p>
        ) : (
          <VoteButton
            project={p}
            onChange={(votes, voted) =>
              setData({ ...data, project: { ...p, votes, voted } })
            }
          />
        )}
        <span>
          <MessageCircle size={18} />
          {data.comments.length} comments
        </span>
        {safe(p.link_url) && (
          <a href={safe(p.link_url)} target="_blank" rel="noreferrer">
            Visit project <ArrowUpRight size={18} />
          </a>
        )}
      </div>
      {safe(p.git_url) && (
        <p className="project-git-link">
          <a href={safe(p.git_url)} target="_blank" rel="noreferrer">
            View Git repository <ArrowUpRight size={18} />
          </a>
        </p>
      )}
      <section id="comments">
        <h2>Comments</h2>
        {error && <p role="alert">{error}</p>}
        {!data.isPublished ? (
          <a href="/my-projects">Create your own project page</a>
        ) : user ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void post();
            }}
          >
            <label htmlFor="project-comment">Join the conversation</label>
            <textarea
              id="project-comment"
              value={comment}
              maxLength={2000}
              rows={3}
              onChange={(e) => setComment(e.target.value)}
              required
            />
            <button disabled={busy || !comment.trim()}>
              {busy ? "Posting…" : "Post comment"}
            </button>
          </form>
        ) : (
          <a href="/api/auth/discord/login">
            Sign in with Discord to vote and comment
          </a>
        )}
        {data.comments.map((c) => (
          <article className="project-comment" key={c.id}>
            <header>
              <strong>{c.user_name}</strong>
              <time dateTime={c.created_at}>
                {new Date(c.created_at).toLocaleString()}
              </time>
              {(user?.id === c.user_id || data.canModerate) && (
                <button onClick={() => void remove(c.id)}>Delete</button>
              )}
            </header>
            <p>{c.body}</p>
          </article>
        ))}
      </section>
    </section>
  );
}
const empty: Draft = {
  title: "",
  body: "",
  category: "Apps",
  link_url: "",
  image_url: "",
  git_url: "",
};
export function MemberProjects() {
  const [mine, setMine] = useState<Owned[]>([]),
    [owner, setOwner] = useState(false),
    [member, setMember] = useState<boolean | null>(null),
    [selected, setSelected] = useState<Owned | null>(null),
    [draft, setDraft] = useState<Draft>(empty),
    [categories, setCategories] = useState<string[]>(["Apps","Websites","Tools","Experiments"]),
    [customCategory, setCustomCategory] = useState(""),
    [categoryOpen, setCategoryOpen] = useState(false),
    [projectFilter, setProjectFilter] = useState("All"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [uploadingImage, setUploadingImage] = useState(false),
    [loading, setLoading] = useState(true);
  async function load() {
    setError("");
    try {
      const d = await projectApi("mine");
      setMine(d.projects);
      const list=await projectApi("categories");
      setCategories(list.categories.filter((c:{active:boolean})=>c.active).map((c:{name:string})=>c.name));
      setOwner(d.owner);
      const edit = new URLSearchParams(location.search).get("edit");
      if (edit) {
        const p = d.projects.find((p: Owned) => p.id === edit);
        if (p) {
          setSelected(p);
          setDraft({ ...empty, ...p.draft });
        }
        history.replaceState(null, "", location.pathname);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspace.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        setOwner(Boolean(d.owner));
        setMember(Boolean(d.user));
        if (d.owner)
          void projectApi("seed", "POST", {})
            .then(() => load())
            .catch((e) => setError(e.message));
      })
      .catch(() => {});
  }, []);
  async function save(submit: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await projectApi("save", selected ? "PUT" : "POST", {
        ...draft,
        ...(selected ? { id: selected.id, version: selected.version } : {}),
        submit,
      });
      setSelected(null);
      setDraft(empty);
      setCustomCategory("");
      setCategoryOpen(false);
      setMessage(
        submit
          ? "Submitted for review. Your project goes live after approval."
          : "Draft saved.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  async function addCustomCategory(){
    setError("");
    try{
      const response=await projectApi("categories","POST",{name:customCategory});
      setCategories(previous=>[...new Set([...previous,response.name])].sort());
      setDraft(previous=>({...previous,category:response.name}));
      setCustomCategory("");
      setCategoryOpen(false);
      setMessage("Category added across the site.");
    } catch(e){setError(e instanceof Error?e.message:"Could not create category.");}
  }
  async function uploadPreview(file: File) {
    setUploadingImage(true);
    setError("");
    try {
      if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type))
        throw Error("Use a PNG, JPEG, GIF or WebP image.");
      const result = await socialApi<{ image_url: string }>("upload", "POST", {
        data: await readImage(file),
      });
      setDraft(previous => ({ ...previous, image_url: result.image_url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed.");
    } finally {
      setUploadingImage(false);
    }
  }
  async function setup() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin?action=setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Storage update failed.");
    } finally {
      setBusy(false);
    }
  }
  if (member === false)
    return (
      <section className="member-workspace">
        <h1>Your project workspace</h1>
        <p>
          Sign in with Discord to create a project page and submit it to the
          community showcase.
        </p>
        <a className="rail-button" href="/api/auth/discord/login">
          Sign in with Discord
        </a>
        <p>
          <a
            href="https://discord.gg/dSHMeZ4ETJ"
            target="_blank"
            rel="noreferrer"
          >
            Join our Discord ↗
          </a>
        </p>
      </section>
    );
  return (
    <section className="member-workspace">
      <header className="member-workspace-head">
        <div><span className="workspace-eyebrow">CREATOR WORKSPACE</span>
          <h1>My work</h1>
          <p>Show the community what you've created. Apps, photography, handmade crafts, music, services and everything in between.</p>
        </div>
        <button type="button" className="workspace-new-primary" onClick={()=>{setSelected(null);setDraft(empty);setMessage("");}}>
          + Create something
        </button>
      </header>
      <div className="workspace-metrics">
        <div><strong>{mine.length}</strong><span>Total works</span></div>
        <div><strong>{mine.filter(p=>p.status==="approved").length}</strong><span>Published</span></div>
        <div><strong>{mine.filter(p=>p.status==="pending").length}</strong><span>Awaiting review</span></div>
        <div><strong>{mine.filter(p=>p.status==="draft").length}</strong><span>Drafts</span></div>
      </div>
      {loading && <p role="status">Loading your workspace…</p>}
      {error && (
        <div role="alert" className="workspace-error">
          {error}
          {error.includes("Sign in") && (
            <a href="/api/auth/discord/login">Sign in with Discord</a>
          )}
          {owner && (
            <button disabled={busy} onClick={() => void setup()}>
              Owner: apply project storage update
            </button>
          )}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <div className="workspace-layout">
        <section className="workspace-inventory">
          <div className="workspace-inventory-heading">
            <h2>Your work</h2>
            <select aria-label="Filter your work" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}>
              {["All","draft","pending","approved","rejected"].map(v=><option key={v} value={v}>{v==="All"?"All statuses":v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
            </select>
          </div>
          <div className="workspace-inventory-list">
            {mine.filter(p=>projectFilter==="All"||p.status===projectFilter).map(p=>(
              <button type="button" className={"owned-project-card"+(selected?.id===p.id?" selected":"")} key={p.id}
                onClick={()=>{setSelected(p);setDraft({...empty,...p.draft});setMessage("");}}>
                {safe(p.draft.image_url)?<img src={safe(p.draft.image_url)} alt="" loading="lazy"/>:<span className="owned-project-placeholder">{p.draft.title.slice(0,1).toUpperCase()}</span>}
                <span className="owned-project-content"><strong>{p.draft.title}</strong>
                  <small>{p.draft.category}</small><em data-status={p.status}>{p.status}</em>
                  {p.review_note&&<small>{p.review_note}</small>}
                </span>
              </button>
            ))}
            {!mine.length&&<p className="workspace-inventory-empty">No work added yet. Your first creation starts here.</p>}
            {!!mine.length&&!mine.some(p=>projectFilter==="All"||p.status===projectFilter)&&<p className="workspace-inventory-empty">No work matches this status.</p>}
          </div>
        </section>
        <form className="workspace-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
        >
          <div className="workspace-editor-head"><span className="workspace-eyebrow">{selected ? "EDIT CREATION" : "NEW CREATION"}</span><h2>{selected ? "Edit your work" : "Share something you made"}</h2><p>Present your work with an image, a story, and an optional link.</p></div>
          {selected?.published && (
            <p>
              Your current public page stays live until your changes are
              approved.
            </p>
          )}
          {[
            ["title", "Title"],
            ["body", "About this creation"],
            ["link_url", "Where to view it (optional URL)"],
            ["git_url", "Source repository (optional)"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              {key === "body" ? (
                <textarea
                  value={draft.body}
                  rows={6}
                  maxLength={10000}
                  required
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              ) : (
                <input
                  value={draft[key as keyof Draft]}
                  required={key === "title"}
                  type={key.includes("url") ? "url" : "text"}
                  maxLength={key === "title" ? 160 : 2000}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <div className="project-preview-upload">
            <label htmlFor="project-preview-file">Project preview image</label>
            <input id="project-preview-file" type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              disabled={busy || uploadingImage}
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadPreview(file);
              }}/>
            <small>PNG, JPEG, GIF or WebP · up to 2 MB. Uploaded images are public.</small>
            {uploadingImage && <p role="status"><ImagePlus size={16}/> Uploading preview…</p>}
            {safe(draft.image_url) && <div className="project-preview-upload-preview">
              <img src={safe(draft.image_url)} alt="Project preview" />
              <button type="button" disabled={busy || uploadingImage}
                onClick={() => setDraft(previous => ({...previous, image_url: ""}))}>
                Remove image
              </button>
            </div>}
          </div>
          <label>
            Category
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              {[...new Set([...categories, draft.category])].filter(Boolean).map(c=>(
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button type="button" className="workspace-add-category-toggle" onClick={()=>setCategoryOpen(v=>!v)}>+ Add a new category</button>
          {categoryOpen&&<div className="workspace-new-category">
            <label>Category name<input maxLength={39} value={customCategory} placeholder="Sculpture, Woodworking, Podcasts…" onChange={e=>setCustomCategory(e.target.value)}/></label>
            <button type="button" onClick={()=>void addCustomCategory()} disabled={customCategory.trim().length<2}>Create for everyone</button>
            <small>The category becomes available to everyone across the site.</small>
          </div>}
          <div className="workspace-actions">
            <button
              type="button"
              disabled={busy || uploadingImage || !draft.title.trim() || !draft.body.trim()}
              onClick={() => void save(false)}
            >
              Save draft
            </button>
            <button disabled={busy || uploadingImage}>Submit for approval</button>
            {selected?.published && (
              <a href={`/projects/${selected.id}`}>View live page ↗</a>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
