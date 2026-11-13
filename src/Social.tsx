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
    <article className="social-post">
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
              {post.kind === "update" ? "Transmission" : "Community post"}
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
      {!full && (
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
export function StreamPage({ compact = false }: { compact?: boolean }) {
  const [posts, setPosts] = useState<SocialPost[]>([]),
    [error, setError] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  async function load(more = false) {
    setLoading(true);
    try {
      const d = await socialApi<{ posts: SocialPost[]; next: string | null }>(
        "feed" + (more && next ? "&before=" + encodeURIComponent(next) : ""),
      );
      setPosts((prev) => (more ? [...prev, ...d.posts] : d.posts));
      setNext(d.next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load posts.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className={"social-stream " + (compact ? "social-compact" : "")}>
      {compact && (
        <div className="social-page-heading">
          <h2>Latest transmissions</h2>
        </div>
      )}
      {error && (
        <p role="alert" className="social-error">
          {error}
          <button onClick={() => void load()}>Retry</button>
        </p>
      )}
      {posts.slice(0, compact ? 4 : undefined).map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      {loading && <p role="status">Loading posts…</p>}
      {!loading && !posts.length && !error && <p>No transmissions yet.</p>}
      {compact ? (
        <a className="social-read" href="/community">
          All transmissions →
        </a>
      ) : (
        next && (
          <button disabled={loading} onClick={() => void load(true)}>
            Load more
          </button>
        )
      )}
    </section>
  );
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
      else window.location.assign("/community");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="social-stream">
      <a className="social-back" href="/community">
        ← Community
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
              blog={data.can_blog}
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
            {data.replies.map((r) => (
              <article key={r.id}>
                <a className="social-author" href={"/members/" + r.user_id}>
                  <Avatar name={r.author_name} url={r.avatar_url} />
                  <strong>{r.author_name}</strong>
                </a>
                <time dateTime={r.created_at}>
                  {new Date(r.created_at).toLocaleString()}
                </time>
                <p className="social-body">{r.body}</p>
                {(r.user_id === user?.id || data.can_moderate) && (
                  <button disabled={busy} onClick={() => void remove(r.id)}>
                    Delete reply
                  </button>
                )}
              </article>
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
                POST
              </button>
            </div>
          )}
          {composing && (
            <ComposerOverlay
              blog={data.can_blog}
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
