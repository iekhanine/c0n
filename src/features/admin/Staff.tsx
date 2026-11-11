import { useEffect, useState } from "react";
import { LockKeyhole, Plus, Save, Users } from "lucide-react";
import { adminApi } from "./adminApi";
import type { Access } from "./adminApi";

type Member = {
  discord_id: string;
  display_name: string;
  access: Access;
  enabled: boolean;
  owner: boolean;
};
const empty = {
  discord_id: "",
  display_name: "",
  access: "moderator" as Access,
  enabled: true,
};
const labels = { admin: "Admin", moderator: "Moderator", report: "Report" };

// HEADER 001: Staff grants are explicit Discord IDs and checked server-side.
export default function Staff({ currentId }: { currentId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    adminApi<{ staff: Member[] }>("staff")
      .then((data) => {
        if (active) setMembers(data.staff);
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
  return (
    <div className="con-staff-view">
      <div className="con-permission-guide">
        <article>
          <span className="con-role-badge admin">Admin</span>
          <p>Manage staff and channels. Create, edit, and publish content.</p>
        </article>
        <article>
          <span className="con-role-badge moderator">Moderator</span>
          <p>Create, edit, and publish content using existing channels.</p>
        </article>
        <article>
          <span className="con-role-badge report">Report</span>
          <p>
            Read publishing totals and delivery history. No editing or
            publishing.
          </p>
        </article>
      </div>
      {error && (
        <div className="con-tool-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="con-tool-notice" role="status">
          {notice}
        </p>
      )}
      <div className="con-staff-grid">
        <section className="con-surface con-staff-list">
          <div className="con-list-heading">
            <h2>
              <Users size={20} /> Staff members
            </h2>
            <button
              disabled={busy}
              onClick={() => {
                setForm({ ...empty });
                setEditing(false);
                setNotice("");
              }}
            >
              <Plus size={17} /> Add staff
            </button>
          </div>
          {loading ? (
            <p role="status" className="con-tool-empty">
              Loading staff…
            </p>
          ) : (
            members.map((member) => (
              <article className="con-staff-row" key={member.discord_id}>
                <div>
                  <strong>{member.display_name || "Discord member"}</strong>
                  <code>{member.discord_id}</code>
                  <span className={`con-role-badge ${member.access}`}>
                    {member.owner ? "Owner" : labels[member.access]}
                  </span>
                  {!member.enabled && (
                    <span className="con-disabled-badge">Disabled</span>
                  )}
                </div>
                {member.owner || member.discord_id === currentId ? (
                  <span className="con-protected">
                    <LockKeyhole size={14} />{" "}
                    {member.owner ? "Protected" : "Your account"}
                  </span>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setForm({
                        discord_id: member.discord_id,
                        display_name: member.display_name,
                        access: member.access,
                        enabled: member.enabled,
                      });
                      setEditing(true);
                      setNotice("");
                    }}
                  >
                    Edit access
                  </button>
                )}
              </article>
            ))
          )}
        </section>
        <form
          className="con-surface con-staff-form"
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              setBusy(true);
              setError("");
              setNotice("");
              try {
                await adminApi("staff", "POST", form);
                const result = await adminApi<{ staff: Member[] }>("staff");
                setMembers(result.staff);
                setForm({ ...empty });
                setEditing(false);
                setNotice(
                  "Staff access saved. It takes effect on their next request.",
                );
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not save access.",
                );
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <span className="con-label">
            {editing ? "EDIT ACCESS" : "NEW STAFF MEMBER"}
          </span>
          <h2>
            {editing
              ? "Update their permissions."
              : "Invite someone to the controls."}
          </h2>
          <fieldset disabled={busy}>
            <label>
              Discord user ID
              <input
                required
                inputMode="numeric"
                pattern="[0-9]{17,20}"
                disabled={editing}
                value={form.discord_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discord_id: e.target.value.trim() }))
                }
                placeholder="Paste their Discord user ID"
              />
            </label>
            <label>
              Display name <span>(optional)</span>
              <input
                maxLength={80}
                value={form.display_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, display_name: e.target.value }))
                }
                placeholder="A name you recognize"
              />
            </label>
            <label>
              Access level
              <select
                value={form.access}
                onChange={(e) =>
                  setForm((f) => ({ ...f, access: e.target.value as Access }))
                }
              >
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
                <option value="report">Report · read only</option>
              </select>
            </label>
            <label className="con-check">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, enabled: e.target.checked }))
                }
              />{" "}
              Allow this account to sign in as staff
            </label>
            <p className="con-tool-hint">
              They sign in with their own Discord account. Disabling access
              overrides server-role access too. Owner accounts cannot be changed
              here.
            </p>
            <button className="con-primary" type="submit">
              <Save size={17} />{" "}
              {busy ? "Saving…" : editing ? "Save access" : "Add staff member"}
            </button>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
