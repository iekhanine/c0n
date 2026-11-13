import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Heart,
  MessageCircle,
  Link as LinkIcon,
  Pin,
  ImagePlus,
  ArrowUpRight,
} from "lucide-react";
import "./Social.css";
type User = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
};
export type SocialPost = {
  id: string;
  author_id: string;
  author_name: string;
  avatar_url?: string;
  title: string;
  body: string;
  image_url: string;
  published_at: string;
  updated_at?: string;
  kind: string;
  pinned?: boolean;
  likes: number;
  liked: boolean;
  replies: number;
  can_edit: boolean;
  version: number;
  link_url?: string;
  community_slug?: string;
  video_url?: string;
  notify_replies?: boolean;
  score?: number;
  vote?: number;
};
type PortfolioPiece = {
  kind: "image" | "website" | "video" | "game" | "craft" | "project" | "other";
  title: string;
  description: string;
  image_url: string;
  link_url: string;
};
const creativeDisciplines = [
  "Developer", "Designer", "Artist", "Photographer", "Videographer",
  "Musician", "Writer", "Maker & Craftsperson", "Business & Marketing",
  "Project Manager", "Game Creator", "Other",
];
const portfolioKinds = [
  ["image", "Photography / artwork"],
  ["website", "Website"],
  ["video", "Video"],
  ["game", "Game"],
  ["craft", "Physical creation / craft"],
  ["project", "Project"],
  ["other", "Other work"],
] as const;
type Profile = {
  user_id: string;
  name: string;
  username: string;
  avatar_url: string;
  cover_url: string;
  headline: string;
  bio: string;
  location: string;
  links: { label: string; url: string }[];
  show_projects: boolean;
  disciplines: string[];
  portfolio: PortfolioPiece[];
  available_for_work: boolean;
};
type Reply = {
  id: string;
  user_id: string;
  author_name: string;
  avatar_url: string;
  body: string;
  created_at: string;
  parent_id?: string | null;
  deleted_at?: string | null;
};
export const safeUrl = (value?: string) => {
  try {
    const u = new URL(value || "");
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
export async function socialApi<T = Record<string, unknown>>(
  action: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api/social?action=" + action, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed.");
  return data;
}
function useUser() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (active) setUser(d.user);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return user;
}
export async function readImage(file: File) {
  if (file.size > 2 * 1024 * 1024) throw Error("Choose an image up to 2 MB.");
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(Error("Could not read image."));
    r.readAsDataURL(file);
  });
}
export function Avatar({ name, url }: { name: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return safeUrl(url) && !failed ? (
    <img className="social-avatar" src={safeUrl(url)} alt="" loading="lazy" onError={() => setFailed(true)}/>
  ) : (
    <span className="social-avatar social-initials">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
function ImageUpload({
  onUpload,
  label = "Add image",
  onBusyChange,
}: {
  onUpload: (url: string) => void;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="social-upload">
      <label>
        <ImagePlus size={17} />
        {busy ? "Uploading…" : label}
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            onBusyChange?.(true);
            setError("");
            try {
              const result = await socialApi<{ image_url: string }>(
                "upload",
                "POST",
                { data: await readImage(file) },
              );
              onUpload(result.image_url);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Upload failed.");
            } finally {
              setBusy(false);
              onBusyChange?.(false);
            }
          }}
        />
      </label>
      <small>PNG, JPEG, GIF, WebP · 2 MB</small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function PostCard({
  post: initial,
  full = false,
  onChange,
}: {
  post: SocialPost;
  full?: boolean;
  onChange?: () => void;
}) {
  const [post, setPost] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => setPost(initial), [initial]);
  async function like() {
    setBusy(true);
    setError("");
    try {
      await socialApi("like", "PUT", { id: post.id, liked: !post.liked });
      setPost((p) => ({
        ...p,
        liked: !p.liked,
        likes: p.likes + (p.liked ? -1 : 1),
      }));
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not like post.");
    } finally {
      setBusy(false);
    }
  }
  const truncated = !full && post.body.length > 600;
  return (
    <article className={"social-post " + (post.kind === "member" ? "social-member-post" : "social-editorial-post")}>
      {post.pinned && (
        <div className="social-pinned">
          <Pin size={13} />
          Pinned to profile
        </div>
      )}
      <header>
        <a className="social-author" href={"/members/" + post.author_id}>
          <Avatar name={post.author_name} url={post.avatar_url} />
          <span>
            <strong>{post.author_name}</strong>
            <small>
              {post.kind === "update" ? "C0N Blog" : "Member post"}
            </small>
          </span>
        </a>
        <a className="social-time" href={"/posts/" + post.id}>
          <time dateTime={post.published_at}>
            {new Date(post.published_at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </a>
      </header>
      {post.title &&
        (full ? (
          <h1>{post.title}</h1>
        ) : (
          <h2>
            <a href={"/posts/" + post.id}>{post.title}</a>
          </h2>
        ))}
      <p className="social-body">
        {truncated ? post.body.slice(0, 600) + "…" : post.body}
      </p>
      {safeUrl(post.image_url) && (
        <a
          href={full ? safeUrl(post.image_url) : "/posts/" + post.id}
          target={full ? "_blank" : undefined}
          rel="noreferrer"
          className="social-image"
        >
          <img
            src={safeUrl(post.image_url)}
            alt={post.title || "Image attached to post"}
            loading="lazy"
          />
        </a>
      )}
      {safeUrl(post.video_url) && <video className="con-post-video" controls preload="metadata" src={safeUrl(post.video_url)} /> }
      {safeUrl(post.link_url) && (
        <a
          className="social-external"
          href={safeUrl(post.link_url)}
          target="_blank"
          rel="noreferrer"
        >
          {new URL(post.link_url!).hostname}
          <ArrowUpRight size={15} />
        </a>
      )}
      {!full && (truncated || post.kind === "update") && (
        <a className="social-read" href={"/posts/" + post.id}>
          Read more…
        </a>
      )}
      <footer>
        <button
          aria-label={`${post.liked ? "Unlike" : "Like"} post, ${post.likes || 0} likes`}
          aria-pressed={post.liked}
          disabled={busy}
          onClick={() => void like()}
        >
          <Heart size={17} fill={post.liked ? "currentColor" : "none"} />
          {post.likes || 0}
        </button>
        <a href={"/posts/" + post.id + "#replies"}>
          <MessageCircle size={17} />
          {post.replies || 0}
        </a>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                window.location.origin + "/posts/" + post.id,
              );
              setCopied(true);
            } catch {
              setError(
                "Copy this link: " +
                  window.location.origin +
                  "/posts/" +
                  post.id,
              );
            }
          }}
        >
          <LinkIcon size={16} />
          {copied ? "Copied" : "Copy link"}
        </button>
      </footer>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
function Composer({
  onSave,
  post,
  onCancel,
  blog = false,
  onBusyChange,
}: {
  onSave: () => void;
  post?: SocialPost;
  onCancel?: () => void;
  blog?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState(blog ? post?.title || "" : ""),
    [body, setBody] = useState(post?.body || ""),
    [image, setImage] = useState(post?.image_url || ""),
    [pinned, setPinned] = useState(post?.pinned || false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onBusyChange?.(busy || uploading);
  }, [busy, uploading, onBusyChange]);
  const limit = blog ? 10000 : 1200;
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await socialApi("post", post ? "PUT" : "POST", {
        id: post?.id,
        version: post?.version,
        title,
        body,
        image_url: image,
        pinned,
      });
      setTitle("");
      setBody("");
      setImage("");
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save post.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="social-composer" onSubmit={(e) => void save(e)}>
      <h2 id="post-composer-title">
        {post ? "Edit post" : blog ? "New post" : "Quick post"}
      </h2>
      <fieldset disabled={busy || uploading}>
        {blog && (
          <label>
            Title (optional)
            <input
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A quick update, a new idea, a longer story…"
            />
          </label>
        )}
        <label>
          Your post
          <textarea
            autoFocus
            required
            maxLength={limit}
            rows={blog ? 7 : 4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share something with the community."
          />
        </label>
        <small>
          {body.length.toLocaleString()} / {limit.toLocaleString()}
        </small>
        <ImageUpload onUpload={setImage} onBusyChange={setUploading} />
        {image && (
          <>
            <img
              className="social-composer-image"
              src={safeUrl(image)}
              alt="Post preview"
            />
            <button type="button" onClick={() => setImage("")}>
              Remove image
            </button>
          </>
        )}
        {post && (
          <label className="social-check">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            Pin to my profile
          </label>
        )}
        <div className="social-form-actions">
          <button
            className="social-primary"
            disabled={busy || uploading || !body.trim() || body.length > limit}
          >
            {busy ? "Saving…" : post ? "Save changes" : "POST"}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="social-error">
          {error}
        </p>
      )}
    </form>
  );
}
function ComposerOverlay({
  post,
  blog,
  onSave,
  onClose,
}: {
  post?: SocialPost;
  blog: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="social-post-dialog"
      aria-labelledby="post-composer-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
    >
      <Composer
        post={post}
        blog={blog}
        onBusyChange={setPending}
        onSave={onSave}
        onCancel={onClose}
      />
    </dialog>
  );
}
// Community navigation and ranked, compact post rows.
type Community = { slug: string; name: string; description: string; creator_id: string; post_count?: number };
function VoteControl({ post }: { post: SocialPost }) {
  const [vote, setVote] = useState(post.vote || 0);
  const [score, setScore] = useState(post.score || 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setVote(post.vote || 0); setScore(post.score || 0); }, [post.id, post.vote, post.score]);
  async function set(direction: number) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const next = vote === direction ? 0 : direction;
      const result = await socialApi<{ score: number; vote: number }>("vote", "PUT", { id: post.id, value: next });
      setVote(result.vote); setScore(result.score);
    } catch (e) {
      if (e instanceof Error && /Sign in/.test(e.message)) {
        window.location.assign("/api/auth/discord/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Vote failed.");
    } finally { setBusy(false); }
  }
  return <div className="con-feed-votes" aria-label={`Score ${score}`}>
    <button type="button" disabled={busy} className={vote === 1 ? "active" : ""} aria-label={`Upvote ${post.title || "post"}`} aria-pressed={vote===1} onClick={() => void set(1)}>▲</button>
    <strong>{score}</strong>
    <button type="button" disabled={busy} className={vote === -1 ? "active down" : ""} aria-label={`Downvote ${post.title || "post"}`} aria-pressed={vote===-1} onClick={() => void set(-1)}>▼</button>
    {error && <span className="con-vote-error" role="alert">{error}</span>}
  </div>;
}
function FeedRow({ post, rank }: { post: SocialPost; rank: number }) {
  const title = post.title?.trim() || post.body.trim().split("\n").find(Boolean)?.slice(0,110) || "Untitled post";
  const posted = new Date(post.published_at);
  return <article className="con-feed-row">
    <span className="con-feed-rank" aria-hidden="true">{rank}.</span>
    <VoteControl post={post} />
    <div className="con-feed-entry">
      <h2><a href={safeUrl(post.link_url) ? `/out/${post.id}` : `/posts/${post.id}`}>{title}</a></h2>
      <div className="con-feed-byline">
        <time dateTime={post.published_at} title={Number.isNaN(posted.valueOf()) ? undefined : posted.toLocaleString()}>
          {Number.isNaN(posted.valueOf()) ? "Posted" : posted.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}
        </time>
        <span>by <a href={`/members/${post.author_id}`}>{post.author_name}</a></span>
        <span>to <a href={`/c/${post.community_slug || "community"}`} className="con-feed-community">c/{post.community_slug || "community"}</a></span>
        <a className="con-feed-comments" href={`/posts/${post.id}#replies`}>{post.replies || 0} comments</a>
      </div>
    </div>
  </article>;
}
export function StreamPage({ compact = false, communitySlug }: { compact?: boolean; communitySlug?: string }) {
  const user = useUser();
  const [posts,setPosts] = useState<SocialPost[]>([]);
  const [communities,setCommunities] = useState<Community[]>([]);
  const [community,setCommunity] = useState<Community | null>(null);
  const [error,setError] = useState("");
  const [next,setNext] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [showCreate,setShowCreate] = useState(false);
  const [showPost,setShowPost] = useState(() => new URLSearchParams(window.location.search).get("submit") === "1");
  const [slug,setSlug] = useState("");
  const [name,setName] = useState("");
  const [description,setDescription] = useState("");
  const [title,setTitle] = useState("");
  const [body,setBody] = useState("");
  const [link,setLink] = useState("");
  const [image,setImage] = useState("");
  const [video,setVideo] = useState("");
  const [postType,setPostType] = useState<"text"|"link">("text");
  const [notifyReplies,setNotifyReplies] = useState(true);
  const [uploading,setUploading] = useState(false);
  const postDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = postDialog.current;
    if (showPost && dialog && !dialog.open) dialog.showModal();
    if (!showPost && dialog?.open) dialog.close();
  },[showPost]);
  const [target,setTarget] = useState(communitySlug || "community");
  const [saving,setSaving] = useState(false);
  const [notice,setNotice] = useState("");
  useEffect(() => { setTarget(communitySlug || "community"); },[communitySlug]);
  async function load(more = false) {
    setLoading(true);
    try {
      const query = communitySlug ? "&community="+encodeURIComponent(communitySlug) : "";
      const cursor = more && next ? "&before="+encodeURIComponent(next) : "";
      const d = await socialApi<{ posts: SocialPost[]; next: string | null }>("feed"+query+cursor);
      setPosts(prev => more ? [...prev,...d.posts] : d.posts);
      setNext(d.next); setError("");
    } catch(e) { setError(e instanceof Error ? e.message : "Could not load posts."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    void socialApi<{ communities: Community[] }>("communities")
      .then(d => setCommunities(d.communities))
      .catch(() => {});
    if (communitySlug) {
      void socialApi<{ community: Community }>("community&slug="+encodeURIComponent(communitySlug))
        .then(d => setCommunity(d.community))
        .catch(() => setCommunity(null));
    } else setCommunity(null);
  },[communitySlug]);
  async function createCommunity(e: FormEvent) {
    e.preventDefault(); setSaving(true); setNotice("");
    try {
      const result = await socialApi<{community: Community}>("community","POST",{ slug:slug.toLowerCase(),name,description });
      window.location.assign("/c/"+result.community.slug);
    } catch(e) { setNotice(e instanceof Error ? e.message : "Couldn't create community."); setSaving(false); }
  }
  async function submitPost(e: FormEvent) {
    e.preventDefault(); setSaving(true); setNotice("");
    try {
      const result = await socialApi<{id:string}>("post","POST",{
        title,body:postType==="text"?body:"",link_url:postType==="link"?link:"",
        image_url:image,video_url:video,community_slug:target,notify_replies:notifyReplies,
      });
      window.location.assign("/posts/"+result.id);
    } catch(e) { setNotice(e instanceof Error ? e.message : "Couldn't publish."); setSaving(false); }
  }
  return <section className={"social-stream con-community-page "+(compact?"social-compact":"")}>
    {compact && user && <div className="con-compact-submit"><a href="/community?submit=1">+ Submit a post</a></div>}
    {!compact && <>
      <div className="con-community-heading">
        <div>
          <span className="con-community-kicker">{communitySlug ? "SUBCON" : "THE COMPOUND"}</span>
          <h1>{communitySlug ? "c/"+communitySlug : "Communities"}</h1>
          <p>{communitySlug ? community?.description || "Posts and conversations from this community." : "Everything happening across the C0N network."}</p>
        </div>
        <div className="con-community-actions">
          {user ? <>
            <button onClick={() => {setShowPost(true);setShowCreate(false);}}>+ New post</button>
            <button onClick={() => {setShowCreate(!showCreate);setShowPost(false);}}>+ Create subcon</button>
          </> : <a className="con-community-signin" href="/api/auth/discord/login">Sign in to post</a>}
        </div>
      </div>
      {showCreate && <form className="con-community-form" onSubmit={e=>void createCommunity(e)}>
        <h2>Create a subcon</h2>
        <label>Community URL <span>/c/{slug.toLowerCase() || "communityname"}</span>
          <input required minLength={3} maxLength={24} pattern="[a-z][a-z0-9_]{2,23}" value={slug} placeholder="communityname" onChange={e=>setSlug(e.target.value.toLowerCase())}/>
        </label>
        <label>Display name<input required minLength={3} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Description<textarea maxLength={2000} rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <button type="submit" disabled={saving}>Create community</button>
      </form>}
      <dialog ref={postDialog} className="con-submit-dialog" aria-labelledby="con-submit-title"
        onClose={() => setShowPost(false)}>
        <form className="con-community-form con-submit-form" onSubmit={e=>void submitPost(e)}>
          <div className="con-submit-heading">
            <div><span className="con-community-kicker">CREATE A POST</span><h2 id="con-submit-title">Submit to C0N</h2></div>
            <button type="button" aria-label="Close submission" onClick={() => setShowPost(false)}>✕</button>
          </div>
          <div className="con-submit-tabs" role="group" aria-label="Post type">
            <button type="button" className={postType==="link"?"selected":""} aria-pressed={postType==="link"} onClick={()=>setPostType("link")}>Link</button>
            <button type="button" className={postType==="text"?"selected":""} aria-pressed={postType==="text"} onClick={()=>setPostType("text")}>Text</button>
          </div>
          <label>Title <span>{title.length}/200</span>
            <input required maxLength={200} autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="Give your post a descriptive title"/>
          </label>
          {postType==="link" ?
            <label>URL<input required type="url" pattern="https://.*" value={link} onChange={e=>setLink(e.target.value)} placeholder="https://example.com/article"/></label> :
            <label>Your post<textarea required maxLength={10000} rows={7} value={body} onChange={e=>setBody(e.target.value)} placeholder="What would you like to share?"/></label>}
          <div className="con-media-group">
            <strong>Image or video <small>(optional)</small></strong>
            <ImageUpload label="Upload an image (up to 2 MB)" onUpload={setImage} onBusyChange={setUploading}/>
            {image && <div className="con-upload-preview"><img alt="Uploaded preview" src={safeUrl(image)}/><button type="button" onClick={()=>setImage("")}>Remove</button></div>}
            <label>Video URL (direct MP4 or WebM)
              <input type="url" pattern="https://.*" value={video} placeholder="https://example.com/video.mp4" onChange={e=>setVideo(e.target.value)}/>
            </label>
          </div>
          <label>Choose where to post
            <select required value={target} onChange={e=>setTarget(e.target.value)}>
              {communities.map(c=><option key={c.slug} value={c.slug}>c/{c.slug} · {c.name}</option>)}
            </select>
          </label>
          <label className="con-reply-optin"><input type="checkbox" checked={notifyReplies} onChange={e=>setNotifyReplies(e.target.checked)}/>
            Notify me in my C0N inbox when someone replies
          </label>
          {notice && <p role="alert" className="social-error">{notice}</p>}
          <div className="con-submit-actions">
            <button type="button" onClick={()=>setShowPost(false)}>Cancel</button>
            <button type="submit" className="social-primary" disabled={saving||uploading||!title.trim()||(postType==="text"?!body.trim():!link.trim())}>
              {saving?"Publishing…":"Submit post"}
            </button>
          </div>
        </form>
      </dialog>
      {notice && !showPost && <p role="alert" className="social-error">{notice}</p>}
      <nav className="con-community-nav" aria-label="Browse subcons">
        <a className={!communitySlug?"selected":""} href="/community">All posts</a>
        {communities.map(c=><a className={communitySlug===c.slug?"selected":""} key={c.slug} href={"/c/"+c.slug}>c/{c.slug}</a>)}
      </nav>
    </>}
    {error && <p role="alert" className="social-error">{error} <button onClick={()=>void load()}>Retry</button></p>}
    <div className="con-feed-list" aria-label="Recent posts">
      {posts.slice(0,compact?4:undefined).map((p,i)=><FeedRow key={p.id} post={p} rank={i+1}/>)}
    </div>
    {loading && <p role="status">Loading posts…</p>}
    {!loading && !posts.length && !error && <p>No posts here yet. Be the first to contribute.</p>}
    {compact ? <a className="social-read" href="/community">All community posts →</a> :
      next && <button disabled={loading} onClick={()=>void load(true)}>Load more</button>}
  </section>;
}
export function InboxPage() {
  const user = useUser();
  type Notice = {id:string;post_id:string;reply_id:string;actor_name:string;created_at:string;read_at:string|null};
  const [items,setItems] = useState<Notice[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  useEffect(() => {
    if (!user) return;
    void socialApi<{notifications:Notice[]}>("inbox")
      .then(d=>{setItems(d.notifications);setError("");})
      .catch(e=>setError(e instanceof Error?e.message:"Could not load inbox."))
      .finally(()=>setLoading(false));
  },[user?.id]);
  async function read(item:Notice) {
    if(!item.read_at) {
      try {
        await socialApi("inbox","PUT",{id:item.id});
        setItems(prev=>prev.map(x=>x.id===item.id?{...x,read_at:new Date().toISOString()}:x));
      } catch(e) { setError(e instanceof Error?e.message:"Couldn't mark as read."); }
    }
    window.location.assign("/posts/"+item.post_id+"#reply-"+item.reply_id);
  }
  return <section className="con-inbox-page">
    <header><span className="con-community-kicker">YOUR ACTIVITY</span><h1>Inbox</h1><p>Replies to posts you've asked to follow.</p></header>
    {!user && <p><a href="/api/auth/discord/login">Sign in with Discord to see your notifications.</a></p>}
    {loading && user && <p>Loading notifications…</p>}
    {error && <p role="alert" className="social-error">{error}</p>}
    {!loading && !items.length && !error && <p>No replies yet. Your inbox is all caught up.</p>}
    <div className="con-inbox-list">{items.map(item=><button key={item.id} className={item.read_at?"":"unread"} onClick={()=>void read(item)}>
      <strong>{item.actor_name} replied to your post</strong>
      <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
      <span>View conversation →</span>
    </button>)}</div>
  </section>;
}
export function OutboundPage({ id }: { id: string }) {
  const [post,setPost] = useState<SocialPost|null>(null);
  const [error,setError] = useState("");
  useEffect(()=>{
    void socialApi<{post:SocialPost}>("post&id="+encodeURIComponent(id))
      .then(d=>{if(!safeUrl(d.post.link_url))throw Error("This post doesn't have an external link.");setPost(d.post);})
      .catch(e=>setError(e instanceof Error?e.message:"Link unavailable."));
  },[id]);
  const url = safeUrl(post?.link_url);
  return <section className="con-outbound">
    <div className="con-outbound-bar">
      <a className="con-outbound-home" href="/"><strong>C0N</strong> · Home</a>
      <a href={post?.community_slug?"/c/"+post.community_slug:"/community"}>Back to c/{post?.community_slug || "community"}</a>
      <a href={"/posts/"+id}>Comments</a>
      {url && <a href={url} target="_blank" rel="noopener noreferrer">Open original ↗</a>}
    </div>
    {error && <p className="social-error" role="alert">{error}</p>}
    {!post && !error && <p>Opening external link…</p>}
    {url && <>
      <div className="con-outbound-fallback">Some websites block embedded viewing. If the page is blank, <a href={url} target="_blank" rel="noopener noreferrer">open the original in a new tab</a>. C0N will remain here.</div>
      <iframe title={"External content: "+post?.title} src={url} referrerPolicy="no-referrer" sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" />
    </>}
  </section>;
}
type ThreadReply = Reply & { children: ThreadReply[] };
function replyTree(replies: Reply[]): ThreadReply[] {
  const nodes = new Map(replies.map(r => [r.id, { ...r, children: [] as ThreadReply[] }]));
  const roots: ThreadReply[] = [];
  for (const reply of replies) {
    const node = nodes.get(reply.id)!;
    const parent = reply.parent_id ? nodes.get(reply.parent_id) : null;
    if (parent && parent.id !== reply.id) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
function ThreadComment({
  comment, depth, userId, canModerate, busy, onReply, onDelete,
}: {
  comment: ThreadReply; depth: number; userId?: string; canModerate: boolean;
  busy: boolean; onReply: (parentId:string, body:string)=>Promise<boolean>;
  onDelete: (id:string)=>void;
}) {
  const [expanded,setExpanded] = useState(false);
  const [draft,setDraft] = useState("");
  const [posting,setPosting] = useState(false);
  const [error,setError] = useState("");
  return <div className={"con-thread-node" + (depth ? " con-thread-child" : "")} id={"reply-"+comment.id}>
    <article className="con-thread-comment">
      <div className="con-thread-meta">
        <Avatar name={comment.author_name} url={comment.avatar_url}/>
        {comment.deleted_at ? <span className="con-thread-deleted">[deleted]</span> :
          <a href={"/members/"+comment.user_id}>{comment.author_name}</a>}
        <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time>
      </div>
      <p className="social-body">{comment.deleted_at ? "[deleted]" : comment.body}</p>
      <div className="con-thread-actions">
        {!comment.deleted_at && (userId ?
          <button type="button" onClick={()=>setExpanded(v=>!v)}>{expanded ? "Cancel reply" : "Reply"}</button> :
          <a href="/api/auth/discord/login">Sign in to reply</a>)}
        {!comment.deleted_at && (comment.user_id===userId || canModerate) &&
          <button type="button" disabled={busy} onClick={()=>onDelete(comment.id)}>Delete</button>}
        <a href={"#reply-"+comment.id}>Permalink</a>
      </div>
      {expanded && userId && <form className="con-thread-reply-form" onSubmit={async e=>{
        e.preventDefault();setPosting(true);setError("");
        const ok=await onReply(comment.id,draft);
        if(ok){setExpanded(false);setDraft("");}
        else setError("Could not post reply. Check the message above or try again.");
        setPosting(false);
      }}>
        <label>Reply to {comment.author_name}
          <textarea required maxLength={2000} rows={3} value={draft} onChange={e=>setDraft(e.target.value)}/>
        </label>
        <button type="submit" className="social-primary" disabled={posting||busy||!draft.trim()}>{posting?"Posting…":"Reply"}</button>
        {error && <small role="alert">{error}</small>}
      </form>}
    </article>
    {comment.children.length>0 && <div className="con-thread-children">
      {comment.children.map(child=><ThreadComment key={child.id} comment={child} depth={depth+1}
        userId={userId} canModerate={canModerate} busy={busy} onReply={onReply} onDelete={onDelete}/>)}
    </div>}
  </div>;
}
export function PostPage({ id }: { id: string }) {
  const user = useUser(),
    [data, setData] = useState<{
      post: SocialPost;
      replies: Reply[];
      can_moderate: boolean;
      can_blog: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [reply, setReply] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  async function load() {
    try {
      setData(await socialApi("post&id=" + encodeURIComponent(id)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Post unavailable.");
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  useEffect(() => {
    const hash = window.location.hash;
    if (data && /^#reply-[0-9a-f-]{36}$/i.test(hash)) {
      requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({block:"center"}));
    }
  }, [data]);
  async function remove(replyId?: string) {
    if (!window.confirm(replyId ? "Delete this reply?" : "Delete this post?"))
      return;
    setBusy(true);
    try {
      await socialApi(replyId ? "reply" : "post", "DELETE", {
        id,
        reply_id: replyId,
      });
      if (replyId) await load();
      else window.location.assign(data?.post.community_slug ? "/c/" + data.post.community_slug : data?.post.kind === "member" ? "/members/" + data.post.author_id : "/community");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="social-stream">
      <a className="social-back" href={data?.post.community_slug && data?.post.title ? "/c/" + data.post.community_slug : data?.post.kind === "member" ? "/members/" + data.post.author_id : "/community"}>
        ← {data?.post.kind === "member" ? "Profile" : "Community"}
      </a>
      {error && (
        <p role="alert" className="social-error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading post…</p>}
      {data && (
        <>
          {editing ? (
            <ComposerOverlay
              blog={data.post.kind === "update" || Boolean(data.post.title)}
              post={data.post}
              onClose={() => setEditing(false)}
              onSave={() => {
                setEditing(false);
                void load();
              }}
            />
          ) : (
            <PostCard post={data.post} full />
          )}
          <div className="social-form-actions">
            {data.post.can_edit && (
              <button onClick={() => setEditing(true)}>Edit post</button>
            )}
            {data.post.kind === "member" &&
              (data.post.can_edit || data.can_moderate) && (
                <button disabled={busy} onClick={() => void remove()}>
                  Delete post
                </button>
              )}
          </div>
          <section className="social-replies" id="replies">
            <h2>Replies · {data.replies.length}</h2>
            {replyTree(data.replies).map((r) => (
              <ThreadComment key={r.id} comment={r} depth={0} userId={user?.id}
                canModerate={data.can_moderate} busy={busy}
                onReply={async (parentId,body) => {
                  setBusy(true);
                  try {
                    await socialApi("reply","POST",{id,body,parent_id:parentId});
                    await load();
                    return true;
                  } catch(e) {
                    setError(e instanceof Error ? e.message : "Reply failed.");
                    return false;
                  } finally {setBusy(false);}
                }}
                onDelete={(replyId)=>void remove(replyId)} />
            ))}
            {user ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await socialApi("reply", "POST", { id, body: reply });
                    setReply("");
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Reply failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Add a reply
                  <textarea
                    required
                    rows={3}
                    maxLength={2000}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                </label>
                <button
                  className="social-primary"
                  disabled={busy || !reply.trim()}
                >
                  Reply
                </button>
              </form>
            ) : (
              <a href="/api/auth/discord/login">Sign in to reply</a>
            )}
          </section>
        </>
      )}
    </section>
  );
}
function ProfileEditor({
  profile,
  onSave,
  onCancel,
}: {
  profile: Profile;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState<Profile>({ ...profile, disciplines: profile.disciplines || [], portfolio: profile.portfolio || [], available_for_work: profile.available_for_work || false }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function change(key: keyof Profile, value: unknown) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  return (
    <form
      className="social-profile-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await socialApi("profile", "PUT", draft);
          onSave();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Profile save failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Edit profile</h2>
      <fieldset disabled={busy || uploading}>
        {(
          [
            ["name", "Display name", 80],
            ["headline", "Headline / what you do", 160],
            ["location", "Location (optional)", 100],
          ] as const
        ).map(([k, label, max]) => (
          <label key={k}>
            {label}
            <input
              required={k === "name"}
              maxLength={max}
              value={draft[k]}
              onChange={(e) => change(k, e.target.value)}
            />
          </label>
        ))}
        <div className="portfolio-editor-section">
          <h3>What do you create?</h3>
          <p>Choose up to six disciplines. These make you discoverable in the member directory, whether you're a coder, a concert photographer, a bladesmith or something else entirely.</p>
          <div className="creative-discipline-grid">
            {creativeDisciplines.map(discipline => (
              <label key={discipline} className="creative-discipline">
                <input type="checkbox" checked={draft.disciplines.includes(discipline)}
                  disabled={!draft.disciplines.includes(discipline) && draft.disciplines.length >= 6}
                  onChange={e => change("disciplines", e.target.checked
                    ? [...draft.disciplines, discipline]
                    : draft.disciplines.filter(x => x !== discipline))}/>
                {discipline}
              </label>
            ))}
          </div>
          <label className="social-check">
            <input type="checkbox" checked={draft.available_for_work}
              onChange={e => change("available_for_work", e.target.checked)}/>
            Available for collaborations, commissions or work
          </label>
        </div>
        <label>
          About you
          <textarea
            rows={5}
            maxLength={3000}
            value={draft.bio}
            onChange={(e) => change("bio", e.target.value)}
          />
        </label>
        <ImageUpload
          label="Upload profile image"
          onBusyChange={setUploading}
          onUpload={(u) => change("avatar_url", u)}
        />
        {draft.avatar_url && (
          <div>
            <Avatar name={draft.name} url={draft.avatar_url} />
            <button type="button" onClick={() => change("avatar_url", "")}>
              Remove profile image
            </button>
          </div>
        )}
        <ImageUpload
          label="Upload cover image"
          onBusyChange={setUploading}
          onUpload={(u) => change("cover_url", u)}
        />
        {draft.cover_url && (
          <>
            <img
              className="social-composer-image"
              src={safeUrl(draft.cover_url)}
              alt="Cover preview"
            />
            <button type="button" onClick={() => change("cover_url", "")}>
              Remove cover
            </button>
          </>
        )}
        <label className="social-check">
          <input
            type="checkbox"
            checked={draft.show_projects}
            onChange={(e) => change("show_projects", e.target.checked)}
          />
          Show my published projects
        </label>
        <div className="portfolio-editor-section">
          <h3>Featured work</h3>
          <p>Build a visual portfolio. Upload photos of your work, add an optional website, video, game or project link, and explain what you created. Up to 24 pieces.</p>
          {draft.portfolio.map((piece, i) => (
            <div className="portfolio-piece-editor" key={i}>
              <div className="portfolio-piece-editor-heading">
                <strong>Piece {i + 1}</strong>
                <button type="button" onClick={() => change("portfolio", draft.portfolio.filter((_, j) => i !== j))}>Remove</button>
              </div>
              <label>Work type
                <select value={piece.kind} onChange={e => change("portfolio", draft.portfolio.map((v,j) =>
                  i === j ? {...v, kind: e.target.value as PortfolioPiece["kind"]} : v))}>
                  {portfolioKinds.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Title
                <input maxLength={120} required value={piece.title} placeholder="Live at the Fillmore, hand-forged chef knife, latest game…"
                  onChange={e => change("portfolio", draft.portfolio.map((v,j) =>
                    i === j ? {...v, title:e.target.value} : v))}/>
              </label>
              <label>Description
                <textarea rows={3} maxLength={600} value={piece.description}
                  onChange={e => change("portfolio", draft.portfolio.map((v,j) =>
                    i === j ? {...v, description:e.target.value} : v))}/>
              </label>
              <ImageUpload label={piece.image_url ? "Replace portfolio image" : "Upload portfolio image"}
                onBusyChange={setUploading}
                onUpload={url => change("portfolio", draft.portfolio.map((v,j) =>
                  i === j ? {...v,image_url:url} : v))}/>
              {safeUrl(piece.image_url) && <div className="portfolio-editor-preview">
                <img src={safeUrl(piece.image_url)} alt="" loading="lazy"/>
                <button type="button" onClick={() => change("portfolio", draft.portfolio.map((v,j) =>
                  i === j ? {...v, image_url:""} : v))}>Remove image</button>
              </div>}
              <label>Link to the work (optional, HTTPS)
                <input type="url" maxLength={2000} value={piece.link_url}
                  placeholder="https://..."
                  onChange={e => change("portfolio", draft.portfolio.map((v,j) =>
                    i === j ? {...v, link_url:e.target.value} : v))}/>
              </label>
            </div>
          ))}
          <button type="button" disabled={draft.portfolio.length >= 24}
            onClick={() => change("portfolio", [...draft.portfolio, {
              kind:"image",title:"",description:"",image_url:"",link_url:"",
            }])}>+ Add portfolio piece</button>
        </div>
        <h3>Social links</h3>
        {draft.links.map((l, i) => (
          <div className="social-link-editor" key={i}>
            <label>
              Label
              <input
                required
                maxLength={40}
                value={l.label}
                placeholder="GitHub, LinkedIn, website…"
                onChange={(e) =>
                  change(
                    "links",
                    draft.links.map((v, j) =>
                      j === i ? { ...v, label: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
            <label>
              HTTPS URL
              <input
                required
                type="url"
                pattern="https://.*"
                maxLength={2000}
                value={l.url}
                onChange={(e) =>
                  change(
                    "links",
                    draft.links.map((v, j) =>
                      j === i ? { ...v, url: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              onClick={() =>
                change(
                  "links",
                  draft.links.filter((_, j) => j !== i),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={draft.links.length >= 8}
          onClick={() =>
            change("links", [...draft.links, { label: "", url: "" }])
          }
        >
          Add social link
        </button>
        <div className="social-form-actions">
          <button className="social-primary">
            {busy ? "Saving…" : "Save profile"}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
export function ProfilePage({ id }: { id: string }) {
  const [data, setData] = useState<{
      profile: Profile;
      posts: SocialPost[];
      projects: {
        id: string;
        published: { title: string; body: string; image_url: string };
      }[];
      own: boolean;
      can_blog: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [composing, setComposing] = useState(false),
    [tab, setTab] = useState("posts");
  async function load() {
    try {
      const result = await socialApi<{profile: Profile; posts: SocialPost[]; projects: {id: string; published: {title:string;body:string;image_url:string}}[]; own:boolean; can_blog:boolean}>("profile&id=" + encodeURIComponent(id));
      setData(result);
      setTab(previous => previous === "posts" && result.profile.portfolio?.length ? "portfolio" : previous);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Profile unavailable.");
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  if (error)
    return (
      <section className="social-stream">
        <p role="alert">{error}</p>
        <a href="/members">Members</a>
      </section>
    );
  if (!data) return <p role="status">Loading profile…</p>;
  const p = data.profile;
  const editRequested = new URLSearchParams(window.location.search).get("edit") === "1";
  return (
    <section className="social-profile">
      <a className="social-back" href="/members">
        ← Members
      </a>
      {(editing || (editRequested && data.own)) ? (
        <ProfileEditor
          profile={p}
          onCancel={() => { setEditing(false); if (editRequested) window.location.assign("/members/" + id); }}
          onSave={() => {
            if (editRequested) window.history.replaceState(null, "", "/members/" + id);
            setEditing(false);
            void load();
          }}
        />
      ) : (
        <>
          <div className="social-profile-cover">
            {safeUrl(p.cover_url) && (
              <img src={safeUrl(p.cover_url)} alt="Profile cover" />
            )}
          </div>
          <div className="social-profile-info">
            <Avatar name={p.name} url={p.avatar_url} />
            <h1>{p.name}</h1>
            {p.username && <p className="social-handle">@{p.username}</p>}
            <h2>{p.headline}</h2>
            <p className="social-body">{p.bio}</p>
            {p.location && <p className="social-handle">{p.location}</p>}
            {!!p.disciplines?.length && <div className="profile-discipline-list">{p.disciplines.map(d => <span key={d}>{d}</span>)}</div>}
            {p.available_for_work && <p className="profile-available">Open to collaborations and commissions</p>}
            <div className="social-profile-links">
              {p.links.map((l, i) => (
                <a
                  key={i}
                  href={safeUrl(l.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {l.label}
                  <ArrowUpRight size={14} />
                </a>
              ))}
            </div>
            <p className="social-handle">
              {data.posts.length}
              {data.posts.length === 100 ? "+" : ""} posts
              {p.show_projects ? ` · ${data.projects.length} projects` : ""}
            </p>
          </div>
        </>
      )}
      <nav className="social-tabs" aria-label="Profile sections">
        {!!p.portfolio?.length && <button aria-pressed={tab === "portfolio"} onClick={() => setTab("portfolio")}>
          Portfolio ({p.portfolio.length})
        </button>}
        <button aria-pressed={tab === "posts"} onClick={() => setTab("posts")}>
          Posts
        </button>
        {p.show_projects && (
          <button
            aria-pressed={tab === "projects"}
            onClick={() => setTab("projects")}
          >
            Projects
          </button>
        )}
        {data.own && <a href="/my-projects">Manage projects →</a>}
      </nav>
      {tab === "portfolio" ? (
        <div className="profile-portfolio-grid">
          {(p.portfolio || []).map((piece, index) => (
            <article className="profile-portfolio-piece" key={index}>
              {safeUrl(piece.image_url) && <img src={safeUrl(piece.image_url)} alt={piece.title} loading="lazy"/>}
              <div className="profile-portfolio-content">
                <span className="profile-portfolio-kind">{portfolioKinds.find(([value]) => value === piece.kind)?.[1] || "Creative work"}</span>
                <h2>{piece.title}</h2>
                {piece.description && <p>{piece.description}</p>}
                {safeUrl(piece.link_url) && <a href={safeUrl(piece.link_url)} target="_blank" rel="noopener noreferrer">
                  View work <ArrowUpRight size={15}/>
                </a>}
              </div>
            </article>
          ))}
        </div>
      ) : tab === "posts" ? (
        <>
          {data.own && (
            <div className="social-profile-post-action">
              <button
                className="social-primary"
                onClick={() => setComposing(true)}
              >
                Write a post
              </button>
            </div>
          )}
          {composing && (
            <ComposerOverlay
              blog={false}
              onClose={() => setComposing(false)}
              onSave={() => {
                setComposing(false);
                void load();
              }}
            />
          )}
          {data.posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {!data.posts.length && <p className="social-empty">No posts yet.</p>}
        </>
      ) : (
        <div className="social-profile-projects">
          {data.projects.map((project) => (
            <a href={"/projects/" + project.id} key={project.id}>
              {safeUrl(project.published.image_url) && (
                <img
                  src={safeUrl(project.published.image_url)}
                  alt=""
                  loading="lazy"
                />
              )}
              <h2>{project.published.title}</h2>
              <p>{project.published.body.slice(0, 180)}</p>
              <span>View project →</span>
            </a>
          ))}
          {!data.projects.length && <p>No published projects yet.</p>}
        </div>
      )}
    </section>
  );
}
export function MemberDirectory() {
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [discipline, setDiscipline] = useState("All disciplines"),
    [availableOnly, setAvailableOnly] = useState(false);
  useEffect(() => {
    void socialApi<{ profiles: Profile[] }>("directory")
      .then((d) => setProfiles(d.profiles))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="social-directory">
      <div className="social-page-heading">
        <span className="eyebrow">DISCOVER THE PEOPLE BEHIND THE WORK</span>
        <h1>Members</h1>
        <p>
          Discover developers, artists, photographers, craftspeople, game creators, and collaborators through their work.
        </p>
      </div>
      <div className="member-discovery-filters">
        <label>Find a creator
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search names, disciplines, skills and portfolio work…"/>
        </label>
        <label>Discipline
          <select value={discipline} onChange={e => setDiscipline(e.target.value)}>
            <option>All disciplines</option>
            {creativeDisciplines.map(d => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="member-availability-filter">
          <input type="checkbox" checked={availableOnly} onChange={e => setAvailableOnly(e.target.checked)}/>
          Available for work
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading members…</p>}
      <div className="social-member-grid">
        {profiles
          .filter(p => (discipline === "All disciplines" || (p.disciplines || []).includes(discipline)) &&
            (!availableOnly || p.available_for_work) &&
            [p.name, p.username, p.headline, p.bio, p.location, ...(p.disciplines || []),
              ...(p.portfolio || []).flatMap(item => [item.title, item.description, item.kind])]
              .join(" ").toLowerCase().includes(query.trim().toLowerCase()))
          .map((p) => (
            <a
              className="social-member"
              href={"/members/" + p.user_id}
              key={p.user_id}
            >
              <Avatar name={p.name} url={p.avatar_url} />
              <h2>{p.name}</h2>
              <small>@{p.username}</small>
              <p>{p.headline}</p>
              {!!p.disciplines?.length && <div className="member-discipline-tags">
                {p.disciplines.slice(0, 3).map(d => <small key={d}>{d}</small>)}
              </div>}
              {p.available_for_work && <small className="member-available">Open to work</small>}
              {!!p.portfolio?.length && <div className="member-portfolio-thumbs">
                {p.portfolio.filter(item => safeUrl(item.image_url)).slice(0,3).map((item,i) =>
                  <img src={safeUrl(item.image_url)} alt="" key={i} loading="lazy"/>)}
              </div>}
              <span>View work →</span>
            </a>
          ))}
      </div>
      {!loading && !profiles.length && !error && (
        <p>No profiles yet. Yours can be the first.</p>
      )}
    </section>
  );
}
