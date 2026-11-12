import { useEffect, useState } from "react";
import { useSiteContent, type CopyEntry } from "../../SiteText";
import "./ContentAudit.css";
type Event = {
  id: string;
  key: string;
  action: string;
  actor_id: string;
  actor_name?: string;
  before_value: string;
  before_removed: boolean;
  after_value: string;
  after_removed: boolean;
  after_version: number;
  created_at: string;
};
type Data = {
  history: Event[];
  entries: (CopyEntry & { key: string })[];
  defaults: Record<string, string>;
  next: string | null;
};
export default function ContentAudit() {
  const { change, restore, revision, refresh } = useSiteContent();
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState<"content" | "history">("content"),
    [query, setQuery] = useState(""),
    [removedOnly, setRemovedOnly] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [value, setValue] = useState(""),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [undo, setUndo] = useState<{
      id: string;
      key: string;
      version: number;
    } | null>(null);
  async function load(before?: string) {
    const r = await fetch(
      "/api/site-content?action=history" +
        (before ? "&before=" + encodeURIComponent(before) : ""),
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Could not load history.");
    setData((old) =>
      before && old ? { ...d, history: [...old.history, ...d.history] } : d,
    );
  }
  useEffect(() => {
    let active = true;
    void fetch("/api/site-content?action=history", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Could not load content audit.");
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const current = (key: string) =>
    data?.entries.find((e) => e.key === key) || {
      value: data?.defaults[key] || "",
      version: 0,
      removed: false,
    };
  async function act(
    work: () => Promise<CopyEntry & { key: string; event_id: string }>,
    label: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const row = await work();
      setUndo({ id: row.event_id, key: row.key, version: row.version });
      setNotice(label);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  async function restoreEvent(event: Event, side: "before" | "after") {
    if (
      !window.confirm(
        `Restore the ${side === "before" ? "previous" : "saved"} version of this content? A newer edit, if any, will be replaced and kept in history.`,
      )
    )
      return;
    await act(
      () => restore(event.id, current(event.key).version, side),
      "Version restored. This restoration is also recorded in history.",
    );
  }
  const keys = Object.keys(data?.defaults || {}).filter(
    (key) =>
      (!removedOnly || current(key).removed) &&
      `${key} ${current(key).value}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="content-audit" aria-busy={busy}>
      <header>
        <div>
          <h2>Content audit & restore</h2>
          <p>
            Edits, removals and restorations are saved here. Removing content
            hides it without erasing it.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() =>
            void load()
              .then(refresh)
              .catch((e) => setError(e.message))
          }
        >
          Refresh
        </button>
      </header>
      <nav aria-label="Content audit views">
        <button
          aria-pressed={tab === "content"}
          onClick={() => setTab("content")}
        >
          Editable content
        </button>
        <button
          aria-pressed={tab === "history"}
          onClick={() => setTab("history")}
        >
          Action history
        </button>
      </nav>
      {error && (
        <p role="alert" className="audit-error">
          {error}
        </p>
      )}
      {notice && (
        <div role="status" className="audit-notice">
          {notice}
          {undo && (
            <button
              disabled={busy}
              onClick={() =>
                void act(
                  () => restore(undo.id, current(undo.key).version),
                  "Change undone.",
                )
              }
            >
              Undo
            </button>
          )}
        </div>
      )}
      <label className="audit-search">
        Find content
        <input
          placeholder="Search text or location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {tab === "content" ? (
        <>
          <label className="audit-check">
            <input
              type="checkbox"
              checked={removedOnly}
              onChange={(e) => setRemovedOnly(e.target.checked)}
            />
            Show removed content only
          </label>
          <div className="audit-table">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Saved text</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const row = current(key);
                  return (
                    <tr key={key}>
                      <td>
                        <code>{key}</code>
                      </td>
                      <td className="audit-copy">{row.value}</td>
                      <td>{row.removed ? "Removed" : "Visible"}</td>
                      <td>
                        <div className="audit-actions">
                          <button
                            disabled={busy}
                            onClick={() => {
                              setSelected(key);
                              setValue(row.value);
                              setVersion(row.version);
                              setError("");
                            }}
                          >
                            Edit
                          </button>
                          {row.removed ? (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void act(
                                  () =>
                                    change(key, row.value, row.version, false),
                                  "Content restored.",
                                )
                              }
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void act(
                                  () =>
                                    change(key, row.value, row.version, true),
                                  "Content removed. Restore it here any time.",
                                )
                              }
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!keys.length && <p>No matching content.</p>}
          </div>
        </>
      ) : (
        <div className="audit-history">
          {data?.history
            .filter((e) =>
              `${e.key} ${e.before_value} ${e.after_value}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((event) => (
              <article key={event.id}>
                <header>
                  <strong>
                    {event.action} · {event.key}
                  </strong>
                  <time>{new Date(event.created_at).toLocaleString()}</time>
                </header>
                <p>Changed by {event.actor_name || event.actor_id}</p>
                <div className="audit-compare">
                  <section>
                    <small>
                      BEFORE · {event.before_removed ? "Removed" : "Visible"}
                    </small>
                    <p>{event.before_value}</p>
                  </section>
                  <section>
                    <small>
                      AFTER · {event.after_removed ? "Removed" : "Visible"}
                    </small>
                    <p>{event.after_value}</p>
                  </section>
                </div>
                <div className="audit-actions">
                  <button
                    disabled={busy}
                    onClick={() => void restoreEvent(event, "before")}
                  >
                    Undo this change
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void restoreEvent(event, "after")}
                  >
                    Restore this version
                  </button>
                </div>
              </article>
            ))}
          {data && !data.history.length && (
            <p>
              No changes recorded yet. Existing saved text is preserved; new
              changes appear here.
            </p>
          )}
          {data?.next && (
            <button
              disabled={busy}
              onClick={() =>
                void load(data.next!).catch((e) => setError(e.message))
              }
            >
              Load older actions
            </button>
          )}
        </div>
      )}
      {selected && (
        <section className="audit-editor" aria-label="Edit selected content">
          <h3>Edit {selected}</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                () => change(selected, value, version, false),
                "Text saved.",
              );
            }}
          >
            <label>
              Text
              <textarea
                rows={5}
                maxLength={4000}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <div className="audit-actions">
              <button disabled={busy || !value.trim()}>Save and show</button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(
                    () => change(selected, value, version, true),
                    "Content removed.",
                  )
                }
              >
                Remove
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
          </form>
        </section>
      )}
    </section>
  );
}
