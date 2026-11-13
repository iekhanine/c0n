import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, X, GripVertical, Gamepad2, ArrowUpRight, MessageCircle, Users, Zap, Activity } from "lucide-react";
import {
  useDiscordCommunity, DiscordStatus, DiscordMembers,
  DiscordChannels, DiscordActivity, DiscordBuilders,
} from "./DiscordCommunity";
import { useSiteContent } from "./SiteText";
import { MemberPostHighlights } from "./MemberPostHighlights";

const LAYOUT_KEY = "layout.discord.sidebar";
type Section = "overview" | "channels" | "activity" | "members" | "builders" | "posts";
const options: { id: Section; label: string }[] = [
  { id: "overview", label: "Server overview" },
  { id: "channels", label: "Most active channels" },
  { id: "activity", label: "Recent activity" },
  { id: "members", label: "Fresh faces" },
  { id: "builders", label: "Active members" },
  { id: "posts", label: "Top 5 member posts" },
];
const fallback: Section[] = ["overview", "posts", "channels", "activity", "members"];
function parseLayout(value?: string): Section[] {
  try {
    const saved = JSON.parse(value || "");
    if (!Array.isArray(saved)) return fallback;
    const ids: Section[] = [];
    for (const key of saved) {
      if (options.some(o => o.id === key) && !ids.includes(key)) ids.push(key);
    }
    // Existing custom layouts predate member posts. Add the new section once,
    // but respect the owner's later decision to remove it.
    if (!saved.includes("__member_posts_v1") && !ids.includes("posts"))
      ids.splice(Math.min(1, ids.length), 0, "posts");
    return ids;
  } catch { return fallback; }
}
export default function DiscordSidebar() {
  const discord = useDiscordCommunity();
  const { entries, owner, editing, change, revision } = useSiteContent();
  const current = entries[LAYOUT_KEY];
  const stored = current?.removed ? fallback : parseLayout(current?.value);
  const [order, setOrder] = useState<Section[]>(stored);
  const [editingLayout, setEditingLayout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState<Section | null>(null);
  useEffect(() => { if (!editingLayout) setOrder(stored); }, [current?.value, current?.version, revision, editingLayout]);
  useEffect(() => { if (!editing) { setEditingLayout(false); setError(""); } }, [editing]);
  const move = (id: Section, target: number) => {
    setOrder(old => {
      const next = old.filter(x => x !== id);
      next.splice(Math.max(0, Math.min(next.length, target)), 0, id);
      return next;
    });
  };
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      await change(LAYOUT_KEY, JSON.stringify(["__member_posts_v1", ...order]), current?.version || 0, false);
      setEditingLayout(false);
      setNotice("Layout saved for all visitors.");
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save layout."); }
    finally { setBusy(false); }
  }
  const cards: Record<Section, { label: string; content: React.ReactNode; icon: React.ReactNode }> = {
    overview: {
      label: "Server overview", icon: <Gamepad2 size={18}/>,
      content: <div className="discord-overview-compact">
        <div className="discord-overview-count"><strong>{discord?.member_count ?? "—"}</strong><span>members</span></div>
        <DiscordStatus data={discord}/>
        <a href="https://discord.gg/dSHMeZ4ETJ" target="_blank" rel="noreferrer">Join C0N <ArrowUpRight size={13}/></a>
      </div>,
    },
    channels: { label: "Most active channels", icon: <MessageCircle size={17}/>, content: <DiscordChannels data={discord}/> },
    activity: { label: "Recent server activity", icon: <Activity size={17}/>, content: <DiscordActivity data={discord}/> },
    members: { label: "Fresh faces", icon: <Users size={17}/>, content: <DiscordMembers data={discord}/> },
    builders: { label: "Active members", icon: <Zap size={17}/>, content: <DiscordBuilders data={discord}/> },
    posts: { label: "Top member posts", icon: <MessageCircle size={17}/>, content: <MemberPostHighlights/> },
  };
  return <aside className="showcase-rail con-discord-sidebar" aria-label="Discord community overview">
    {owner && editing && <section className="rail-card con-sidebar-editor">
      <div className="con-sidebar-edit-head">
        <strong>Site layout</strong>
        <button type="button" onClick={() => { setEditingLayout(x => !x); setOrder(stored); }}>
          {editingLayout ? "Close editor" : "Arrange sections"}
        </button>
      </div>
      {editingLayout && <>
        <p>Drag or use arrows to rearrange. Remove a section from the sidebar or add it back. Save to update the layout for everyone.</p>
        <div className="con-sidebar-edit-list">
          {order.map((id, index) => <div key={id} className="con-sidebar-edit-row"
              draggable={!busy}
              onDragStart={e => { setDrag(id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {e.preventDefault();if (drag) move(drag,index);setDrag(null);}}
              onDragEnd={() => setDrag(null)}>
            <GripVertical size={16}/>
            <span>{cards[id].label}</span>
            <button title="Move up" aria-label={"Move "+cards[id].label+" up"} disabled={index===0||busy} onClick={() => move(id,index-1)}><ArrowUp size={15}/></button>
            <button title="Move down" aria-label={"Move "+cards[id].label+" down"} disabled={index===order.length-1||busy} onClick={() => move(id,index+1)}><ArrowDown size={15}/></button>
            <button title="Remove section" aria-label={"Remove "+cards[id].label} disabled={busy} onClick={() => setOrder(v => v.filter(x => x!==id))}><X size={15}/></button>
          </div>)}
        </div>
        <label>Add section
          <select disabled={busy} value="" onChange={e => {const id=e.target.value as Section;if(id&&!order.includes(id))setOrder(v=>[...v,id]);}}>
            <option value="">Choose a section…</option>
            {options.filter(item=>!order.includes(item.id)).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div className="con-sidebar-edit-actions">
          <button type="button" disabled={busy} onClick={() => setOrder(fallback)}>Reset</button>
          <button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save site-wide layout"}</button>
        </div>
      </>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>}
    {stored.map(id => <section key={id} className="rail-card con-discord-section">
      <h2>{cards[id].icon}{cards[id].label}</h2>
      {cards[id].content}
    </section>)}
  </aside>;
}
