import { useEffect, useState } from "react";
import { Check, LockKeyhole, RefreshCw, Save, Users, X } from "lucide-react";
import { adminApi } from "./adminApi";
import type { Access } from "./adminApi";
import {
  PERMISSION_GROUPS,
  presetPermissions,
  withViewPermissions,
  channelLabel,
} from "../../../shared/permissions.js";
type Member = {
  discord_id: string;
  display_name: string;
  username?: string;
  access: Access;
  enabled: boolean;
  owner: boolean;
  approval_status: "pending" | "approved" | "rejected";
  permissions: string[];
  all_channels: boolean;
  channel_ids: string[];
  requested_at?: string;
  last_seen_at?: string;
  updated_at?: string;
};
const when = (value?: string) =>
  value ? new Date(value).toLocaleString() : "—";
export default function Staff({
  currentId,
  permissions,
  allChannels,
  channelIds,
}: {
  currentId: string;
  permissions: string[];
  allChannels: boolean;
  channelIds: string[];
}) {
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<Member[]>([]),
    [form, setForm] = useState<Member | null>(null),
    [filter, setFilter] = useState<"pending" | "approved" | "other">("pending"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([
      adminApi<{ staff: Member[] }>("staff"),
      adminApi<{ webhooks: { id: string; name: string }[] }>("webhooks"),
    ])
      .then(([d, c]) => {
        if (active) {
          setMembers(d.staff);
          setChannels(c.webhooks);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    setError("");
    try {
      setMembers((await adminApi<{ staff: Member[] }>("staff")).staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requests.");
    }
  }
  function check(key: string, value: boolean) {
    if (!form) return;
    let next = form.permissions.filter((p) => p !== key);
    if (value) next.push(key);
    else if (key.endsWith(".view"))
      next = next.filter((p) => !p.startsWith(key.split(".")[0] + "."));
    setForm({ ...form, permissions: withViewPermissions(next) });
  }
  async function save(reject = false) {
    if (!form) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminApi("staff", "POST", {
        discord_id: form.discord_id,
        display_name: form.display_name,
        access: form.access,
        enabled: reject ? false : form.enabled,
        approval_status: reject ? "rejected" : "approved",
        permissions: reject ? [] : form.permissions,
        all_channels: reject ? false : form.all_channels,
        channel_ids: reject ? [] : form.channel_ids,
        expected_updated_at: form.updated_at,
      });
      setMembers((await adminApi<{ staff: Member[] }>("staff")).staff);
      setNotice(
        reject
          ? "Request rejected. This account has no access."
          : "Access saved. Their next status check will open the approved tools.",
      );
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save access.");
    } finally {
      setBusy(false);
    }
  }
  const pending = members.filter((m) => m.approval_status === "pending");
  const visible = members.filter((m) =>
    filter === "pending"
      ? m.approval_status === "pending"
      : filter === "approved"
        ? m.approval_status === "approved" && m.enabled
        : m.approval_status === "rejected" ||
          (!m.enabled && m.approval_status !== "pending"),
  );
  return (
    <div className="con-staff-view">
      <div className="con-approval-intro">
        <Users size={24} />
        <div>
          <h2>They sign in. You decide.</h2>
          <p>
            Ask them to log in with Discord on this site. Their request appears
            here automatically. No IDs to enter.
          </p>
        </div>
        <button disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {error && (
        <div role="alert" className="con-tool-error">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="con-tool-notice">
          <Check size={16} />
          {notice}
        </p>
      )}
      <div className="con-staff-grid">
        <section className="con-surface con-staff-list">
          <div className="con-request-filters">
            <button
              aria-pressed={filter === "pending"}
              onClick={() => setFilter("pending")}
            >
              Pending <b>{pending.length}</b>
            </button>
            <button
              aria-pressed={filter === "approved"}
              onClick={() => setFilter("approved")}
            >
              Approved
            </button>
            <button
              aria-pressed={filter === "other"}
              onClick={() => setFilter("other")}
            >
              Disabled / rejected
            </button>
          </div>
          {loading ? (
            <p role="status" className="con-tool-empty">
              Loading accounts…
            </p>
          ) : !visible.length ? (
            <p className="con-tool-empty">
              {filter === "pending"
                ? "No pending requests. New Discord sign-ins will appear here."
                : "No accounts in this group."}
            </p>
          ) : (
            visible.map((m) => (
              <article
                className={`con-staff-row ${form?.discord_id === m.discord_id ? "selected" : ""}`}
                key={m.discord_id}
              >
                <div>
                  <strong>
                    {m.display_name || m.username || "Discord member"}
                  </strong>
                  {m.username && (
                    <span className="con-request-username">@{m.username}</span>
                  )}
                  <code>{m.discord_id}</code>
                  <span className={`con-role-badge ${m.access}`}>
                    {m.owner
                      ? "Owner"
                      : m.approval_status === "pending"
                        ? "Pending approval"
                        : m.access}
                  </span>
                  {m.approval_status === "pending" && (
                    <small>Requested {when(m.requested_at)}</small>
                  )}
                </div>
                {m.owner || m.discord_id === currentId ? (
                  <span className="con-protected">
                    <LockKeyhole size={14} />
                    Protected
                  </span>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setForm({
                        ...m,
                        enabled:
                          m.approval_status === "pending" ? true : m.enabled,
                        permissions: [...(m.permissions || [])],
                      });
                      setNotice("");
                    }}
                  >
                    {m.approval_status === "pending"
                      ? "Review request"
                      : "Edit permissions"}
                  </button>
                )}
              </article>
            ))
          )}
        </section>
        <section className="con-surface con-staff-form">
          {!form ? (
            <div className="con-tool-empty">
              <Users size={30} />
              <h2>Select a request or staff member.</h2>
              <p>
                Review their permissions here before approving access. New
                accounts start with nothing enabled.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <span className="con-label">
                {form.approval_status === "pending"
                  ? "REVIEW REQUEST"
                  : "EDIT PERMISSIONS"}
              </span>
              <h2>{form.display_name || form.username || "Discord member"}</h2>
              <p className="con-tool-hint">
                These permissions apply to this website. They do not change
                Discord server roles.
              </p>
              <fieldset disabled={busy}>
                <label>
                  Role label
                  <select
                    value={form.access}
                    onChange={(e) =>
                      setForm({ ...form, access: e.target.value as Access })
                    }
                  >
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderator</option>
                    <option value="report">Report</option>
                  </select>
                </label>
                <div className="con-permission-presets">
                  <span>Start with a preset:</span>
                  {(["admin", "moderator", "report"] as Access[]).map(
                    (role) => (
                      <button
                        type="button"
                        key={role}
                        onClick={() =>
                          setForm({
                            ...form,
                            access: role,
                            permissions: presetPermissions(role).filter((p) =>
                              permissions.includes(p),
                            ),
                          })
                        }
                      >
                        {role === "admin"
                          ? "Admin"
                          : role === "moderator"
                            ? "Moderator"
                            : "Report"}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, permissions: [] })}
                  >
                    Clear all
                  </button>
                </div>
                <div className="con-permission-checklist">
                  {PERMISSION_GROUPS.map((group) => (
                    <fieldset key={group.label}>
                      <legend>{group.label}</legend>
                      {group.items.map(([key, label]) => (
                        <label className="con-check" key={key}>
                          <input
                            type="checkbox"
                            disabled={!permissions.includes(key)}
                            checked={form.permissions.includes(key)}
                            onChange={(e) => check(key, e.target.checked)}
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
                <div className="con-permission-checklist">
                  <fieldset>
                    <legend>Allowed Discord posting channels</legend>
                    <label className="con-check">
                      <input
                        type="checkbox"
                        disabled={!allChannels}
                        checked={form.all_channels}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            all_channels: e.target.checked,
                            channel_ids: [],
                          })
                        }
                      />
                      All current and future channels
                    </label>
                    {!form.all_channels &&
                      channels.map((channel) => (
                        <label className="con-check" key={channel.id}>
                          <input
                            type="checkbox"
                            disabled={
                              !allChannels && !channelIds.includes(channel.id)
                            }
                            checked={form.channel_ids.includes(channel.id)}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                channel_ids: e.target.checked
                                  ? [...form.channel_ids, channel.id]
                                  : form.channel_ids.filter(
                                      (id) => id !== channel.id,
                                    ),
                              })
                            }
                          />
                          {channelLabel(channel.name)}
                        </label>
                      ))}
                    <p className="con-tool-hint">
                      Content publishing permission and an allowed channel are
                      both required. Website publishing is controlled separately
                      above.
                    </p>
                  </fieldset>
                </div>
                <label className="con-check">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) =>
                      setForm({ ...form, enabled: e.target.checked })
                    }
                  />
                  Enable this account’s approved access
                </label>
                <p className="con-tool-hint">
                  {form.permissions.length} permissions selected. The role label
                  does not add permissions; only checked items are granted.
                </p>
                <div className="con-button-row">
                  <button type="submit" className="con-primary">
                    <Save size={17} />
                    {busy
                      ? "Saving…"
                      : form.approval_status === "pending"
                        ? "Approve & save access"
                        : "Save permissions"}
                  </button>
                  {form.approval_status === "pending" && (
                    <button
                      type="button"
                      className="con-danger"
                      onClick={() => void save(true)}
                    >
                      <X size={17} />
                      Reject request
                    </button>
                  )}
                </div>
              </fieldset>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
