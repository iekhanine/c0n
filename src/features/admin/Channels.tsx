import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import { adminApi as api } from "./adminApi";
import { channelLabel } from "../../../shared/permissions.js";
type Hook = { id: string; name: string; channel_id: string; enabled: boolean };
const empty = { id: "", name: "", url: "", enabled: true };
export default function Channels() {
  const [hooks, setHooks] = useState<Hook[]>([]),
    [form, setForm] = useState({ ...empty }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    api<{ webhooks: Hook[] }>("webhooks")
      .then((d) => {
        if (active) setHooks(d.webhooks);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="con-channel-workspace">
      {error && (
        <div role="alert" className="con-tool-error">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="con-tool-notice">
          {notice}
        </p>
      )}
      <div className="con-channel-list">
        <div className="con-list-heading">
          <span>Discord channels</span>
          <button
            disabled={busy}
            onClick={() => {
              setForm({ ...empty });
              setNotice("");
            }}
          >
            <Plus size={17} />
            Add channel
          </button>
        </div>
        {!hooks.length && (
          <p className="con-tool-empty">
            Paste a webhook URL to add your first channel.
          </p>
        )}
        {hooks.map((h) => (
          <button
            key={h.id}
            className={`con-post-item ${form.id === h.id ? "selected" : ""}`}
            disabled={busy}
            onClick={() =>
              setForm({
                id: h.id,
                name: channelLabel(h.name),
                url: "",
                enabled: h.enabled,
              })
            }
          >
            <strong>{channelLabel(h.name)}</strong>
            <span>
              {h.enabled ? "Enabled" : "Disabled"} · {h.channel_id}
            </span>
          </button>
        ))}
      </div>
      <form
        className="con-channel-form"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await api("webhooks", form.id ? "PATCH" : "POST", form);
              setForm({ ...empty });
              setHooks((await api<{ webhooks: Hook[] }>("webhooks")).webhooks);
              setNotice("Channel saved. No message was posted.");
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Could not save channel.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <span className="con-label">
          {form.id ? "EDIT CHANNEL" : "NEW CHANNEL"}
        </span>
        <h2>
          {form.id
            ? channelLabel(form.name)
            : "Paste the webhook. Pick the channel."}
        </h2>
        <fieldset disabled={busy}>
          <label>
            Webhook URL {form.id && <span>(leave blank to keep it)</span>}
            <input
              type="password"
              autoComplete="new-password"
              required={!form.id}
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://discord.com/api/webhooks/…"
            />
          </label>
          <label>
            Channel name <span>(optional)</span>
            <input
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="#transmissions"
            />
          </label>
          <label className="con-check">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, enabled: e.target.checked }))
              }
            />
            Enable publishing
          </label>
          <p className="con-tool-hint">
            Channel names always start with #. Tokens stay encrypted. Saving
            verifies the connection without posting a message.
          </p>
          <button className="con-primary" type="submit">
            <Save size={17} />
            {busy ? "Verifying…" : "Save channel"}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
