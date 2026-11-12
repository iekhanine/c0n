import { useEffect, useState, type FormEvent } from "react";
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
  return safeUrl(url) ? (
    <img className="social-avatar" src={safeUrl(url)} alt="" loading="lazy" />
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
}: {
  onSave: () => void;
  post?: SocialPost;
  onCancel?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState(post?.title || ""),
    [body, setBody] = useState(post?.body || ""),
    [image, setImage] = useState(post?.image_url || ""),
    [pinned, setPinned] = useState(post?.pinned || false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
      <h2>{post ? "Edit your post" : "What are you working on?"}</h2>
      <fieldset disabled={busy || uploading}>
        <label>
          Title (optional)
          <input
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A quick update, a new idea, a longer story…"
          />
        </label>
        <label>
          Your post
          <textarea
            required
            maxLength={10000}
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share something with the community."
          />
        </label>
        <small>{body.length.toLocaleString()} / 10,000</small>
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
          <button className="social-primary" disabled={busy || !body.trim()}>
            {busy ? "Saving…" : post ? "Save changes" : "Publish post"}
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
export function StreamPage({ compact = false }: { compact?: boolean }) {
  const user = useUser(),
    [posts, setPosts] = useState<SocialPost[]>([]),
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
      <div className="social-page-heading">
        <span className="eyebrow">FROM THE COMMUNITY</span>
        <h1>{compact ? "Latest transmissions & posts" : "Community"}</h1>
        <p>Ideas, updates, projects, and whatever else is on your mind.</p>
        {user && <a href={"/members/" + user.id}>My profile →</a>}
      </div>
      {user && !compact ? (
        <Composer onSave={() => void load()} />
      ) : (
        !compact && (
          <p>
            <a href="/api/auth/discord/login">Sign in with Discord</a> to post,
            like, and reply.
          </p>
        )
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
      {!loading && !posts.length && !error && (
        <p>No posts yet. Start the conversation.</p>
      )}
      {compact ? (
        <a className="social-read" href="/community">
          All community posts →
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
            <Composer
              post={data.post}
              onCancel={() => setEditing(false)}
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
  const [draft, setDraft] = useState(profile),
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
    } | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [tab, setTab] = useState("posts");
  async function load() {
    try {
      setData(await socialApi("profile&id=" + encodeURIComponent(id)));
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
  return (
    <section className="social-profile">
      <a className="social-back" href="/members">
        ← Members
      </a>
      {editing ? (
        <ProfileEditor
          profile={p}
          onCancel={() => setEditing(false)}
          onSave={() => {
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
            {data.own && (
              <button
                className="social-edit-profile"
                onClick={() => setEditing(true)}
              >
                Edit profile
              </button>
            )}
            <h1>{p.name}</h1>
            {p.username && <p className="social-handle">@{p.username}</p>}
            <h2>{p.headline}</h2>
            <p className="social-body">{p.bio}</p>
            {p.location && <p className="social-handle">{p.location}</p>}
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
      {tab === "posts" ? (
        <>
          {data.own && <Composer onSave={() => void load()} />}{" "}
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
    [query, setQuery] = useState("");
  const user = useUser();
  useEffect(() => {
    void socialApi<{ profiles: Profile[] }>("directory")
      .then((d) => setProfiles(d.profiles))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="social-directory">
      <div className="social-page-heading">
        <span className="eyebrow">THE PEOPLE BEHIND THE PROJECTS</span>
        <h1>Members</h1>
        <p>
          Builders, designers, marketers, managers, and everyone in between.
        </p>
        {user ? (
          <a href={"/members/" + user.id}>Create or edit my profile →</a>
        ) : (
          <a href="/api/auth/discord/login">Sign in to create your profile →</a>
        )}
      </div>
      <label>
        Find a member
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names and headlines"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading members…</p>}
      <div className="social-member-grid">
        {profiles
          .filter((p) =>
            (p.name + " " + p.username + " " + p.headline)
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
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
              <span>View profile →</span>
            </a>
          ))}
      </div>
      {!loading && !profiles.length && !error && (
        <p>No profiles yet. Yours can be the first.</p>
      )}
    </section>
  );
}
