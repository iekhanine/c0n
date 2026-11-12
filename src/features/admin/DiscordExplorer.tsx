import { useEffect, useRef, useState } from "react";
import {
  Folder,
  FolderOpen,
  Hash,
  Users,
  Shield,
  Radio,
  Settings,
  History,
  RefreshCw,
  ChevronRight,
  Search,
  Plus,
  ArrowUpRight,
  Bot,
  KeyRound,
} from "lucide-react";
import DiscordConnection from "./DiscordConnection";
import ReactionRoles from "./ReactionRoles";
import { destructive, smallCaps } from "../../../shared/discord-control.js";
import "./DiscordExplorer.css";
type Page =
  | "overview"
  | "channels"
  | "roles"
  | "reaction-roles"
  | "members"
  | "bans"
  | "webhooks"
  | "settings"
  | "permissions"
  | "connection"
  | "history";
type Item = {
  id: string;
  name?: string;
  username?: string;
  type?: number;
  parent?: string | null;
  position?: number;
  topic?: string;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  userLimit?: number;
  color?: string;
  permissions?: string;
  hoist?: boolean;
  mentionable?: boolean;
  managed?: boolean;
  nickname?: string;
  roles?: string[];
  bot?: boolean;
  reason?: string;
  channel_id?: string;
  usable?: boolean;
  overwrites?: { id: string; type: number; allow: string; deny: string }[];
  operation?: string;
  actor_name?: string;
  state?: string;
  error?: string;
  created_at?: string;
  target_id?: string;
};
type Overview = {
  id: string;
  name: string;
  description: string;
  member_count: number;
  owner_id: string;
  bot_role: string;
  bot_role_id: string;
  invite: string;
  verificationLevel: number;
  defaultMessageNotifications: number;
  explicitContentFilter: number;
  permissions: { name: string; bot: boolean; actor: boolean }[];
};
type Result = {
  items?: Item[];
  next?: string | null;
  id?: string;
  state?: string;
  result?: unknown;
  error?: string;
  url?: string;
  webhook_id?: string;
};
const groups: { name: string; items: [Page, string, typeof Folder][] }[] = [
  {
    name: "SERVER",
    items: [
      ["overview", "Overview", Folder],
      ["channels", "Channels & categories", Hash],
      ["roles", "Roles", Shield],
      ["reaction-roles", "Reaction roles", Shield],
      ["settings", "Server settings", Settings],
    ],
  },
  {
    name: "PEOPLE",
    items: [
      ["members", "Members", Users],
      ["bans", "Banned users", Shield],
    ],
  },
  { name: "PUBLISHING", items: [["webhooks", "Webhooks & messages", Radio]] },
  {
    name: "SYSTEM",
    items: [
      ["permissions", "Permissions", KeyRound],
      ["connection", "Connection & privacy", Bot],
      ["history", "Action history", History],
    ],
  },
];
const pageTitle = (page: Page) =>
  groups.flatMap((g) => g.items).find(([key]) => key === page)?.[1] || page;
