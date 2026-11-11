import { useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Plus,
  Radio,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import "./Publishing.css";

type Delivery = {
  id: string;
  webhook_id: string;
  name: string;
  state: string;
  message_id: string | null;
  channel_id: string;
  guild_id: string | null;
  post_version: number;
  last_error: string | null;
};
type Post = {
  id: string;
  kind: "update" | "project";
  title: string;
  body: string;
  link_url: string;
  image_url: string;
  featured: boolean;
  published_at: string | null;
  version: number;
  author_name: string;
  created_at: string;
  deliveries: Delivery[];
};
type Hook = { id: string; name: string; channel_id: string; enabled: boolean };
type Draft = Pick<
  Post,
  "kind" | "title" | "body" | "link_url" | "image_url" | "featured"
>;
type Tab = "update" | "project" | "webhooks" | "database";
const blank = (kind: "update" | "project"): Draft => ({
  kind,
  title: "",
  body: "",
  link_url: "",
  image_url: "",
  featured: false,
});

// HEADER 001: Typed requests. URLs and tokens are never returned by this API.
async function api<T>(
  action: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/admin?action=${action}`, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The server returned an unreadable response. Try again shortly.",
    );
  }
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result as T;
}

export default function Publishing({
  isAdmin,
  authorName,
}: {
  isAdmin: boolean;
  authorName: string;
}) {
  const [tab, setTab] = useState<Tab>("update");
  const [status, setStatus] = useState<{
    connected: boolean;
    initialized: boolean;
  } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [selected, setSelected] = useState<Post | null>(null);
  const [draft, setDraft] = useState<Draft>(blank("update"));
  const [hookDraft, setHookDraft] = useState({
    id: "",
    name: "",
    url: "",
    enabled: true,
  });
  const [destination, setDestination] = useState("");
  const [website, setWebsite] = useState(true);
  const [messageId, setMessageId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);

  async function refresh() {
    const s = await api<{ connected: boolean; initialized: boolean }>("status");
    setStatus(s);
    if (s.initialized) {
      const [p, h] = await Promise.all([
        api<{ posts: Post[] }>("posts"),
        api<{ webhooks: Hook[] }>("webhooks"),
      ]);
      setPosts(p.posts);
      setHooks(h.webhooks);
      return p.posts;
    }
    return [];
  }
  useEffect(() => {
    let active = true;
    async function start() {
      try {
        const s = await api<{ connected: boolean; initialized: boolean }>(
          "status",
        );
        if (!active) return;
        setStatus(s);
        if (s.initialized) {
          const [p, h] = await Promise.all([
            api<{ posts: Post[] }>("posts"),
            api<{ webhooks: Hook[] }>("webhooks"),
          ]);
          if (active) {
            setPosts(p.posts);
            setHooks(h.webhooks);
          }
        }
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Connection failed.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void start();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  function mayLeave() {
    return !dirty || window.confirm("Discard your unsaved changes?");
  }
  function switchTab(next: Tab) {
    if (!mayLeave()) return;
    setTab(next);
    setSelected(null);
    setDraft(blank(next === "project" ? "project" : "update"));
    setDirty(false);
    setError("");
    setNotice("");
    setMessageId("");
  }
  function selectPost(post: Post | null) {
    if (!mayLeave()) return;
    setSelected(post);
    setDraft(
      post
        ? {
            kind: post.kind,
            title: post.title,
            body: post.body,
            link_url: post.link_url,
            image_url: post.image_url,
            featured: post.featured,
          }
        : blank(tab === "project" ? "project" : "update"),
    );
    setDirty(false);
    setNotice("");
    setMessageId("");
  }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  }
  async function save(): Promise<Post> {
    const { post } = await api<{ post: Post }>(
      "posts",
      selected ? "PATCH" : "POST",
      {
        ...draft,
        ...(selected ? { id: selected.id, version: selected.version } : {}),
      },
    );
    const all = await refresh();
    const current = all.find((p) => p.id === post.id) || {
      ...post,
      deliveries: [],
    };
    setSelected(current);
    setDirty(false);
    return current;
  }
  const isContent = tab === "update" || tab === "project";
  const activeDelivery = selected?.deliveries.find(
    (d) => d.webhook_id === destination,
  );

  return (
    <section className="con-publishing" aria-label="Community publishing">
      <nav className="con-tool-tabs" aria-label="Admin tools">
        <button
          disabled={busy}
          aria-current={tab === "update" ? "page" : undefined}
          onClick={() => switchTab("update")}
        >
          <Radio size={15} /> UPDATES
        </button>
        <button
          disabled={busy}
          aria-current={tab === "project" ? "page" : undefined}
          onClick={() => switchTab("project")}
        >
          <Terminal size={15} /> PROJECTS
        </button>
        {isAdmin && (
          <button
            disabled={busy}
            aria-current={tab === "webhooks" ? "page" : undefined}
            onClick={() => switchTab("webhooks")}
          >
            <Settings2 size={15} /> CHANNELS
          </button>
        )}
        <button
          disabled={busy}
          aria-current={tab === "database" ? "page" : undefined}
          onClick={() => switchTab("database")}
        >
          <ShieldCheck size={15} /> DATABASE
        </button>
      </nav>
      {error && (
        <div role="alert" className="con-tool-error">
          {error} <a href="/admin">Reload / sign in again</a>
        </div>
      )}
      {notice && (
        <p role="status" className="con-tool-notice">
          <Check size={15} />
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status" className="con-tool-empty">
          Checking the database…
        </p>
      ) : tab === "database" || !status?.initialized ? (
        <div className="con-database-panel">
          <span className="con-label">STORAGE // SETUP</span>
          <h2>
            {status?.initialized
              ? "DATABASE CONNECTED."
              : "GIVE YOUR POSTS A HOME."}
          </h2>
          <p>
            {status?.initialized
              ? "CoN storage is ready. Open Updates, Projects, or Channels to start publishing."
              : "Check the connection, then initialize the private con schema. This creates storage for posts, channel connections, and Discord message history."}
          </p>
          <dl>
            <div>
              <dt>Connection</dt>
              <dd>{status?.connected ? "CONNECTED" : "NOT VERIFIED"}</dd>
            </div>
            <div>
              <dt>CoN tables</dt>
              <dd>{status?.initialized ? "READY" : "NOT INITIALIZED"}</dd>
            </div>
          </dl>
          <div className="con-button-row">
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await refresh();
                  setNotice("Database connection checked.");
                })
              }
            >
              CHECK CONNECTION
            </button>
            {!status?.initialized && isAdmin && (
              <button
                className="con-primary"
                disabled={busy || !status?.connected}
                onClick={() =>
                  void run(async () => {
                    setStatus(await api("setup", "POST", {}));
                    await refresh();
                    setNotice(
                      "CoN storage initialized. Your other application tables were not modified.",
                    );
                  })
                }
              >
                {busy ? "WORKING…" : "INITIALIZE CoN STORAGE"}
              </button>
            )}
          </div>
          {!isAdmin && !status?.initialized && (
            <p>Ask an administrator to initialize storage.</p>
          )}
          <small>
            Setup refuses an existing con schema containing unrelated tables.
            Webhook tokens stay encrypted on the server.
          </small>
        </div>
      ) : isContent ? (
        <div className="con-workspace">
          <aside className="con-post-list">
            <div className="con-list-heading">
              <span>{tab === "project" ? "PROJECTS" : "TRANSMISSIONS"}</span>
              <button
                title="New draft"
                aria-label="New draft"
                disabled={busy}
                onClick={() => selectPost(null)}
              >
                <Plus size={16} />
              </button>
            </div>
            {posts.filter((p) => p.kind === tab).length === 0 && (
              <p className="con-tool-empty">
                No posts yet.
                <br />
                Start with a draft.
              </p>
            )}
            {posts
              .filter((p) => p.kind === tab)
              .map((p) => (
                <button
                  className={`con-post-item ${selected?.id === p.id ? "selected" : ""}`}
                  disabled={busy}
                  key={p.id}
                  onClick={() => selectPost(p)}
                >
                  <strong>{p.title || p.body.slice(0, 60)}</strong>
                  <span>
                    {p.published_at
                      ? "WEBSITE LIVE"
                      : p.deliveries.some((d) => d.state === "sent")
                        ? "DISCORD"
                        : "DRAFT"}{" "}
                    · {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
          </aside>
          <div className="con-editor-area">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await save();
                  setNotice(
                    "Draft saved. Discord messages are updated only when you publish.",
                  );
                });
              }}
            >
              <div className="con-editor-heading">
                <div>
                  <span className="con-label">
                    {selected ? "EDIT POST" : "NEW DRAFT"}
                  </span>
                  <h2>
                    {tab === "project"
                      ? "Show us what you built."
                      : "What’s the latest?"}
                  </h2>
                </div>
                {dirty && <span className="con-unsaved">UNSAVED</span>}
              </div>
              <fieldset disabled={busy}>
                <label>
                  Title {tab === "update" && <span>(optional)</span>}
                  <input
                    maxLength={200}
                    required={tab === "project"}
                    value={draft.title}
                    onChange={(e) => change("title", e.target.value)}
                    placeholder={
                      tab === "project"
                        ? "Project name"
                        : "Give this transmission a headline"
                    }
                  />
                </label>
                <label>
                  {tab === "project" ? "Project description" : "Update"}
                  <textarea
                    required
                    maxLength={1800}
                    rows={7}
                    value={draft.body}
                    onChange={(e) => change("body", e.target.value)}
                    placeholder={
                      tab === "project"
                        ? "What does it do? Who is it for?"
                        : "A small win, a strange discovery, or something worth sharing…"
                    }
                  />
                </label>
                <div className="con-character-count">
                  {draft.body.length} / 1800
                </div>
                <div className="con-input-pair">
                  <label>
                    {tab === "project" ? "Project link" : "Link"}{" "}
                    <span>(optional)</span>
                    <input
                      type="url"
                      pattern="https://.*"
                      maxLength={2000}
                      value={draft.link_url}
                      onChange={(e) => change("link_url", e.target.value)}
                      placeholder="https://"
                    />
                  </label>
                  <label>
                    Image URL <span>(optional)</span>
                    <input
                      type="url"
                      pattern="https://.*"
                      maxLength={2000}
                      value={draft.image_url}
                      onChange={(e) => change("image_url", e.target.value)}
                      placeholder="https://…/image.png"
                    />
                  </label>
                </div>
                {tab === "project" && (
                  <label className="con-check">
                    <input
                      type="checkbox"
                      checked={draft.featured}
                      onChange={(e) => change("featured", e.target.checked)}
                    />{" "}
                    Feature this project on the homepage
                  </label>
                )}
                {selected?.published_at && (
                  <p className="con-tool-hint">
                    This post is live on the website. Saving changes updates it
                    there immediately. Publish again to update Discord.
                  </p>
                )}
                <div className="con-button-row">
                  <button type="submit">
                    <Save size={15} /> SAVE {selected ? "CHANGES" : "DRAFT"}
                  </button>
                  {selected &&
                    !selected.published_at &&
                    !selected.deliveries.length && (
                      <button
                        type="button"
                        className="con-danger"
                        onClick={() => {
                          if (window.confirm("Delete this draft?"))
                            void run(async () => {
                              await api("posts", "DELETE", { id: selected.id });
                              setSelected(null);
                              setDraft(
                                blank(tab === "project" ? "project" : "update"),
                              );
                              setDirty(false);
                              await refresh();
                              setNotice("Draft deleted.");
                            });
                        }}
                      >
                        DELETE DRAFT
                      </button>
                    )}
                </div>
              </fieldset>
            </form>
            <section className="con-preview" aria-label="Discord embed preview">
              <span className="con-label">DISCORD PREVIEW · APPROXIMATE</span>
              <article>
                <img className="con-preview-logo" src="/con-logo.png" alt="" />
                {draft.title && <h3>{draft.title}</h3>}
                <p>{draft.body || "Your transmission will appear here."}</p>
                {draft.link_url && (
                  <a
                    href={
                      draft.link_url.startsWith("https://")
                        ? draft.link_url
                        : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tab === "project" ? "EXPLORE THE PROJECT" : "READ MORE"}{" "}
                    <ExternalLink size={12} />
                  </a>
                )}
                {draft.image_url.startsWith("https://") && (
                  <img
                    className="con-preview-image"
                    src={draft.image_url}
                    alt="Post preview"
                    referrerPolicy="no-referrer"
                  />
                )}
                <small>
                  CoN //{" "}
                  {tab === "project" ? "FEATURED PROJECT" : "TRANSMISSION"} ·{" "}
                  {selected?.author_name || authorName}
                </small>
              </article>
            </section>
            <section className="con-publish-panel">
              <span className="con-label">DESTINATION // PUBLISH</span>
              <fieldset disabled={busy}>
                <label className="con-check">
                  <input
                    type="checkbox"
                    checked={website}
                    onChange={(e) => setWebsite(e.target.checked)}
                  />{" "}
                  Publish to the website
                </label>
                <label>
                  Discord channel
                  <select
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      setMessageId("");
                    }}
                  >
                    <option value="">Website only / no Discord delivery</option>
                    {hooks
                      .filter((h) => h.enabled)
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                  </select>
                </label>
                {!hooks.some((h) => h.enabled) && (
                  <p className="con-tool-hint">
                    {isAdmin
                      ? "Add a webhook under Channels to publish to Discord."
                      : "Ask an administrator to connect a Discord channel."}
                  </p>
                )}
                {activeDelivery && (
                  <p className="con-tool-hint">
                    {activeDelivery.message_id
                      ? "This channel already has this post. Publishing updates the same message."
                      : activeDelivery.last_error ||
                        "Delivery in progress or unconfirmed. Check Discord before retrying."}
                  </p>
                )}
                <button
                  className="con-primary"
                  disabled={
                    busy ||
                    !draft.body.trim() ||
                    (!website && !destination) ||
                    (!!activeDelivery &&
                      ["sending", "uncertain"].includes(activeDelivery.state) &&
                      !activeDelivery.message_id)
                  }
                  onClick={() =>
                    void run(async () => {
                      const p = !selected || dirty ? await save() : selected;
                      try {
                        const result = await api<{ notice: string }>(
                          "publish",
                          "POST",
                          {
                            post_id: p.id,
                            version: p.version,
                            website,
                            webhook_id: destination || undefined,
                          },
                        );
                        setNotice(result.notice);
                      } finally {
                        const all = await refresh();
                        setSelected(all.find((post) => post.id === p.id) || p);
                      }
                    })
                  }
                >
                  <Send size={15} />{" "}
                  {busy
                    ? "WORKING…"
                    : activeDelivery?.message_id
                      ? "SAVE & UPDATE MESSAGE"
                      : "SAVE & PUBLISH"}
                </button>
                {selected?.published_at && (
                  <button
                    className="con-text-button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove this post from the website? Its Discord messages will stay.",
                        )
                      )
                        void run(async () => {
                          const result = await api<{ notice: string }>(
                            "publish",
                            "POST",
                            { post_id: selected.id, unpublish: true },
                          );
                          const all = await refresh();
                          setSelected(
                            all.find((p) => p.id === selected.id) || null,
                          );
                          setNotice(result.notice);
                        });
                    }}
                  >
                    REMOVE FROM WEBSITE
                  </button>
                )}
              </fieldset>
              {selected && destination && (
                <details className="con-recovery">
                  <summary>Link an existing Discord message</summary>
                  <p>
                    Use this for a post already sent by this webhook, or to
                    recover an unconfirmed send. Linking does not change the
                    message until you publish again.
                  </p>
                  <label>
                    Discord message ID
                    <input
                      inputMode="numeric"
                      value={messageId}
                      onChange={(e) => setMessageId(e.target.value)}
                      placeholder="Right-click message → Copy Message ID"
                    />
                  </label>
                  <button
                    disabled={busy || !/^\d{17,20}$/.test(messageId)}
                    onClick={() =>
                      void run(async () => {
                        const result = await api<{ notice: string }>(
                          "reconcile",
                          "POST",
                          {
                            post_id: selected.id,
                            webhook_id: destination,
                            message_id: messageId,
                          },
                        );
                        const all = await refresh();
                        setSelected(
                          all.find((p) => p.id === selected.id) || null,
                        );
                        setNotice(result.notice);
                      })
                    }
                  >
                    LINK MESSAGE
                  </button>
                </details>
              )}
              {selected && selected.deliveries.length > 0 && (
                <div className="con-delivery-history">
                  <h3>DISCORD HISTORY</h3>
                  {selected.deliveries.map((d) => (
                    <div key={d.id}>
                      <span>
                        {d.name} · {d.state.toUpperCase()}{" "}
                        {d.post_version !== selected.version &&
                        d.state === "sent"
                          ? "· UPDATE AVAILABLE"
                          : ""}
                      </span>
                      {d.message_id && (
                        <a
                          href={`https://discord.com/channels/${d.guild_id || "@me"}/${d.channel_id}/${d.message_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          OPEN <ExternalLink size={12} />
                        </a>
                      )}
                      {d.last_error && <p>{d.last_error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="con-channel-workspace">
          <div className="con-channel-list">
            <div className="con-list-heading">
              <span>CHANNEL CONNECTIONS</span>
              <button
                aria-label="New channel connection"
                disabled={busy}
                onClick={() =>
                  setHookDraft({ id: "", name: "", url: "", enabled: true })
                }
              >
                <Plus size={16} />
              </button>
            </div>
            {!hooks.length && (
              <p className="con-tool-empty">No channels connected yet.</p>
            )}
            {hooks.map((h) => (
              <button
                disabled={busy}
                className={`con-post-item ${hookDraft.id === h.id ? "selected" : ""}`}
                key={h.id}
                onClick={() =>
                  setHookDraft({
                    id: h.id,
                    name: h.name,
                    enabled: h.enabled,
                    url: "",
                  })
                }
              >
                <strong>{h.name}</strong>
                <span>
                  {h.enabled ? "ENABLED" : "DISABLED"} · {h.channel_id}
                </span>
              </button>
            ))}
          </div>
          <form
            className="con-channel-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  "webhooks",
                  hookDraft.id ? "PATCH" : "POST",
                  hookDraft,
                );
                setHookDraft({ id: "", name: "", url: "", enabled: true });
                await refresh();
                setNotice(
                  "Channel connection saved and verified with Discord.",
                );
              });
            }}
          >
            <span className="con-label">
              {hookDraft.id ? "EDIT CONNECTION" : "CONNECT A CHANNEL"}
            </span>
            <h2>Give it a destination.</h2>
            <fieldset disabled={busy}>
              <label>
                Channel label
                <input
                  required
                  maxLength={80}
                  value={hookDraft.name}
                  placeholder="#transmissions"
                  onChange={(e) =>
                    setHookDraft((h) => ({ ...h, name: e.target.value }))
                  }
                />
              </label>
              <label>
                Discord webhook URL{" "}
                {hookDraft.id && (
                  <span>(leave blank to keep the current URL)</span>
                )}
                <input
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  required={!hookDraft.id}
                  value={hookDraft.url}
                  onChange={(e) =>
                    setHookDraft((h) => ({ ...h, url: e.target.value }))
                  }
                  placeholder={
                    hookDraft.id
                      ? "Stored securely; enter a replacement if needed"
                      : "https://discord.com/api/webhooks/…"
                  }
                />
              </label>
              <label className="con-check">
                <input
                  type="checkbox"
                  checked={hookDraft.enabled}
                  onChange={(e) =>
                    setHookDraft((h) => ({ ...h, enabled: e.target.checked }))
                  }
                />{" "}
                Enable publishing to this channel
              </label>
              <p className="con-tool-hint">
                Saving verifies the webhook without posting a message. Tokens
                are encrypted in the database and are never shown again. Create
                a separate connection for each channel.
              </p>
              <button type="submit" className="con-primary">
                <Save size={15} /> {busy ? "VERIFYING…" : "SAVE CONNECTION"}
              </button>
            </fieldset>
          </form>
        </div>
      )}
    </section>
  );
}
