import { useEffect, useState } from "react";
import { botCommand } from "./botCommand";
import AccessSetup from "./AccessSetup";

type Item = { id: string; name: string; type?: number; permissions?: string; managed?: boolean };
type Mapping = { emoji: string; role_id: string };
type Config = { channel_id: string; message_id: string; mappings: Mapping[] };
type Reaction = { emoji: string; display: string; count: number };
const MESSAGE_ID = "1570527636030103675";
const chars = [..."ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ"];
const ascii = "abcdefghijklmnopqrstuvwxyz";
const normalize = (s: string) => [...s.toLowerCase()]
  .map(ch => chars.includes(ch) ? ascii[chars.indexOf(ch)] : ch)
  .join("").replace(/[^a-z0-9]/g, "");
const allowedAccess = new Set(["workshopaccess","galleryaccess","arcadeaccess","gamesaccess","voiceaccess"]);
async function api(method = "GET", data?: unknown) {
  const response = await fetch("/api/discord-bot?action=reaction_roles", {
    method, cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Could not save reaction roles.");
  return result;
}
export default function ReactionRoles() {
  const [channels, setChannels] = useState<Item[]>([]);
  const [roles, setRoles] = useState<Item[]>([]);
  const [config, setConfig] = useState<Config>({ channel_id: "", message_id: MESSAGE_ID, mappings: [] });
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    Promise.all([
      api() as Promise<Config>,
      botCommand<{ items: Item[] }>("channels.list"),
      botCommand<{ items: Item[] }>("roles.list"),
    ]).then(([saved, channelList, roleList]) => {
      if (!active) return;
      setConfig({ channel_id: saved.channel_id || "", message_id: saved.message_id || MESSAGE_ID, mappings: saved.mappings || [] });
      setChannels(channelList.items.filter(c => c.type === 0 || c.type === 5));
      setRoles(roleList.items.filter(r => !r.managed && r.permissions === "0" && allowedAccess.has(normalize(r.name))));
    }).catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function inspect() {
    if (!config.channel_id || !config.message_id) return setError("Select the roles channel and message.");
    setBusy(true); setError(""); setStatus("");
    try {
      const result = await botCommand<{ items: Reaction[] }>("reaction_roles.inspect", {
        channel_id: config.channel_id, message_id: config.message_id,
      });
      setReactions(result.items);
      setConfig(previous => ({
        ...previous,
        mappings: result.items.map(r => previous.mappings.find(m => m.emoji === r.emoji) || { emoji: r.emoji, role_id: "" }),
      }));
      setStatus("Reactions loaded. Choose the access role for each emoji.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not inspect reactions."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(""); setStatus("");
    try {
      if (!config.channel_id || !/^\d{17,20}$/.test(config.message_id))
        throw Error("Choose the roles channel and enter a valid message ID.");
      const mapped = config.mappings.filter(m => m.role_id);
      if (!mapped.length) throw Error("Choose at least one access role.");
      if (new Set(mapped.map(m => m.role_id)).size !== mapped.length)
        throw Error("Use each role only once.");
      if (!window.confirm("Enable these reaction-to-role mappings? This will assign mapped roles to members who already reacted. No category permissions will be changed."))
        return;
      await api("PUT", { ...config, mappings: mapped });
      setConfig(current => ({ ...current, mappings: mapped }));
      setStatus("Saved. The Discord worker will fetch the configuration and reconcile existing reactions.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save mappings."); }
    finally { setBusy(false); }
  }
  return <div className="dx-panel dx-form" aria-busy={busy}>
    <AccessSetup />
    <h3>Reaction roles</h3>
    <p>Map the reactions already on the published roles message to dedicated access roles. The bot assigns a role when a member reacts and removes it when they remove their reaction.</p>
    <p>Only the six dedicated category access roles can be self-assigned. Staff, VIP, onboarding, managed and privileged roles are excluded by the worker. After running guided setup, refresh this page to load the new mappings.</p>
    <label>Roles channel
      <select value={config.channel_id} onChange={e => setConfig(v => ({ ...v, channel_id: e.target.value }))}>
        <option value="">Choose a channel</option>
        {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
    <label>Published message ID
      <input value={config.message_id} onChange={e => setConfig(v => ({ ...v, message_id: e.target.value }))} />
    </label>
    <button type="button" disabled={busy} onClick={() => void inspect()}>Load reactions from Discord</button>
    {config.mappings.map((m, i) => <label key={m.emoji}>
      {reactions.find(r => r.emoji === m.emoji)?.display || m.emoji} → Access role
      <select value={m.role_id} onChange={e => setConfig(v => ({
        ...v, mappings: v.mappings.map((entry, index) => index === i ? { ...entry, role_id: e.target.value } : entry),
      }))}>
        <option value="">Do not assign a role</option>
        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>)}
    {error && <p role="alert" className="dx-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    <button type="button" className="dx-primary" disabled={busy} onClick={() => void save()}>Save reaction-role mappings</button>
    <p>Category permissions remain unchanged. Grant View Channel to each mapped access role on its category, deny View Channel to @everyone, and sync any child channels that should inherit those rules. Keep onboarding and administration permissions separate.</p>
  </div>;
}
