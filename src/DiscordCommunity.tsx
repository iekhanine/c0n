import { useEffect, useState } from "react";
type Member = {
  discord_id: string;
  name: string;
  avatar: string | null;
  joined_at?: string;
  messages?: number;
};
export type DiscordData = {
  connected: boolean;
  configured: boolean;
  member_count?: number;
  last_heartbeat?: string;
  members: Member[];
  builders: Member[];
  channels: { channel_id: string; name: string; messages: number }[];
  activity: { channel_id: string; name: string; occurred_at: string }[];
};
export function useDiscordCommunity() {
  const [data, setData] = useState<DiscordData | null>(null);
  useEffect(() => {
    const c = new AbortController();
    const load = () =>
      void fetch("/api/discord-bot?action=public", {
        signal: c.signal,
        cache: "no-store",
      })
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then(setData)
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, []);
  return data;
}
function Avatar({ member }: { member: Member }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = member.avatar
    ? `https://cdn.discordapp.com/avatars/${member.discord_id}/${member.avatar}.png?size=64`
    : null;
  return source && failedSource !== source ? (
    <img
      className="discord-member-avatar"
      src={source}
      alt=""
      loading="lazy"
      onError={() => setFailedSource(source)}
    />
  ) : (
    <span className="discord-member-avatar member-initial" aria-hidden="true">
      {[...member.name.trim()].slice(0, 2).join("").toUpperCase() || "?"}
    </span>
  );
}
export function DiscordStatus({ data }: { data: DiscordData | null }) {
  return (
    <p>
      <span className={`discord-status-dot ${data?.connected ? "live" : ""}`} />
      {data?.configured
        ? `${data.member_count || 0} server members · ${data.connected ? "Connected" : "Sync paused"}`
        : "Discord connection is being prepared."}
    </p>
  );
}
export function DiscordMembers({ data }: { data: DiscordData | null }) {
  return data?.members.length ? (
    <div className="fresh-members">
      {data.members.slice(0, 4).map((m) => (
        <div key={m.discord_id}>
          <Avatar member={m} />
          <span>{m.name}</span>
        </div>
      ))}
    </div>
  ) : (
    <p className="discord-activity-empty">
      Member arrivals will appear after the bot connects.
    </p>
  );
}
export function DiscordBuilders({ data }: { data: DiscordData | null }) {
  return data?.builders.length ? (
    <>
      {data.builders.slice(0, 4).map((m) => (
        <div className="activity-member" key={m.discord_id}>
          <Avatar member={m} />
          <strong>{m.name}</strong>
          <span>{m.messages} messages this week</span>
        </div>
      ))}
    </>
  ) : (
    <p className="discord-activity-empty">
      Member activity starts counting when selected channels are connected.
    </p>
  );
}
export function DiscordChannels({ data }: { data: DiscordData | null }) {
  return data?.channels.length ? (
    <>
      {data.channels.map((c) => (
        <div className="spotlight-row" key={c.channel_id}>
          <strong>#{c.name}</strong>
          <span>{c.messages}</span>
        </div>
      ))}
      <p className="discord-sync-label">
        Messages in selected channels · past 7 days
      </p>
    </>
  ) : (
    <p className="discord-activity-empty">
      Selected channels will appear here as people post.
    </p>
  );
}
export function DiscordActivity({ data }: { data: DiscordData | null }) {
  return data?.activity.length ? (
    <>
      {data.activity.map((c) => (
        <div className="server-activity" key={c.channel_id}>
          <span className="project-tag"># {c.name}</span>
          <time dateTime={c.occurred_at}>
            {new Date(c.occurred_at).toLocaleString()}
          </time>
        </div>
      ))}
    </>
  ) : (
    <p className="discord-activity-empty">
      {data?.connected
        ? "No activity recorded in the selected channels yet. Message text stays in Discord."
        : "Live activity will appear after the bot connects. Message text stays in Discord."}
    </p>
  );
}
