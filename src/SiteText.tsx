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
type Entry = { value: string; version: number };
const TextContext = createContext<{
  owner: boolean;
  entries: Record<string, Entry>;
  edit: (key: string) => void;
}>({ owner: false, entries: {}, edit: () => {} });
export function SiteTextProvider({
  children,
  owner,
}: {
  children: ReactNode;
  owner: boolean;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({}),
    [selected, setSelected] = useState<string | null>(null),
    [value, setValue] = useState(""),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/site-content", { signal: c.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) =>
        setEntries(
          Object.fromEntries(
            d.entries.map((e: Entry & { key: string }) => [e.key, e]),
          ),
        ),
      )
      .catch(() => {});
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (selected) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      trigger.current?.focus();
    }
  }, [selected]);
  function edit(key: string) {
    if (!owner) return;
    trigger.current = document.activeElement as HTMLElement;
    setValue(entries[key]?.value ?? SITE_COPY[key]);
    setVersion(entries[key]?.version ?? 0);
    setError("");
    setSelected(key);
  }
  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: selected, value, version }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Could not save text.");
      setEntries((prev) => ({
        ...prev,
        [selected]: { value: data.value, version: data.version },
      }));
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <TextContext.Provider value={{ owner, entries, edit }}>
      {children}
      {owner &&
        createPortal(
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
                void save();
              }}
            >
              <h2>Edit website text</h2>
              <label htmlFor="site-text-value">Text</label>
              <textarea
                id="site-text-value"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={4000}
                rows={6}
              />
              <p>Changes are visible to everyone after saving.</p>
              {error && <p role="alert">{error}</p>}
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>
                <button disabled={busy || !value.trim()}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </TextContext.Provider>
  );
}
export function Editable({ id }: { id: string }) {
  const { owner, entries, edit } = useContext(TextContext);
  return (
    <span className="editable-copy">
      {entries[id]?.value ?? SITE_COPY[id]}
      {owner && (
        <button
          type="button"
          className="site-edit-button"
          aria-label={`Edit ${SITE_COPY[id]}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            edit(id);
          }}
        >
          edit
        </button>
      )}
    </span>
  );
}
export function useSiteCopy() {
  const { entries } = useContext(TextContext);
  return (id: string) => entries[id]?.value ?? SITE_COPY[id];
}
export function Copy({ id }: { id: string }) {
  const text = useSiteCopy();
  return <>{text(id)}</>;
}
export function EditButton({ id }: { id: string }) {
  const { owner, edit } = useContext(TextContext);
  return owner ? (
    <button
      type="button"
      className="site-edit-button"
      aria-label={`Edit ${SITE_COPY[id]}`}
      onClick={() => edit(id)}
    >
      edit
    </button>
  ) : null;
}
