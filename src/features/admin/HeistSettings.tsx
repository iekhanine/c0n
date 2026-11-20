import { useEffect, useState } from "react";
import { adminApi } from "./adminApi";

type HeistSettings = {
  enabled: boolean;
  success_percent: number;
  steal_percent: number;
  maximum_theft: number;
  failure_penalty: number;
  attacker_cooldown_minutes: number;
  victim_protection_minutes: number;
  minimum_target_balance: number;
};
const fields: {key: keyof Omit<HeistSettings,"enabled">;label:string;help:string;min:number;max:number;unit:string}[] = [
 {key:"success_percent",label:"Success chance",help:"Chance that an attempted robbery succeeds.",min:0,max:100,unit:"%"},
 {key:"steal_percent",label:"Amount stolen",help:"Percentage of the target's available wallet, before the maximum cap.",min:1,max:100,unit:"%"},
 {key:"maximum_theft",label:"Maximum theft",help:"Most money a robber can take from a victim in a single heist.",min:1,max:1000000,unit:"$"},
 {key:"failure_penalty",label:"Failure penalty",help:"Up to this amount moves from the robber to the victim on failure.",min:0,max:1000000,unit:"$"},
 {key:"attacker_cooldown_minutes",label:"Robber cooldown",help:"Minutes a player must wait before trying another heist.",min:0,max:10080,unit:"min"},
 {key:"victim_protection_minutes",label:"Victim protection",help:"Minutes before anyone can rob this victim again.",min:0,max:10080,unit:"min"},
 {key:"minimum_target_balance",label:"Minimum target wallet",help:"Players with less money than this cannot be targeted.",min:1,max:1000000,unit:"$"},
];

export default function HeistSettingsPanel() {
  const [saved,setSaved]=useState<HeistSettings|null>(null);
  const [draft,setDraft]=useState<HeistSettings|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    let active=true;
    adminApi<{settings:HeistSettings}>("heist-settings")
      .then(({settings})=>{if(active){setSaved(settings);setDraft(settings);}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Couldn't load heist settings");});
    return ()=>{active=false;};
  },[]);
  const dirty=Boolean(saved && draft && JSON.stringify(saved)!==JSON.stringify(draft));
  async function save(){
    if(!draft)return;
    setBusy(true);setError("");setNotice("");
    try{
      const {settings}=await adminApi<{settings:HeistSettings}>("heist-settings","POST",draft);
      setSaved(settings);setDraft(settings);setNotice("Saved. New heist attempts use these settings immediately.");
    }catch(e){setError(e instanceof Error?e.message:"Save failed");}
    finally{setBusy(false);}
  }
  return <div className="con-database-panel con-heist-settings">
    <span className="con-label">COMPOUND / THE HEIST</span>
    <h2>Heist rules</h2>
    <p>Control player theft, risk and cooldowns. These values apply to new attempts without restarting the bot. All transfers use existing Compound Dollar wallets.</p>
    {error&&<div className="con-tool-error" role="alert">{error}</div>}
    {notice&&<p className="con-tool-notice" role="status">{notice}</p>}
    {!draft ? (!error&&<p>Loading current rules…</p>) : <>
      <label className="con-heist-toggle">
        <input type="checkbox" checked={draft.enabled} onChange={e=>{setDraft({...draft,enabled:e.target.checked});setNotice("");}}/>
        <span><strong>Enable The Heist</strong><small>Disable to immediately reject all new robbery attempts.</small></span>
      </label>
      <div className="con-heist-grid">{fields.map(f=><label className="con-heist-field" key={f.key}>
        <strong>{f.label}</strong>
        <small>{f.help}</small>
        <span className="con-heist-input">
          <input type="number" min={f.min} max={f.max} step="1" value={draft[f.key]}
          onChange={e=>{setDraft({...draft,[f.key]:e.target.value===""?NaN:Number(e.target.value)});setNotice("");}}/>
          <span>{f.unit}</span>
        </span>
      </label>)}</div>
      <div className="con-button-row">
        <button className="con-primary" type="button" disabled={!dirty||busy||fields.some(f=>!Number.isSafeInteger(draft[f.key])||draft[f.key]<f.min||draft[f.key]>f.max)} onClick={()=>void save()}>
          {busy?"Saving…":"Save heist rules"}
        </button>
        <button type="button" disabled={!dirty||busy} onClick={()=>{setDraft(saved);setNotice("");setError("");}}>Discard changes</button>
      </div>
      <p><small>Changes are logged in the game audit trail. Values affect future attempts only, not completed transactions.</small></p>
    </>}
  </div>;
}
