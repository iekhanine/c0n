import { useEffect, useState } from "react";
import { botCommand } from "./botCommand";

type Channel = { id: string; name: string; type: number; overwrites?: { id: string; allow: string; deny: string }[] };
type Role = { id: string; name: string; permissions: string; managed: boolean; position: number };
type RoleResult = { id: string; name: string; permissions: string };
type Config = { channel_id: string; message_id: string; mappings: { emoji: string; role_id: string }[] };
type Info = { id: string; bot_role_id: string };

const alphabet = "abcdefghijklmnopqrstuvwxyz";
const letters = [..."ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ"];
const special = new Map(letters.map((letter, i) => [letter, alphabet[i]]));
function normalized(s: string) {
  return [...s.toLowerCase()].map(char => special.get(char) || char).join("").replace(/[^a-z0-9]/g, "");
}
const categories = [
  { key: "thecompound", role: "compoundaccess", name: "Compound Access", emoji: "💬" },
  { key: "theworkshop", role: "workshopaccess", name: "Workshop Access", emoji: "💻" },
  { key: "thegallery", role: "galleryaccess", name: "Gallery Access", emoji: "🎨" },
  { key: "thearcade", role: "arcadeaccess", name: "Arcade Access", emoji: "🎮" },
  { key: "thegames", role: "gamesaccess", name: "Games Access", emoji: "🎲" },
  { key: "thevoice", role: "voiceaccess", name: "Voice Access", emoji: "🎙️" },
];
const VIEW = 1024n;
function permissionsFor(channel: Channel, roleId: string, allowView: boolean) {
  const current = channel.overwrites?.find(x => x.id === roleId);
  let allow = BigInt(current?.allow || "0");
  let deny = BigInt(current?.deny || "0");
  if (allowView) { allow |= VIEW; deny &= ~VIEW; }
  else { deny |= VIEW; allow &= ~VIEW; }
  return { allow: allow.toString(), deny: deny.toString() };
}
async function saveMappings(config: Config) {
  const response = await fetch("/api/discord-bot?action=reaction_roles", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Could not save reaction-role mappings.");
}
export default function AccessSetup() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [info, setInfo] = useState<Info | null>(null);
  const [channelId, setChannelId] = useState("");
  const [messageId, setMessageId] = useState("1570527636030103675");
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState(false);

  async function refresh() {
    setProblem("");
    try {
      const [chs, rls, overview] = await Promise.all([
        botCommand<{ items: Channel[] }>("channels.list"),
        botCommand<{ items: Role[] }>("roles.list"),
        botCommand<Info>("overview"),
      ]);
      setChannels(chs.items); setRoles(rls.items); setInfo(overview);
      const rolesChannel = chs.items.find(c => normalized(c.name) === "roles" && [0,5].includes(c.type));
      if (rolesChannel) setChannelId(value => value || rolesChannel.id);
    } catch (e) { setProblem(e instanceof Error ? e.message : "Cannot load Discord configuration."); }
  }
  useEffect(() => { void refresh(); }, []);

  const matches = categories.map(spec => ({
    ...spec,
    category: channels.find(c => c.type === 4 && normalized(c.name) === spec.key),
    existingRole: roles.find(r => normalized(r.name) === spec.role),
  }));
  const instigator = roles.find(r => normalized(r.name) === "instigator");
  const botRole = roles.find(r => r.id === info?.bot_role_id);
  const unsafeInstigator = instigator && BigInt(instigator.permissions || "0") !== 0n;

  async function setup() {
    if (!info || !channelId || !/^\d{17,20}$/.test(messageId)) {
      setProblem("Choose the #roles channel and a valid message ID."); return;
    }
    if (matches.some(m => !m.category)) {
      setProblem("A required category is missing. Refresh Discord data and review the category names."); return;
    }
    if (matches.some(m => m.existingRole && (m.existingRole.managed ||
        m.existingRole.permissions !== "0" ||
        (botRole && m.existingRole.position >= botRole.position)))) {
      setProblem("An existing access role is managed, privileged, or above the bot. Fix its permissions before setup."); return;
    }
    const confirmed = window.confirm(
      "Configure six C0N category-access roles? This will create any missing access roles, deny @everyone View Channel on those six categories, allow their matching access roles, add six reactions to the selected post, and save emoji mappings. Other categories and other permission bits will be preserved. Continue?"
    );
    if (!confirmed) return;
    setWorking(true); setProblem(""); setDone(false);
    try {
      const mapped: { emoji: string; role_id: string }[] = [];
      for (const item of matches) {
        const category = item.category!;
        let role: RoleResult | Role | undefined = item.existingRole;
        if (!role) {
          setProgress("Creating " + item.name + "…");
          role = await botCommand<RoleResult>("roles.create", {
            name: item.name, permissions: "0", hoist: false, mentionable: false,
            reason: "C0N owner-approved category access setup",
          });
        }
        mapped.push({ emoji: item.emoji, role_id: role.id });
        setProgress("Configuring " + category.name + "…");
        const world = permissionsFor(category, info.id, false);
        await botCommand("channels.permissions", {
          id: category.id, role_id: info.id, ...world,
          reason: "C0N owner-approved category privacy gate",
        });
        const access = permissionsFor(category, role.id, true);
        await botCommand("channels.permissions", {
          id: category.id, role_id: role.id, ...access,
          reason: "C0N owner-approved category access role",
        });
      }
      setProgress("Adding selection emojis to the roles message…");
      await botCommand("reaction_roles.prepare", {
        channel_id: channelId, message_id: messageId,
        reason: "C0N owner-approved access reactions",
      });
      setProgress("Saving access mappings…");
      await saveMappings({ channel_id: channelId, message_id: messageId, mappings: mapped });
      setDone(true);
      setProgress("Configured! Six category access roles and emoji mappings are saved.");
      await refresh();
    } catch (e) {
      setProblem((e instanceof Error ? e.message : "Configuration failed.") +
        " Some steps may have succeeded. Refresh and inspect Discord before retrying.");
    } finally { setWorking(false); }
  }

  async function stripInstigator() {
    if (!instigator) return;
    if (!window.confirm("Remove ALL server-wide permissions from Instigator? This fixes its elevated permissions but preserves the role, its members, and existing channel-specific overrides.")) return;
    setWorking(true); setProblem(""); setProgress("Removing elevated Instigator permissions…");
    try {
      await botCommand("roles.edit", {
        id: instigator.id, name: instigator.name, permissions: "0",
        reason: "Remove elevated privileges from nonstaff Instigator status role",
      });
      await refresh();
      setProgress("Instigator server-wide permissions reset. Review its category overrides separately.");
    } catch (e) { setProblem(e instanceof Error ? e.message : "Could not update Instigator."); }
    finally { setWorking(false); }
  }

  return <section className="dx-panel dx-form">
    <h3>Guided category access setup</h3>
    <p>Configure the six self-selectable areas using dedicated roles. Staff, First Contact, The Unspoken, Live, and Administration are not modified.</p>
    <div className="dx-form">
      <label>Roles message channel
        <select value={channelId} onChange={e => setChannelId(e.target.value)} disabled={working}>
          <option value="">Choose #roles</option>
          {channels.filter(c => [0,5].includes(c.type)).map(c =>
            <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Existing roles message ID
        <input value={messageId} onChange={e => setMessageId(e.target.value)} disabled={working}/>
      </label>
      <div style={{ display:"grid", gap:8 }}>
        {matches.map(m => <p key={m.key}>
          {m.emoji} <strong>{m.name}</strong> → {m.category?.name || "Category not found"}
          {" · "}{m.existingRole ? "Role exists" : "Will create role"}
        </p>)}
      </div>
      <p><strong>Important:</strong> Existing member roles can still grant access, and child channels with unsynced permissions may differ from their categories. Review those in Discord after setup.</p>
      <button type="button" disabled={working || !info} onClick={() => void setup()}>
        {working ? "Applying configuration…" : "Configure six access roles and categories"}
      </button>
      <button type="button" disabled={working} onClick={() => void refresh()}>Refresh Discord roles and categories</button>
    </div>
    {instigator && <div>
      <h4>Instigator role check</h4>
      <p>{unsafeInstigator
        ? "Instigator has server-wide permissions. It should be a participation badge, not an administrative role."
        : "Instigator has no server-wide permissions. Check its category overrides separately if it still sees restricted sections."}</p>
      {unsafeInstigator && <button type="button" disabled={working} onClick={() => void stripInstigator()}>
        Remove Instigator's server-wide permissions
      </button>}
    </div>}
    {progress && <p role="status">{progress}</p>}
    {problem && <p role="alert" className="dx-error">{problem}</p>}
    {done && <p><strong>Setup saved.</strong> Review the #roles post and test by reacting from an Observer account. For channels with custom permissions, sync only those you want to inherit the category's overrides.</p>}
  </section>;
}
