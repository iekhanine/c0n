import { useEffect, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Globe,
  Hash,
  Plus,
  Save,
  Send,
} from "lucide-react";
import { adminApi as api } from "./adminApi";
import {
  channelLabel,
  contentPrefix,
  discordMessageTime,
} from "../../../shared/permissions.js";

type Delivery = {
  id: string;
  webhook_id: string;
  name: string;
  message_id: string | null;
  channel_id: string;
  guild_id: string | null;
  state: string;
  post_version: number;
  updated_at: string;
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
  published_version: number | null;
  published_updated_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  author_name: string;
  deliveries: Delivery[];
};
type Draft = Pick<
  Post,
  "kind" | "title" | "body" | "link_url" | "image_url" | "featured"
>;
type Hook = { id: string; name: string; enabled: boolean };
const blank = (kind: Post["kind"]): Draft => ({
  kind,
  title: "",
  body: "",
  link_url: "",
  image_url: "",
  featured: false,
});
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// HEADER 001: List entries show each destination and its latest confirmed sync.
export default function Posts({
  kind,
  permissions,
  authorName,
  onDirty,
}: {
  kind: Post["kind"];
  permissions: string[];
  authorName: string;
  onDirty: (dirty: boolean) => void;
}) {
  const prefix = contentPrefix(kind),
    can = (operation: string) => permissions.includes(`${prefix}.${operation}`);
  const canWebsite = permissions.includes("website.publish");
  const [posts, setPosts] = useState<Post[]>([]),
    [hooks, setHooks] = useState<Hook[]>([]),
    [selected, setSelected] = useState<Post | null>(null),
    [draft, setDraft] = useState<Draft>(blank(kind));
  const [destination, setDestination] = useState(""),
    [website, setWebsite] = useState(canWebsite),
    [messageId, setMessageId] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const editable = selected ? can("edit") : can("create");
  const active = selected?.deliveries.find((d) => d.webhook_id === destination);
  const uncertain =
    !!active &&
    ["sending", "uncertain"].includes(active.state) &&
    !active.message_id;
  const disabledPublish =
    busy || !draft.body.trim() || (!website && !destination) || uncertain;
  async function load() {
    const [p, h] = await Promise.all([
      api<{ posts: Post[] }>("posts"),
      can("publish")
        ? api<{ webhooks: Hook[] }>("webhooks")
        : Promise.resolve({ webhooks: [] }),
    ]);
    setPosts(p.posts.filter((p) => p.kind === kind));
    setHooks(h.webhooks);
    return p.posts;
  }
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const [p, h] = await Promise.all([
          api<{ posts: Post[] }>("posts"),
          can("publish")
            ? api<{ webhooks: Hook[] }>("webhooks")
            : Promise.resolve({ webhooks: [] }),
        ]);
        if (!current) return;
        const records = p.posts.filter((p) => p.kind === kind);
        setPosts(records);
        setHooks(h.webhooks);
        if (!can("create") && records[0]) choose(records[0], h.webhooks);
        else if (h.webhooks.filter((h) => h.enabled).length === 1)
          setDestination(h.webhooks.find((h) => h.enabled)!.id);
      } catch (err) {
        if (current)
          setError(
            err instanceof Error ? err.message : "Could not load posts.",
          );
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [kind, permissions.join(",")]);
  useEffect(() => {
    onDirty(dirty);
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      onDirty(false);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty, onDirty]);
  function choose(post: Post | null, available = hooks) {
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
        : blank(kind),
    );
    setWebsite(canWebsite && (post ? !!post.published_at : true));
    const previous =
      post?.deliveries.filter((d) =>
        available.some((h) => h.id === d.webhook_id && h.enabled),
      ) || [];
    setDestination(
      previous.length === 1
        ? previous[0].webhook_id
        : !previous.length && available.filter((h) => h.enabled).length === 1
          ? available.find((h) => h.enabled)!.id
          : "",
    );
    setDirty(false);
    setMessageId("");
    setNotice("");
  }
  function select(post: Post | null) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    choose(post);
    setError("");
  }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  }
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
  async function save() {
    const result = await api<{ post: Post }>(
      "posts",
      selected ? "PATCH" : "POST",
      {
        ...draft,
        ...(selected ? { id: selected.id, version: selected.version } : {}),
      },
    );
    const all = await load();
    const current = all.find((p) => p.id === result.post.id) || {
      ...result.post,
      deliveries: [],
    };
    setSelected(current);
    setDirty(false);
    return current;
  }
  async function publish() {
    if (editable && formRef.current && !formRef.current.reportValidity())
      return;
    await run(async () => {
      const p = !selected || dirty ? await save() : selected;
      try {
        const result = await api<{ notice: string }>("publish", "POST", {
          post_id: p.id,
          version: p.version,
          website,
          webhook_id: destination || undefined,
        });
        setNotice(result.notice);
      } finally {
        const all = await load();
        setSelected(all.find((row) => row.id === p.id) || p);
      }
    });
  }
  return (
    <div className="con-posts-view">
      {error && (
        <div role="alert" className="con-tool-error">
          {error} <a href="/admin">Reload / sign in again</a>
        </div>
      )}
      {notice && (
        <p role="status" className="con-tool-notice">
          <Check size={17} />
          {notice}
        </p>
      )}
      <div className="con-posts-grid">
        <aside className="con-post-directory">
          <div className="con-list-heading">
            <h2>{kind === "update" ? "Transmissions" : "Projects"}</h2>
            {can("create") && (
              <button disabled={busy} onClick={() => select(null)}>
                <Plus size={17} />
                New
              </button>
            )}
          </div>
          {loading ? (
            <p className="con-tool-empty" role="status">
              Loading posts…
            </p>
          ) : !posts.length ? (
            <p className="con-tool-empty">
              No {kind === "update" ? "updates" : "projects"} yet.
            </p>
          ) : (
            posts.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                className={`con-post-record ${selected?.id === p.id ? "selected" : ""}`}
                onClick={() => select(p)}
              >
                <strong>{p.title || p.body.slice(0, 64)}</strong>
                <div className="con-post-destinations">
                  {p.published_at && (
                    <span>
                      <Globe size={13} />
                      <b>Website</b>
                      <time dateTime={p.published_at}>
                        Posted {date(p.published_at)}
                      </time>
                      <time dateTime={p.published_updated_at || p.published_at}>
                        Last published{" "}
                        {date(p.published_updated_at || p.published_at)}
                      </time>
                    </span>
                  )}
                  {p.deliveries.map((d) => (
                    <span
                      key={d.id}
                      className={d.state === "sent" ? "" : "needs-attention"}
                    >
                      <Hash size={13} />
                      <b>{channelLabel(d.name)}</b>
                      {discordMessageTime(d.message_id) && (
                        <time dateTime={discordMessageTime(d.message_id)!}>
                          Posted {date(discordMessageTime(d.message_id)!)}
                        </time>
                      )}
                      <time dateTime={d.updated_at}>
                        {d.state === "sent"
                          ? d.post_version === 0
                            ? "Linked"
                            : "Last synced"
                          : "Last attempted"}{" "}
                        {date(d.updated_at)}
                      </time>
                      {d.state !== "sent" && <em>{d.state}</em>}
                    </span>
                  ))}
                  {!p.published_at && !p.deliveries.length && (
                    <span>
                      <b>Draft only</b>
                      <time dateTime={p.updated_at}>
                        Saved {date(p.updated_at)}
                      </time>
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </aside>
        <div className="con-post-compose">
          <div className="con-compose-toolbar">
            <div>
              <span className="con-label">
                {selected ? "EDIT POST" : "NEW POST"}
              </span>
              <strong>
                {selected?.title ||
                  (selected
                    ? "Untitled update"
                    : kind === "update"
                      ? "New transmission"
                      : "New featured project")}
              </strong>
              <span className="con-toolbar-target">
                {[
                  website ? "Website" : "",
                  destination
                    ? channelLabel(
                        hooks.find((h) => h.id === destination)?.name ||
                          "channel",
                      )
                    : "",
                ]
                  .filter(Boolean)
                  .join(" + ") || "No destination selected"}
              </span>
              {dirty && <small>Unsaved changes</small>}
            </div>
            <div className="con-button-row">
              {editable && (
                <button
                  disabled={busy || !draft.body.trim()}
                  onClick={() => {
                    if (formRef.current?.reportValidity())
                      void run(async () => {
                        await save();
                        setNotice(
                          "Draft saved. Live website and Discord copies are unchanged until you choose Save & Update.",
                        );
                      });
                  }}
                >
                  <Save size={17} />
                  Save {selected ? "changes" : "draft"}
                </button>
              )}
              {can("publish") && (
                <button
                  className="con-primary"
                  disabled={disabledPublish}
                  onClick={() => void publish()}
                >
                  <Send size={17} />
                  {busy
                    ? "Working…"
                    : selected && (selected.published_at || active?.message_id)
                      ? "Save & Update"
                      : "Save & Publish"}
                </button>
              )}
            </div>
          </div>
          {!selected && !can("create") ? (
            <div className="con-surface con-tool-empty">
              Select a post to view it.
            </div>
          ) : (
            <>
              <section className="con-destination-panel">
                <div>
                  <span className="con-label">POSTING DESTINATIONS</span>
                  <p>
                    {selected
                      ? "Choose which posted copy to update."
                      : "Choose where this post will appear."}
                  </p>
                </div>
                {can("publish") ? (
                  <div className="con-destination-controls">
                    <label className="con-check">
                      <input
                        type="checkbox"
                        checked={website}
                        disabled={busy || !canWebsite}
                        onChange={(e) => setWebsite(e.target.checked)}
                      />
                      Website
                    </label>
                    <label>
                      Discord channel
                      <select
                        disabled={busy}
                        value={destination}
                        onChange={(e) => {
                          setDestination(e.target.value);
                          setMessageId("");
                        }}
                      >
                        <option value="">
                          {selected && selected.deliveries.length > 1
                            ? "Choose a channel to update"
                            : "No Discord delivery"}
                        </option>
                        {hooks
                          .filter((h) => h.enabled)
                          .map((h) => (
                            <option key={h.id} value={h.id}>
                              {channelLabel(h.name)}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <p className="con-tool-hint">
                    Your access allows viewing or editing this content, but not
                    publishing it.
                  </p>
                )}
                {active && (
                  <p className="con-current-target">
                    {active.message_id
                      ? `Updates ${channelLabel(active.name)} in place. Last synced ${date(active.updated_at)}.`
                      : active.last_error ||
                        "Delivery in progress. Check the channel before retrying."}
                  </p>
                )}
                {!hooks.length && can("publish") && (
                  <p className="con-tool-hint">
                    Ask an administrator to connect a Discord channel, or choose
                    Website only.
                  </p>
                )}
              </section>
              <form
                ref={formRef}
                className="con-post-fields"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editable)
                    void run(async () => {
                      await save();
                      setNotice("Draft saved.");
                    });
                }}
              >
                <h2>
                  {kind === "project"
                    ? "Tell us what THEY built…"
                    : selected
                      ? "Edit the transmission"
                      : "What’s worth sharing?"}
                </h2>
                <fieldset disabled={busy || !editable}>
                  <label>
                    {kind === "project" ? "Project name" : "Title"}{" "}
                    {kind === "update" && <span>(optional)</span>}
                    <input
                      required={kind === "project"}
                      maxLength={200}
                      value={draft.title}
                      onChange={(e) => change("title", e.target.value)}
                      placeholder={
                        kind === "project"
                          ? "Their project name"
                          : "A short headline"
                      }
                    />
                  </label>
                  <label>
                    {kind === "project" ? "About their project" : "Post"}
                    <textarea
                      required
                      maxLength={1800}
                      rows={8}
                      value={draft.body}
                      onChange={(e) => change("body", e.target.value)}
                      placeholder={
                        kind === "project"
                          ? "What did they build? Who is it for?"
                          : "Write your update…"
                      }
                    />
                  </label>
                  <div className="con-character-count">
                    {draft.body.length} / 1800
                  </div>
                  <details
                    className="con-post-extras"
                    open={
                      !!draft.link_url ||
                      !!draft.image_url ||
                      kind === "project"
                    }
                  >
                    <summary>Links, image, and display options</summary>
                    <div className="con-input-pair">
                      <label>
                        {kind === "project" ? "Project link" : "Link"}
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
                        Image URL
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
                    {kind === "project" && (
                      <label className="con-check">
                        <input
                          type="checkbox"
                          checked={draft.featured}
                          onChange={(e) => change("featured", e.target.checked)}
                        />
                        Feature this project on the website
                      </label>
                    )}
                  </details>
                </fieldset>
                {selected?.published_at && (
                  <p className="con-tool-hint">
                    Saving edits keeps them as a draft. Save & Update publishes
                    to the selected destinations.
                  </p>
                )}
              </form>
              <details className="con-preview">
                <summary>Preview Discord card</summary>
                <article>
                  <img
                    className="con-preview-logo"
                    src="/con-logo.png"
                    alt=""
                  />
                  {draft.title && <h3>{draft.title}</h3>}
                  <p>{draft.body || "Your post will appear here."}</p>
                  {draft.link_url && (
                    <span className="con-preview-link">{draft.link_url}</span>
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
                    {kind === "project" ? "FEATURED PROJECT" : "TRANSMISSION"} ·{" "}
                    {selected?.author_name || authorName}
                  </small>
                </article>
              </details>
              {selected && (
                <section className="con-post-history">
                  <div className="con-list-heading">
                    <h2>Where this post lives</h2>
                  </div>
                  {selected.published_at && (
                    <article>
                      <Globe size={19} />
                      <div>
                        <strong>Website</strong>
                        <p>
                          Published {date(selected.published_at)} · Last
                          published{" "}
                          {date(
                            selected.published_updated_at ||
                              selected.published_at,
                          )}
                          {selected.published_version !== selected.version
                            ? " · Edits not published yet"
                            : ""}
                        </p>
                      </div>
                      {can("publish") && canWebsite && (
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Remove this post from the website? Discord copies will stay.",
                              )
                            )
                              void run(async () => {
                                const result = await api<{ notice: string }>(
                                  "publish",
                                  "POST",
                                  { post_id: selected.id, unpublish: true },
                                );
                                const all = await load();
                                setSelected(
                                  all.find((p) => p.id === selected.id) || null,
                                );
                                setNotice(result.notice);
                              });
                          }}
                        >
                          Unpublish
                        </button>
                      )}
                    </article>
                  )}
                  {selected.deliveries.map((d) => (
                    <article key={d.id}>
                      <Hash size={19} />
                      <div>
                        <strong>{channelLabel(d.name)}</strong>
                        {discordMessageTime(d.message_id) && (
                          <p>
                            Originally posted{" "}
                            {date(discordMessageTime(d.message_id)!)}
                          </p>
                        )}
                        <p>
                          {d.state === "sent"
                            ? "Last synced"
                            : "Last attempted"}{" "}
                          {date(d.updated_at)}
                          {d.post_version !== selected.version &&
                          d.state === "sent"
                            ? " · Edits not synced yet"
                            : ""}
                        </p>
                        {d.last_error && <p>{d.last_error}</p>}
                      </div>
                      {d.message_id && (
                        <a
                          href={`https://discord.com/channels/${d.guild_id || "@me"}/${d.channel_id}/${d.message_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open <ExternalLink size={14} />
                        </a>
                      )}
                    </article>
                  ))}
                  {!selected.published_at && !selected.deliveries.length && (
                    <p className="con-tool-empty">
                      Draft only. This post hasn’t been published.
                    </p>
                  )}
                  {can("delete") &&
                    !selected.published_at &&
                    !selected.deliveries.length && (
                      <button
                        className="con-danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Delete this unpublished draft?"))
                            void run(async () => {
                              await api("posts", "DELETE", { id: selected.id });
                              await load();
                              choose(null);
                              setNotice("Draft deleted.");
                            });
                        }}
                      >
                        Delete draft
                      </button>
                    )}
                </section>
              )}
              {can("publish") && selected && destination && (
                <details className="con-recovery con-surface">
                  <summary>Link or recover an existing Discord message</summary>
                  <p>
                    Link a message sent by this webhook. It will only change
                    when you choose Save & Update.
                  </p>
                  <label>
                    Message ID
                    <input
                      value={messageId}
                      inputMode="numeric"
                      onChange={(e) => setMessageId(e.target.value)}
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
                        const all = await load();
                        setSelected(
                          all.find((p) => p.id === selected.id) || null,
                        );
                        setNotice(result.notice);
                      })
                    }
                  >
                    Link message
                  </button>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