async function request(
  action: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch(`/api/discord-bot?action=${action}`, {
    method,
    signal,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Discord request failed.");
  return d;
}
const permissionChoices: [string, string][] = [
  ["1024", "View channels"],
  ["2048", "Send messages"],
  ["65536", "Read message history"],
  ["16384", "Embed links"],
  ["32768", "Attach files"],
  ["64", "Add reactions"],
  ["1048576", "Connect to voice"],
  ["2097152", "Speak in voice"],
  ["8192", "Manage messages"],
  ["16", "Manage channels"],
  ["268435456", "Manage roles"],
  ["134217728", "Manage nicknames"],
  ["536870912", "Manage webhooks"],
  ["2", "Kick members"],
  ["4", "Ban members"],
  ["1099511627776", "Timeout members"],
  ["32", "Manage server"],
];
const bitHas = (value: string | undefined, bit: string) => {
  try {
    return (BigInt(value || "0") & BigInt(bit)) !== 0n;
  } catch {
    return false;
  }
};
const channelType = (type?: number) =>
  ({
    0: "Text",
    2: "Voice",
    4: "Category",
    5: "Announcement",
    13: "Stage",
    15: "Forum",
  })[type || 0] || "Channel";
export default function DiscordExplorer() {
  const [page, setPage] = useState<Page>("overview"),
    [collapsed, setCollapsed] = useState<string[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null),
    [items, setItems] = useState<Item[]>([]),
    [channels, setChannels] = useState<Item[]>([]),
    [roles, setRoles] = useState<Item[]>([]);
  const [selection, setSelection] = useState<Item | null>(null),
    [creating, setCreating] = useState(false),
    [query, setQuery] = useState(""),
    [form, setForm] = useState<Record<string, string>>({}),
    [mode, setMode] = useState("edit");
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [lastResult, setLastResult] = useState<Result | null>(null);
  const life = useRef<AbortController | null>(null),
    lock = useRef(false);

  async function command(
    operation: string,
    payload: Record<string, unknown> = {},
  ): Promise<unknown> {
    const signal = life.current?.signal;
    const { id } = await request(
      "control_command",
      "POST",
      { operation, payload, request_id: crypto.randomUUID() },
      signal,
    );
    for (let i = 0; i < 60; i++) {
      if (signal?.aborted) throw Error("Request cancelled.");
      const item = await request(
        `control_result&id=${encodeURIComponent(id)}`,
        "GET",
        undefined,
        signal,
      );
      if (item.state === "succeeded") return item.result;
      if (["failed", "uncertain", "expired"].includes(item.state))
        throw Error(
          item.error ||
            "The action could not be confirmed. Check Action history.",
        );
      setStatus(
        item.state === "running"
          ? "The bot is working…"
          : "Waiting for the bot…",
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw Error(
      "Still waiting for confirmation. Check Action history before retrying.",
    );
  }
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setStatus("Connecting to Discord…");
    try {
      await work();
      setStatus("Up to date.");
    } catch (e) {
      if (!life.current?.signal.aborted) {
        setError(e instanceof Error ? e.message : "Request failed.");
        setStatus("");
      }
    } finally {
      lock.current = false;
      if (!life.current?.signal.aborted) setBusy(false);
    }
  }
  async function load(target: Page, after?: string) {
    if (["overview", "settings", "permissions"].includes(target)) {
      const data = (await command("overview")) as Overview;
      setOverview(data);
      if (target === "settings")
        setForm({
          name: data.name,
          description: data.description,
          verificationLevel: String(data.verificationLevel),
          defaultMessageNotifications: String(data.defaultMessageNotifications),
          explicitContentFilter: String(data.explicitContentFilter),
          reason: "",
        });
      return;
    }
    if (target === "history") {
      const d = await request(
        "control_history",
        "GET",
        undefined,
        life.current?.signal,
      );
      setItems(d.items);
      return;
    }
    if (target === "connection" || target === "reaction-roles") return;
    const data = (await command(
      `${target}.list`,
      after ? { after } : {},
    )) as Result;
    setItems((old) =>
      after ? [...old, ...(data.items || [])] : data.items || [],
    );
    setNext(data.next || null);
    if (target === "channels") setChannels(data.items || []);
    if (target === "roles") setRoles(data.items || []);
  }
  useEffect(() => {
    const controller = new AbortController();
    life.current = controller;
    queueMicrotask(() => {
      if (!controller.signal.aborted) void run(() => load("overview"));
    });
    return () => controller.abort();
  }, []); // Navigation owns subsequent refreshes.
  function navigate(target: Page) {
    if (busy) return;
    if (selection || creating) {
      if (
        !window.confirm("Leave this editor? Unsaved changes will be discarded.")
      )
        return;
    }
    setPage(target);
    setItems([]);
    setSelection(null);
    setCreating(false);
    setQuery("");
    setForm({});
    setNext(null);
    setLastResult(null);
    void run(() => load(target));
  }
  function select(item: Item) {
    setSelection(item);
    setCreating(false);
    setLastResult(null);
    setMode("edit");
    setError("");
    setForm({
      id: item.id,
      name: item.name || "",
      topic: item.topic || "",
      parent: item.parent || "",
      position: String(item.position || 0),
      type: String(item.type || 0),
      rateLimitPerUser: String(item.rateLimitPerUser || 0),
      userLimit: String(item.userLimit || 0),
      nsfw: String(!!item.nsfw),
      color: item.color || "#000000",
      permissions: item.permissions || "0",
      hoist: String(!!item.hoist),
      mentionable: String(!!item.mentionable),
      nickname: item.nickname || "",
      reason: "",
      role_id: "",
      remove: "false",
      minutes: "60",
      content: "",
      message_id: "",
      channel_id: item.channel_id || "",
      confirm: "",
    });
  }
  function create() {
    setSelection(null);
    setCreating(true);
    setMode("edit");
    setLastResult(null);
    setForm({
      name: "",
      type: "0",
      parent: "",
      topic: "",
      rateLimitPerUser: "0",
      userLimit: "0",
      nsfw: "false",
      color: "#000000",
      permissions: "0",
      hoist: "false",
      mentionable: "false",
      reason: "",
      channel_id: "",
      id: "",
      confirm: "",
    });
  }
  const field = (key: string, label: string, type = "text", hint?: string) => (
    <label key={key}>
      {label}
      <input
        type={type}
        value={form[key] || ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
  const dropdown = (
    key: string,
    label: string,
    options: [string, string][],
  ) => (
    <label>
      {label}
      <select
        value={form[key] || ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const check = (key: string, label: string) => (
    <label className="dx-check">
      <input
        type="checkbox"
        checked={form[key] === "true"}
        onChange={(e) =>
          setForm((f) => ({ ...f, [key]: String(e.target.checked) }))
        }
      />
      {label}
    </label>
  );
  const permissionPicker = () => (
    <fieldset className="dx-permission-grid">
      <legend>Role permissions</legend>
      {permissionChoices.map(([bit, label]) => (
        <label className="dx-check" key={bit}>
          <input
            type="checkbox"
            checked={bitHas(form.permissions, bit)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                permissions: String(
                  e.target.checked
                    ? BigInt(f.permissions || "0") | BigInt(bit)
                    : BigInt(f.permissions || "0") & ~BigInt(bit),
                ),
              }))
            }
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
  const overridePicker = () => (
    <fieldset className="dx-permission-grid">
      <legend>Channel permissions</legend>
      {permissionChoices
        .filter(([bit]) =>
          [
            "1024",
            "2048",
            "65536",
            "16384",
            "32768",
            "64",
            "1048576",
            "2097152",
            "8192",
            "16",
          ].includes(bit),
        )
        .map(([bit, label]) => (
          <label key={bit}>
            {label}
            <select
              value={
                bitHas(form.allow, bit)
                  ? "allow"
                  : bitHas(form.deny, bit)
                    ? "deny"
                    : "inherit"
              }
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  allow: String(
                    (BigInt(f.allow || "0") & ~BigInt(bit)) |
                      (e.target.value === "allow" ? BigInt(bit) : 0n),
                  ),
                  deny: String(
                    (BigInt(f.deny || "0") & ~BigInt(bit)) |
                      (e.target.value === "deny" ? BigInt(bit) : 0n),
                  ),
                }))
              }
            >
              <option value="inherit">Inherit</option>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
            </select>
          </label>
        ))}
    </fieldset>
  );
  const styleName = () =>
    setForm((f) => ({ ...f, name: smallCaps(f.name || "") }));
  async function submit(operation: string, payload: Record<string, unknown>) {
    if (
      destructive(operation) &&
      !window.confirm(
        `${operation}: target ${String(payload.id)}. This changes the live Discord server. Continue?`,
      )
    )
      return;
    if (
      !destructive(operation) &&
      !window.confirm("Apply this change to the live Discord server?")
    )
      return;
    await run(async () => {
      const data = (await command(operation, {
        ...payload,
        reason: form.reason,
        ...(destructive(operation) ? { confirm: form.confirm } : {}),
      })) as Result;
      setLastResult(data);
      setSelection(null);
      setCreating(false);
      await load(page);
    });
  }
  function save() {
    const id = selection?.id || form.id;
    if (page === "channels")
      return submit(creating ? "channels.create" : "channels.edit", {
        id,
        name: form.name,
        ...(creating ? { type: Number(form.type) } : {}),
        parent: form.parent || null,
        topic: form.topic || "",
        position: Number(form.position || 0),
        rateLimitPerUser: Number(form.rateLimitPerUser || 0),
        userLimit: Number(form.userLimit || 0),
        nsfw: form.nsfw === "true",
      });
    if (page === "roles")
      return submit(creating ? "roles.create" : "roles.edit", {
        id,
        name: form.name,
        color: form.color,
        permissions: form.permissions || "0",
        hoist: form.hoist === "true",
        mentionable: form.mentionable === "true",
      });
    if (page === "webhooks")
      return submit(creating ? "webhooks.create" : "webhooks.edit", {
        id,
        name: form.name,
        channel_id: form.channel_id,
      });
    if (page === "settings")
      return submit("guild.edit", {
        name: form.name,
        description: form.description || "",
        verificationLevel: Number(form.verificationLevel),
        defaultMessageNotifications: Number(form.defaultMessageNotifications),
        explicitContentFilter: Number(form.explicitContentFilter),
      });
  }
  const ordered =
    page === "channels"
      ? [
          ...items.filter((i) => !i.parent && i.type !== 4),
          ...items
            .filter((i) => i.type === 4)
            .flatMap((category) => [
              category,
              ...items.filter((c) => c.parent === category.id),
            ]),
          ...items.filter(
            (i) => i.parent && !items.some((c) => c.id === i.parent),
          ),
        ]
      : items;
  const filtered = ordered.filter(
    (i) =>
      `${i.name || ""} ${i.username || ""} ${i.id} ${i.operation || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) ||
      `${i.name || ""}`.includes(smallCaps(query)),
  );
  const editing = selection || creating;
  const isCategory = Number(form.type) === 4;
  const referenceRoles = async () => {
    await run(async () => {
      setRoles(((await command("roles.list")) as Result).items || []);
    });
  };
  const referenceChannels = async () => {
    await run(async () => {
      setChannels(((await command("channels.list")) as Result).items || []);
    });
  };
  return (
    <section
      className="dx-explorer"
      aria-label="Discord server administration"
      aria-busy={busy}
    >
      <div className="dx-address">
        <Folder size={17} />
        <span>C0N</span>
        <ChevronRight size={14} />
        <span>Discord server</span>
        <ChevronRight size={14} />
        <strong>{pageTitle(page)}</strong>
        <span className="dx-owner">OWNER ACCESS</span>
      </div>
      <div className="dx-layout">
        <nav className="dx-tree" aria-label="Discord features">
          {groups.map((group) => (
            <div key={group.name}>
              <button
                className="dx-group"
                aria-expanded={!collapsed.includes(group.name)}
                onClick={() =>
                  setCollapsed((c) =>
                    c.includes(group.name)
                      ? c.filter((n) => n !== group.name)
                      : [...c, group.name],
                  )
                }
              >
                <ChevronRight
                  size={13}
                  className={
                    !collapsed.includes(group.name) ? "dx-expanded" : ""
                  }
                />
                <FolderOpen size={15} />
                {group.name}
              </button>
              {!collapsed.includes(group.name) &&
                group.items.map(([key, label, Icon]) => (
                  <button
                    key={key}
                    disabled={busy}
                    aria-current={page === key ? "page" : undefined}
                    onClick={() => navigate(key)}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
            </div>
          ))}
          <p className="dx-tree-note">
            cultofnixon
            <br />
            <strong>ꜱᴏᴜʟʟᴇꜱꜱ</strong>
            <small>Live server controls</small>
          </p>
        </nav>
        <div className="dx-content">
          <header className="dx-toolbar">
            <div>
              <span className="con-label">DISCORD / {page.toUpperCase()}</span>
              <h2>{pageTitle(page)}</h2>
            </div>
            <button
              disabled={busy}
              title="Refresh from Discord"
              onClick={() => void run(() => load(page))}
            >
              <RefreshCw size={16} className={busy ? "dx-spin" : ""} />
              Refresh
            </button>
          </header>
          <div className="dx-status" role="status">
            {busy ? (
              <span className="dx-working" />
            ) : (
              <span className="dx-dot" />
            )}
            {status || "Ready"}
            {busy && (
              <small>Keep this page open. Actions appear in history.</small>
            )}
          </div>
          {error && (
            <div role="alert" className="dx-error">
              {error}
            </div>
          )}
          {lastResult && (
            <div className="dx-result" role="status">
              Action completed.
              {lastResult.id && (
                <>
                  {" "}
                  ID: <code>{lastResult.id}</code>
                </>
              )}
              {lastResult.url && (
                <a href={lastResult.url} target="_blank" rel="noreferrer">
                  View Discord message <ArrowUpRight size={14} />
                </a>
              )}
            </div>
          )}
          {page === "connection" ? (
            <DiscordConnection />
          ) : page === "reaction-roles" ? (
            <ReactionRoles />
          ) : ["overview", "permissions"].includes(page) ? (
            <>
              {overview && (
                <>
                  <div className="dx-server">
                    <Bot size={32} />
                    <div>
                      <h3>{overview.name}</h3>
                      <code>{overview.id}</code>
                    </div>
                    <span>{overview.member_count} members</span>
                  </div>
                  {page === "overview" && (
                    <div className="dx-folders">
                      {groups
                        .flatMap((g) => g.items)
                        .filter(([key]) => key !== "overview")
                        .map(([key, label, Icon]) => (
                          <button
                            key={key}
                            disabled={busy}
                            onClick={() => navigate(key)}
                          >
                            <Icon size={26} />
                            <strong>{label}</strong>
                            <span>Open workspace →</span>
                          </button>
                        ))}
                    </div>
                  )}
                  <div className="dx-panel">
                    <h3>Permissions & role hierarchy</h3>
                    <p>
                      Bot’s highest role: <strong>{overview.bot_role}</strong>.
                      Place its integration role above the roles and members it
                      should manage. Discord protects the server owner and
                      higher roles.
                    </p>
                    <a
                      className="dx-invite"
                      href={overview.invite}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Update bot permissions in Discord{" "}
                      <ArrowUpRight size={16} />
                    </a>
                    <p>
                      Updating access does not create channels, post messages,
                      or moderate anyone.
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Permission</th>
                          <th>Your account</th>
                          <th>Bot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.permissions.map((p) => (
                          <tr key={p.name}>
                            <td>{p.name.replace(/([A-Z])/g, " $1").trim()}</td>
                            <td>{p.actor ? "Granted" : "Missing"}</td>
                            <td className={p.bot ? "dx-granted" : "dx-missing"}>
                              {p.bot ? "Granted" : "Missing"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : page === "settings" ? (
            <form
              className="dx-panel dx-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <h3>General server settings</h3>
              {field("name", "Server name")}
              {field("description", "Description")}
              {dropdown("verificationLevel", "Verification level", [
                ["0", "None"],
                ["1", "Low: verified email"],
                ["2", "Medium: account older than 5 minutes"],
                ["3", "High: member longer than 10 minutes"],
                ["4", "Highest: verified phone"],
              ])}
              {dropdown(
                "defaultMessageNotifications",
                "Default notifications",
                [
                  ["0", "All messages"],
                  ["1", "Only mentions"],
                ],
              )}
              {dropdown("explicitContentFilter", "Media content filter", [
                ["0", "Disabled"],
                ["1", "Members without roles"],
                ["2", "All members"],
              ])}
              {field("reason", "Audit reason")}
              <button className="dx-primary" disabled={busy || !overview}>
                Save server settings
              </button>
            </form>
          ) : (
            <>
              <div className="dx-list-tools">
                <label className="dx-search">
                  <Search size={16} />
                  <input
                    aria-label="Filter items"
                    placeholder="Filter by name or ID…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span>{items.length} items</span>
                {["channels", "roles", "webhooks"].includes(page) && (
                  <button disabled={busy} onClick={create}>
                    <Plus size={16} />
                    Create{" "}
                    {page === "channels"
                      ? "channel / category"
                      : page === "roles"
                        ? "role"
                        : "webhook"}
                  </button>
                )}
                {page === "members" && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      create();
                      setMode("ban");
                    }}
                  >
                    Ban by user ID
                  </button>
                )}
              </div>
              <div className={`dx-workarea ${editing ? "dx-has-editor" : ""}`}>
                <div className="dx-file-list">
                  {page === "history" ? (
                    <>
                      <p className="dx-help">
                        Last 100 requests, newest first. Uncertain actions are
                        never replayed automatically. Check Discord before
                        repeating one.
                      </p>
                      <table>
                        <thead>
                          <tr>
                            <th>Action / target</th>
                            <th>Actor / reason</th>
                            <th>State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((i) => (
                            <tr key={i.id}>
                              <td>
                                <button
                                  className="dx-item"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      const d = await request(
                                        `control_result&id=${encodeURIComponent(i.id)}`,
                                        "GET",
                                        undefined,
                                        life.current?.signal,
                                      );
                                      if (d.error) throw Error(d.error);
                                      setLastResult(d.result || { id: i.id });
                                    })
                                  }
                                >
                                  <strong>{i.operation}</strong>
                                </button>
                                <small>{i.target_id || i.id}</small>
                                <small>
                                  {i.created_at
                                    ? new Date(i.created_at).toLocaleString()
                                    : ""}
                                </small>
                              </td>
                              <td>
                                {i.actor_name}
                                <small>{i.reason}</small>
                              </td>
                              <td>
                                <span className={`dx-state dx-${i.state}`}>
                                  {i.state}
                                </span>
                                {i.error && <small>{i.error}</small>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>
                            {page === "channels"
                              ? "Type / category"
                              : page === "members"
                                ? "Account"
                                : page === "bans"
                                  ? "Ban reason"
                                  : page === "webhooks"
                                    ? "Channel"
                                    : "Permissions"}
                          </th>
                          <th>ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((item) => (
                          <tr
                            key={item.id}
                            className={
                              selection?.id === item.id ? "dx-selected" : ""
                            }
                          >
                            <td>
                              <button
                                className="dx-item"
                                style={
                                  page === "channels" && item.parent
                                    ? { paddingLeft: 18 }
                                    : undefined
                                }
                                disabled={busy}
                                onClick={() => select(item)}
                              >
                                {page === "channels" ? (
                                  item.type === 4 ? (
                                    <Folder size={16} />
                                  ) : (
                                    <Hash size={15} />
                                  )
                                ) : page === "members" ? (
                                  <Users size={16} />
                                ) : (
                                  <Shield size={16} />
                                )}
                                <span>
                                  {item.name || item.id}
                                  {item.managed && (
                                    <small>Managed by Discord</small>
                                  )}
                                </span>
                              </button>
                            </td>
                            <td>
                              {page === "channels" ? (
                                <>
                                  {channelType(item.type)}
                                  <small>
                                    {
                                      channels.find((c) => c.id === item.parent)
                                        ?.name
                                    }
                                  </small>
                                </>
                              ) : page === "members" ? (
                                item.bot ? (
                                  "Bot"
                                ) : (
                                  item.username
                                )
                              ) : page === "bans" ? (
                                item.reason || "No reason recorded"
                              ) : page === "webhooks" ? (
                                channels.find((c) => c.id === item.channel_id)
                                  ?.name || item.channel_id
                              ) : (
                                item.permissions
                              )}
                            </td>
                            <td>
                              <code>{item.id}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {!filtered.length && (
                    <div className="dx-empty">
                      <FolderOpen size={32} />
                      <h3>
                        {busy
                          ? "Loading from Discord…"
                          : query
                            ? "No matching items"
                            : "Nothing here yet"}
                      </h3>
                      <p>
                        {query
                          ? "Try another name or ID."
                          : "Refresh to check Discord, or create an item where available."}
                      </p>
                    </div>
                  )}
                  {next && (
                    <button
                      disabled={busy}
                      onClick={() => void run(() => load(page, next))}
                    >
                      Load next 100
                    </button>
                  )}
                </div>
                {editing && (
                  <form
                    className="dx-inspector dx-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save();
                    }}
                  >
                    <header>
                      <h3>
                        {creating
                          ? "Create new"
                          : selection?.name || selection?.id}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setSelection(null);
                          setCreating(false);
                        }}
                      >
                        Close
                      </button>
                    </header>
                    {selection && (
                      <code className="dx-target-id">{selection.id}</code>
                    )}
                    {page === "channels" && (
                      <>
                        {field("name", "Name")}
                        <button type="button" onClick={styleName}>
                          Apply ɢᴇɴᴇʀᴀʟ style
                        </button>
                        {creating &&
                          dropdown("type", "Channel type", [
                            ["0", "Text"],
                            ["2", "Voice"],
                            ["4", "Category"],
                            ["5", "Announcement"],
                            ["13", "Stage"],
                            ["15", "Forum"],
                          ])}
                        {!isCategory && (
                          <>
                            {dropdown("parent", "Category", [
                              ["", "No category"],
                              ...channels
                                .filter(
                                  (c) => c.type === 4 && c.id !== selection?.id,
                                )
                                .map(
                                  (c) =>
                                    [c.id, c.name || c.id] as [string, string],
                                ),
                            ])}
                            {field("topic", "Topic")}
                            {field(
                              "rateLimitPerUser",
                              "Slowmode (seconds)",
                              "number",
                            )}
                            {field(
                              "userLimit",
                              "Voice user limit (0 = unlimited)",
                              "number",
                            )}
                            {check("nsfw", "Age restricted")}
                          </>
                        )}
                        {field("position", "Position", "number")}
                      </>
                    )}
                    {page === "roles" && (
                      <>
                        {selection?.managed && (
                          <p className="dx-help">
                            Discord manages this integration role. Its settings
                            cannot be changed here.
                          </p>
                        )}
                        {field("name", "Role name")}
                        <button type="button" onClick={styleName}>
                          Apply small caps
                        </button>
                        {field("color", "Role color", "color")}
                        {permissionPicker()}
                        <small>
                          Administrator cannot be granted from this panel.
                          Existing permissions not listed here are preserved.
                        </small>
                        {check("hoist", "Display members separately")}
                        {check("mentionable", "Allow role mentions")}
                      </>
                    )}
                    {page === "members" && (
                      <>
                        <label>
                          Member action
                          <select
                            value={mode}
                            onChange={(e) => setMode(e.target.value)}
                          >
                            <option value="edit">Nickname</option>
                            <option value="role">Assign / remove role</option>
                            <option value="timeout">
                              Timeout / remove timeout
                            </option>
                            <option value="kick">Kick</option>
                            <option value="ban">Ban</option>
                          </select>
                        </label>
                        {creating && field("id", "Discord user ID")}
                        {mode === "edit" &&
                          field("nickname", "Nickname (blank to reset)")}
                        {mode === "role" && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void referenceRoles()}
                            >
                              Load server roles
                            </button>
                            {dropdown("role_id", "Role", [
                              ["", "Select role"],
                              ...roles
                                .filter(
                                  (r) => !r.managed && r.id !== overview?.id,
                                )
                                .map(
                                  (r) =>
                                    [r.id, r.name || r.id] as [string, string],
                                ),
                            ])}
                            {check("remove", "Remove this role")}
                          </>
                        )}
                        {mode === "timeout" &&
                          field(
                            "minutes",
                            "Timeout minutes (0 removes timeout)",
                            "number",
                          )}
                        <p className="dx-help">
                          Kicks and bans do not delete message history. The
                          server owner, your account, and this bot are
                          protected.
                        </p>
                      </>
                    )}
                    {page === "bans" && (
                      <p className="dx-help">
                        Unbanning allows this account to join again using an
                        invite. It does not add them back automatically.
                      </p>
                    )}
                    {page === "webhooks" && (
                      <>
                        <label>
                          Action
                          <select
                            value={mode}
                            onChange={(e) => setMode(e.target.value)}
                          >
                            <option value="edit">
                              {creating ? "Create webhook" : "Rename webhook"}
                            </option>
                            {!creating && (
                              <>
                                <option value="send">Send message</option>
                                <option value="message.edit">
                                  Edit posted message
                                </option>
                                <option value="message.delete">
                                  Delete posted message
                                </option>
                              </>
                            )}
                          </select>
                        </label>
                        {mode === "edit" && field("name", "Webhook name")}
                        {creating && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void referenceChannels()}
                            >
                              Load text channels
                            </button>
                            {dropdown("channel_id", "Channel", [
                              ["", "Select channel"],
                              ...channels
                                .filter((c) => [0, 5].includes(c.type || 0))
                                .map(
                                  (c) =>
                                    [c.id, c.name || c.id] as [string, string],
                                ),
                            ])}
                          </>
                        )}
                        {mode.startsWith("message.") &&
                          field("message_id", "Discord message ID")}
                        {["send", "message.edit"].includes(mode) && (
                          <>
                            <label>
                              Message
                              <textarea
                                maxLength={2000}
                                rows={7}
                                value={form.content || ""}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    content: e.target.value,
                                  }))
                                }
                              />
                            </label>
                            <small>
                              Mentions are disabled. Edits apply only to
                              messages from this webhook.
                            </small>
                            <div className="dx-message-preview">
                              {form.content || "Message preview"}
                            </div>
                          </>
                        )}
                      </>
                    )}
                    {field("reason", "Audit reason")}
                    {(page === "bans" ||
                      (page === "members" && ["kick", "ban"].includes(mode)) ||
                      (page === "webhooks" && mode === "message.delete")) &&
                      field(
                        "confirm",
                        `Type target ID to confirm: ${selection?.id || form.id}`,
                      )}
                    <div className="dx-actions">
                      {["channels", "roles"].includes(page) ||
                      (page === "webhooks" && mode === "edit") ? (
                        <button
                          className="dx-primary"
                          disabled={busy || !!selection?.managed}
                        >
                          Save{" "}
                          {page === "channels"
                            ? "channel / category"
                            : page === "roles"
                              ? "role"
                              : "webhook"}
                        </button>
                      ) : page === "members" ? (
                        <button
                          type="button"
                          disabled={busy}
                          className={
                            ["kick", "ban"].includes(mode)
                              ? "dx-danger"
                              : "dx-primary"
                          }
                          onClick={() =>
                            void submit(
                              `members.${mode === "edit" ? "nickname" : mode}`,
                              {
                                id: selection?.id || form.id,
                                nickname: form.nickname,
                                role_id: form.role_id,
                                remove: form.remove === "true",
                                minutes: Number(form.minutes),
                              },
                            )
                          }
                        >
                          Apply {mode === "edit" ? "nickname" : mode}
                        </button>
                      ) : page === "bans" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void submit("bans.remove", { id: selection?.id })
                          }
                        >
                          Unban user
                        </button>
                      ) : page === "webhooks" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void submit(`webhooks.${mode}`, {
                              id: selection?.id,
                              message_id: form.message_id,
                              content: form.content,
                            })
                          }
                        >
                          {mode === "send"
                            ? "Send message"
                            : mode === "message.edit"
                              ? "Update posted message"
                              : "Delete posted message"}
                        </button>
                      ) : null}
                    </div>
                    {selection &&
                      ["channels", "roles", "webhooks"].includes(page) && (
                        <details className="dx-danger-zone">
                          <summary>
                            Delete{" "}
                            {page === "channels"
                              ? "channel / category"
                              : page === "roles"
                                ? "role"
                                : "webhook"}
                          </summary>
                          <p>
                            This affects the live server. Deleted channels and
                            their history cannot be restored.
                          </p>
                          {field("confirm", `Type ${selection.id} to confirm`)}
                          <button
                            type="button"
                            disabled={busy || !!selection.managed}
                            className="dx-danger"
                            onClick={() =>
                              void submit(`${page}.delete`, {
                                id: selection.id,
                              })
                            }
                          >
                            Delete permanently
                          </button>
                        </details>
                      )}
                    {page === "channels" && selection && (
                      <details className="dx-permissions-editor">
                        <summary>Role permission overrides</summary>
                        <p>
                          Choose a role, load its current settings, then allow,
                          deny, or inherit each permission. Other roles are
                          preserved.
                        </p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void referenceRoles()}
                        >
                          Load server roles
                        </button>
                        <label>
                          Role
                          <select
                            value={form.role_id || ""}
                            onChange={(e) => {
                              const roleId = e.target.value,
                                o = selection.overwrites?.find(
                                  (o) => o.id === roleId,
                                );
                              setForm((f) => ({
                                ...f,
                                role_id: roleId,
                                allow: o?.allow || "0",
                                deny: o?.deny || "0",
                              }));
                            }}
                          >
                            <option value="">Select role</option>
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const o = selection.overwrites?.find(
                              (o) => o.id === form.role_id,
                            );
                            setForm((f) => ({
                              ...f,
                              allow: o?.allow || "0",
                              deny: o?.deny || "0",
                            }));
                          }}
                        >
                          Load current override
                        </button>
                        {overridePicker()}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void submit("channels.permissions", {
                              id: selection.id,
                              role_id: form.role_id,
                              allow: form.allow || "0",
                              deny: form.deny || "0",
                            })
                          }
                        >
                          Save override
                        </button>
                      </details>
                    )}
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
