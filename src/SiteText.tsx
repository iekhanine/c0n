import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { SITE_COPY } from "../shared/site-copy.js";
import "./SiteText.css";
export type CopyEntry = {
  key?: string;
  value: string;
  version: number;
  removed?: boolean;
  event_id?: string;
};
type Change = {
  key: string;
  value: string;
  version: number;
  event_id: string;
  removed?: boolean;
};
type TextState = {
  owner: boolean;
  editing: boolean;
  toggleEditing: () => void;
  entries: Record<string, CopyEntry>;
  edit: (key: string) => void;
  remove: (key: string) => void;
  change: (
    key: string,
    value: string,
    version: number,
    removed?: boolean,
  ) => Promise<Change>;
  restore: (
    eventId: string,
    version: number,
    side?: "before" | "after",
  ) => Promise<Change>;
  refresh: () => Promise<void>;
  revision: number;
};
const TextContext = createContext<TextState>({
  owner: false,
  editing: false,
  toggleEditing: () => {},
  entries: {},
  edit: () => {},
  remove: () => {},
  change: async () => {
    throw Error("Content editor unavailable.");
  },
  restore: async () => {
    throw Error("Content editor unavailable.");
  },
  refresh: async () => {},
  revision: 0,
});
async function contentRequest(method: string, body?: unknown, action = "") {
  const r = await fetch(
    "/api/site-content" + (action ? "?action=" + action : ""),
    {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Could not update content.");
  return d;
}
export function SiteTextProvider({
  children,
  owner,
}: {
  children: ReactNode;
  owner: boolean;
}) {
  const [entries, setEntries] = useState<Record<string, CopyEntry>>({}),
    [selected, setSelected] = useState<string | null>(null),
    [value, setValue] = useState(""),
    [version, setVersion] = useState(0),
    [removed, setRemoved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [last, setLast] = useState<Change | null>(null),
    [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(() => {
    try {
      return sessionStorage.getItem("con.websiteEditing") === "true";
    } catch {
      return false;
    }
  });
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null),
    inFlight = useRef(false);
  function toggleEditing() {
    setEditing((e) => {
      try {
        sessionStorage.setItem("con.websiteEditing", String(!e));
      } catch {}
      return !e;
    });
  }
  async function refresh() {
    const d = await contentRequest("GET", undefined, owner ? "history" : "");
    setEntries(
      Object.fromEntries(
        d.entries.map((e: CopyEntry & { key: string }) => [e.key, e]),
      ),
    );
  }
  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/site-content" + (owner ? "?action=history" : ""), {
      signal: c.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!c.signal.aborted)
          setEntries(
            Object.fromEntries(
              d.entries.map((e: CopyEntry & { key: string }) => [e.key, e]),
            ),
          );
      })
      .catch(() => {});
    return () => c.abort();
  }, [owner]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else {
      dialog.current?.close();
      trigger.current?.focus();
    }
  }, [selected]);
  function accept(row: Change) {
    setEntries((e) => ({ ...e, [row.key]: row }));
    setRevision((n) => n + 1);
    return row;
  }
  async function change(
    key: string,
    text: string,
    currentVersion: number,
    hide = false,
  ): Promise<Change> {
    return accept(
      await contentRequest("PUT", {
        key,
        value: text,
        version: currentVersion,
        removed: hide,
      }),
    );
  }
  async function restore(
    eventId: string,
    currentVersion: number,
    side: "before" | "after" = "before",
  ): Promise<Change> {
    return accept(
      await contentRequest(
        "POST",
        { event_id: eventId, version: currentVersion, side },
        "restore",
      ),
    );
  }
  function edit(key: string) {
    if (!owner || !editing) return;
    trigger.current = document.activeElement as HTMLElement;
    setValue(entries[key]?.value ?? SITE_COPY[key]);
    setVersion(entries[key]?.version ?? 0);
    setRemoved(entries[key]?.removed === true);
    setError("");
    setNotice("");
    setSelected(key);
  }
  async function mutate(key: string, hide: boolean, keepOpen: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const row = await change(
        key,
        keepOpen ? value : (entries[key]?.value ?? SITE_COPY[key]),
        keepOpen ? version : (entries[key]?.version ?? 0),
        hide,
      );
      setLast(row);
      setNotice(
        hide
          ? "Removed. You can undo here or restore it later from Content audit & restore."
          : "Changes saved.",
      );
      if (keepOpen) {
        setVersion(row.version);
        setValue(row.value);
        setRemoved(!!row.removed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update content.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  function remove(key: string) {
    if (!owner || !editing) return;
    void mutate(key, true, false);
  }
  async function undo() {
    if (!last || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const row = await restore(
        last.event_id,
        entries[last.key]?.version ?? last.version,
      );
      if (selected === row.key) {
        setVersion(row.version);
        setValue(row.value);
        setRemoved(!!row.removed);
      }
      setLast(null);
      setNotice("Change undone.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <TextContext.Provider
      value={{
        owner,
        editing,
        toggleEditing,
        entries,
        edit,
        remove,
        change,
        restore,
        refresh,
        revision,
      }}
    >
      {children}
      {owner &&
        createPortal(
          <>
            {!selected && (last || error) && (
              <aside
                className="site-content-toast"
                role={error ? "alert" : "status"}
              >
                <span>{error || notice}</span>
                {last && (
                  <button disabled={busy} onClick={() => void undo()}>
                    Undo
                  </button>
                )}
                <button
                  onClick={() => {
                    setLast(null);
                    setError("");
                  }}
                >
                  Dismiss
                </button>
              </aside>
            )}
            <dialog
              ref={dialog}
              className="site-text-dialog"
              onCancel={(e) => {
                e.preventDefault();
                if (!busy) setSelected(null);
              }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (selected) void mutate(selected, false, true);
                }}
              >
                <h2>{removed ? "Removed content" : "Edit website text"}</h2>
                <p className="site-copy-location">{selected}</p>
                <label htmlFor="site-text-value">Text</label>
                <textarea
                  id="site-text-value"
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={4000}
                  rows={6}
                  disabled={removed}
                />
                <p>
                  {removed
                    ? "Hidden from the site. Restore its saved text here or through the content audit."
                    : "Changes are visible after saving. Remove hides this item without losing its text."}
                </p>
                {notice && <p role="status">{notice}</p>}
                {error && <p role="alert">{error}</p>}
                <div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                  {last?.key === selected && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void undo()}
                    >
                      Undo last change
                    </button>
                  )}
                  {!removed && (
                    <button
                      type="button"
                      className="site-remove-action"
                      disabled={busy}
                      onClick={() =>
                        selected && void mutate(selected, true, true)
                      }
                    >
                      Remove
                    </button>
                  )}
                  <button disabled={busy || !value.trim()}>
                    {busy
                      ? "Saving…"
                      : removed
                        ? "Restore content"
                        : "Save changes"}
                  </button>
                </div>
                {error && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void refresh()
                        .then(() => setSelected(null))
                        .catch(() => setError("Could not refresh. Try again."))
                    }
                  >
                    Refresh latest content
                  </button>
                )}
              </form>
            </dialog>
          </>,
          document.body,
        )}
    </TextContext.Provider>
  );
}
export const useSiteContent = () => useContext(TextContext);
export function Editable({ id }: { id: string }) {
  const { owner, editing, entries } = useSiteContent();
  const hidden = entries[id]?.removed;
  if (hidden && !(owner && editing))
    return <span className="site-copy-hidden" hidden />;
  return (
    <span className={`editable-copy ${hidden ? "site-copy-removed" : ""}`}>
      {hidden ? (
        <span>Removed content</span>
      ) : (
        (entries[id]?.value ?? SITE_COPY[id])
      )}
      <EditButton id={id} />
    </span>
  );
}
export function useSiteCopy() {
  const { entries } = useSiteContent();
  return (id: string) =>
    entries[id]?.removed ? "" : (entries[id]?.value ?? SITE_COPY[id]);
}
export function Copy({ id }: { id: string }) {
  const { entries, owner, editing } = useSiteContent();
  const text = useSiteCopy();
  return entries[id]?.removed ? (
    owner && editing ? (
      <span className="site-copy-removed">Removed content</span>
    ) : (
      <span className="site-copy-hidden" hidden />
    )
  ) : (
    <>{text(id)}</>
  );
}
export function CopyRegion({
  ids,
  children,
}: {
  ids: string[];
  children: ReactNode;
}) {
  const { entries, owner, editing } = useSiteContent();
  return ids.every((id) => entries[id]?.removed) &&
    !(owner && editing) ? null : (
    <>{children}</>
  );
}
export function EditButton({ id }: { id: string }) {
  const { owner, editing, entries, edit, remove } = useSiteContent();
  return owner && editing ? (
    <span className="site-copy-controls">
      <button
        type="button"
        className="site-edit-button"
        aria-label={`${entries[id]?.removed ? "Restore or edit" : "Edit"} ${SITE_COPY[id]}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          edit(id);
        }}
      >
        {entries[id]?.removed ? "restore / edit" : "edit"}
      </button>
      {!entries[id]?.removed && (
        <button
          type="button"
          className="site-edit-button site-remove-button"
          aria-label={`Remove ${SITE_COPY[id]}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            remove(id);
          }}
        >
          remove
        </button>
      )}
    </span>
  ) : null;
}
export function WebsiteEditToggle() {
  const { owner, editing, toggleEditing } = useSiteContent();
  return owner ? (
    <button
      type="button"
      className="website-edit-toggle"
      aria-pressed={editing}
      onClick={toggleEditing}
    >
      {editing ? "Done editing" : "Edit website"}
    </button>
  ) : null;
}
