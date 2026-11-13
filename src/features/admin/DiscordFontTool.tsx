import { useState } from "react";
import { Copy, Check, Type } from "lucide-react";
import "./DiscordFontTool.css";

const regular = "abcdefghijklmnopqrstuvwxyz";
const smallCaps = [..."ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ"];
// This is the same Unicode small-caps alphabet used for C0N Discord category names.
export function toDiscordSmallCaps(value: string): string {
  return [...value].map(character => {
    const index = regular.indexOf(character.toLowerCase());
    return index < 0 ? character : smallCaps[index];
  }).join("");
}
export default function DiscordFontTool() {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [frame, setFrame] = useState(true);
  const text = toDiscordSmallCaps(input);
  const output = frame && text.trim() ? "[ " + text + " ]" : text;
  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return <section className="con-font-tool con-surface">
    <div className="con-font-heading"><Type size={24}/><div><h2>Discord small-caps converter</h2>
    <p>Convert ordinary text into the styled lettering used throughout C0N. Numbers, punctuation, emoji and spaces remain unchanged.</p></div></div>
    <label htmlFor="con-font-source">Regular text</label>
    <textarea id="con-font-source" rows={4} maxLength={2000}
      placeholder="The Compound, Games, or whatever you want to call it…"
      value={input} onChange={e => { setInput(e.target.value); setCopied(false); }}/>
    <label className="con-font-frame"><input type="checkbox" checked={frame}
      onChange={e => setFrame(e.target.checked)}/> Wrap in [ brackets ] for category names</label>
    <label htmlFor="con-font-result">Discord-ready text</label>
    <textarea id="con-font-result" rows={4} readOnly value={output}
      aria-label="Converted Discord lettering"/>
    <div className="con-font-actions">
      <button type="button" disabled={!output} onClick={() => void copy()}>
        {copied ? <Check size={16}/> : <Copy size={16}/>}
        {copied ? "Copied" : "Copy converted text"}
      </button>
      <button type="button" onClick={() => { setInput(""); setCopied(false); }}>Clear</button>
    </div>
    <p className="con-font-note">Unicode lettering, not a font installation. Some characters render differently between devices.</p>
  </section>;
}
