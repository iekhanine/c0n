import { useEffect, useState } from "react";
type Status = {
  guild_id: string;
  channel_ids: string[];
  publish_members: boolean;
  channels: { id: string; name: string }[];
  last_heartbeat: string | null;
  member_count: number;
  bot_id: string | null;
  bot_name: string | null;
  key_configured: boolean;
  application_id: string;
};
async function api(action: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/discord-bot?action=" + action, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Connection failed.");
  return d;
}
export default function DiscordConnection() {
  const [status, setStatus] = useState<Status | null>(null),
    [guild, setGuild] = useState(""),
    [channels, setChannels] = useState<string[]>([]),
    [publish, setPublish] = useState(true),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      const s = await api("status");
      setStatus(s);
      setGuild(s.guild_id);
      setChannels(s.channel_ids);
      setPublish(s.publish_members);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load bot settings.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      await api("settings", "PUT", {
        guild_id: guild,
        channel_ids: channels,
        publish_members: publish,
      });
      await load();
      setNotice(
        "Settings saved. The worker picks up channel changes within a minute.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function rotate() {
    if (
      status?.key_configured &&
      !window.confirm(
        "Replace the worker key? The current worker will stop syncing until Railway is updated.",
      )
    )
      return;
    setBusy(true);
    try {
      const d = await api("key", "POST", {});
      setKey(d.key);
      await load();
      setNotice(
        "Copy the key into Railway as CON_SYNC_KEY. It is shown only on this page until you leave.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate key.");
    } finally {
      setBusy(false);
    }
  }
  const connected =
    status?.last_heartbeat &&
    Date.now() - Date.parse(status.last_heartbeat) < 180000;
  const invite = `https://discord.com/oauth2/authorize?client_id=${status?.application_id || "1570103248453509281"}&scope=bot%20applications.commands&permissions=1100451236918${guild ? "&guild_id=" + encodeURIComponent(guild) + "&disable_guild_select=true" : ""}`;
  return (
    <section className="member-workspace discord-connection">
      <header>
        <h2>Discord bot connection</h2>
        <p>
          The worker syncs members and activity from the channels you select. It
          does not copy message text or grant staff access.
        </p>
      </header>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="discord-status-card">
        <strong>
          {connected
            ? "CONNECTED"
            : status?.key_configured
              ? "WAITING FOR WORKER"
              : "SETUP REQUIRED"}
        </strong>
        <p>
          {status?.bot_name || "C0N bot"} · {status?.member_count || 0} server
          members
        </p>
        <p>
          Last sync:{" "}
          {status?.last_heartbeat
            ? new Date(status.last_heartbeat).toLocaleString()
            : "Not connected yet"}
        </p>
        <button disabled={busy} onClick={() => void load()}>
          Refresh connection
        </button>
      </div>
      <div className="workspace-layout">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3>1. Connect your Discord server</h3>
          <label>
            Discord server ID
            <input
              value={guild}
              onChange={(e) => setGuild(e.target.value.trim())}
              pattern="[0-9]{17,20}"
              required
              placeholder="Right-click your server → Copy Server ID"
            />
          </label>
          <p>
            Enable Developer Mode in Discord’s Advanced settings to copy IDs.
          </p>
          <label>
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            Show member names and avatars on the community website
          </label>
          <h3>Channels to include</h3>
          {!status?.channels.length && (
            <p>
              The public channel checklist appears after the worker first
              connects. Activity sharing starts with no channels selected.
            </p>
          )}
          {status?.channels.map((c) => (
            <label key={c.id} className="discord-channel-option">
              <input
                type="checkbox"
                checked={channels.includes(c.id)}
                onChange={(e) =>
                  setChannels((v) =>
                    e.target.checked
                      ? [...v, c.id]
                      : v.filter((id) => id !== c.id),
                  )
                }
              />
              #{c.name}
            </label>
          ))}
          <button disabled={busy}>Save server settings</button>
          <p>
            <a href={invite} target="_blank" rel="noreferrer">
              Add the C0N bot to this Discord server ↗
            </a>
          </p>
          <p>
            <a
              href="https://discord.com/developers/applications/1570103248453509281/bot"
              target="_blank"
              rel="noreferrer"
            >
              Open the existing Discord application ↗
            </a>
          </p>
        </form>
        <section>
          <h3>2. Configure the Railway worker</h3>
          <p>
            In the Discord application’s Bot page, enable{" "}
            <strong>Server Members Intent</strong>. Message Content Intent is
            not required.
          </p>
          <p>
            Use the C0N repository with <code>bot/Dockerfile</code>. Keep the
            build root at the repository root and sleep mode disabled.
          </p>
          <dl>
            <dt>DISCORD_BOT_TOKEN</dt>
            <dd>Enter the bot token directly in Railway’s secret variables.</dd>
            <dt>CON_SYNC_KEY</dt>
            <dd>Generate it below, then copy it into Railway.</dd>
            <dt>CON_SITE_URL</dt>
            <dd>https://c0n.ivansays.com</dd>
          </dl>
          <button
            disabled={busy || !status?.guild_id}
            onClick={() => void rotate()}
          >
            {status?.key_configured
              ? "Replace worker key"
              : "Generate worker key"}
          </button>
          {key && (
            <label>
              Worker connection key — copy before leaving
              <input type="password" readOnly value={key} autoComplete="off" />
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(key)
                    .then(() => setNotice("Worker key copied."))
                    .catch(() => setError("Select and copy the key manually."))
                }
              >
                Copy key
              </button>
            </label>
          )}
          <p>
            3. Deploy the worker, then return here and choose the activity
            channels.
          </p>
          <p>
            Try <code>/con site</code>, <code>/con projects</code>, or{" "}
            <code>/con me</code> in Discord after it connects.
          </p>
        </section>
      </div>
    </section>
  );
}
