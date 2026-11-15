import { useEffect, useState } from "react";
import {
  BarChart3,
  History,
  Database,
  Hash,
  Radio,
  Terminal,
  Users,
  Type,
  Layers,
  CheckSquare,
  Gamepad2,
  ListOrdered,
} from "lucide-react";
import { adminApi as api } from "./adminApi";
import type { StorageStatus } from "./adminApi";
import DiscordExplorer from "./DiscordExplorer";
import {NavigationEditor} from "../../PublicNavigation";
import DiscordFontTool from "./DiscordFontTool";
import ProjectApprovals from "./ProjectApprovals";
import ProjectCategories from "./ProjectCategories";
import ContentAudit from "./ContentAudit";
import { Editable, CopyRegion } from "../../SiteText";
import Posts from "./Posts";
import Channels from "./Channels";
import Staff from "./Staff";
import ProjectReports from "./ProjectReports";
import Reports from "./Reports";
import "./Publishing.css";
import "./Workflow.css";
type Tab =
  | "overview"
  | "update"
  | "project"
  | "webhooks"
  | "staff"
  | "reports"
  | "database"
  | "discord"
  | "games"
  | "navigation"
  | "audit"
  | "projectReports"
  | "font"
  | "approvals"
  | "categories";
export default function Publishing({
  permissions,
  owner = false,
  authorName,
  currentId,
  allChannels,
  channelIds,
}: {
  permissions: string[];
  owner?: boolean;
  authorName: string;
  currentId: string;
  allChannels: boolean;
  channelIds: string[];
}) {
  const allowed = (tab: Tab) =>
    tab === "overview" ? true : ({
      projectReports:
        owner ||
        (permissions.includes("projects.publish") &&
          permissions.includes("website.publish")),
      discord: owner,
      games: owner,
      navigation: owner,
      font: owner,
      approvals: owner || (permissions.includes("projects.publish") && permissions.includes("website.publish")),
      categories: owner || (permissions.includes("projects.publish") && permissions.includes("website.publish")),
      audit: owner,
      update: permissions.includes("updates.view"),
      project: permissions.includes("projects.view"),
      webhooks: permissions.includes("channels.manage"),
      staff: permissions.includes("staff.manage"),
      reports: permissions.includes("reports.view"),
      database: permissions.includes("database.manage"),
    })[tab];
  const initialPage = (): Tab => {
    const slug = window.location.pathname.replace(/\/$/, "").split("/")[2] || "overview";
    const match = (["overview", "update", "project", "approvals", "categories", "reports", "projectReports", "webhooks", "staff", "database", "discord", "games", "navigation", "font", "audit"] as Tab[]).find(t => t === slug);
    return match || "overview";
  };
  const [tab, setTab] = useState<Tab>(initialPage);
  useEffect(() => {
    const onPop = () => setTab(initialPage());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [status, setStatus] = useState<StorageStatus | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    let active = true;
    api<StorageStatus>("status")
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  function choose(next: Tab) {
    if (dirty && !window.confirm("Discard unsaved post changes?")) return;
    window.history.pushState(null, "", next === "overview" ? "/admin" : "/admin/" + next);
    setTab(next);
    setDirty(false);
    setNotice("");
    setError("");
  }
  const groups: { title: string; items: [Tab, string, typeof Radio][] }[] = [
    { title: "COMMAND CENTER", items: [["overview", "Overview", BarChart3]] },
    { title: "COMMUNITY WEBSITE", items: [
      ["update", "Transmissions", Radio], ["project", "Featured projects", Terminal],
      ["approvals", "Project approvals", CheckSquare], ["categories", "Creator categories", Layers],
      ["navigation", "Site navigation", ListOrdered], ["audit", "Content history", History],
      ["projectReports", "Project reports", BarChart3], ["reports", "Publishing reports", BarChart3]
    ] },
    { title: "THE COMPOUND", items: [["games", "Game management", Gamepad2]] },
    { title: "DISCORD BOT", items: [
      ["discord", "Bot configuration", Radio], ["webhooks", "Publishing channels", Hash],
      ["font", "Text generator", Type]
    ] },
    { title: "SYSTEM & ACCESS", items: [["staff", "Staff permissions", Users], ["database", "Database health", Database]] },
  ];
  async function storage(update = false) {
    setBusy(true);
    setError("");
    try {
      if (update) await api("setup", "POST", {});
      setStatus(await api<StorageStatus>("status"));
      setNotice(
        update
          ? "Storage is up to date. Existing posts and channels were preserved."
          : "Connection checked.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="con-publishing"
      data-section={tab}
      aria-label="Community publishing"
    >
      <nav className="con-tool-tabs" aria-label="Admin tools">
        {groups.map((group) => {
          const visible = group.items.filter(([key]) => allowed(key));
          if (!visible.length) return null;
          return <div key={group.title} className="con-nav-group">
            <span className="con-sidebar-label">{group.title}</span>
            {visible.map(([key, label, Icon]) => (
              <a key={key} href={key === "overview" ? "/admin" : "/admin/" + key}
                aria-current={tab === key ? "page" : undefined}
                onClick={e => { e.preventDefault(); choose(key); }}
                title={label}>
                <Icon size={18} /> <span>{label}</span>
              </a>
            ))}
          </div>;
        })}
        <div className="con-sidebar-footer">
          <span className="con-online-dot" />
          Community control<small>BUILD. SHARE. SHIP.</small>
        </div>
      </nav>
      <CopyRegion
        ids={[
          "admin.eyebrow",
          `admin.${tab}.title`,
          `admin.${tab}.description`,
        ]}
      >
        <header className="con-workspace-heading">
          <CopyRegion ids={["admin.eyebrow"]}>
            <span className="con-label">
              <Editable id="admin.eyebrow" />
            </span>
          </CopyRegion>
          <CopyRegion ids={[`admin.${tab}.title`]}>
            <h1>
              <Editable id={`admin.${tab}.title`} />
            </h1>
          </CopyRegion>
          <CopyRegion ids={[`admin.${tab}.description`]}>
            <p>
              <Editable id={`admin.${tab}.description`} />
            </p>
          </CopyRegion>
        </header>
      </CopyRegion>
      {error && (
        <div role="alert" className="con-tool-error">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="con-tool-notice">
          {notice}
        </p>
      )}
      {tab === "overview" ? (
        <div className="con-admin-overview"><h2>Choose a system to manage</h2><div className="con-admin-systems">
          <a href="/admin/update"><strong>Community website</strong><span>Posts, projects, navigation, moderation and content history</span></a>
          <a href="https://thecompound.cultofnixon.com/"><strong>The Compound</strong><span>Resident profiles, apartments, assignments and progression</span></a>
          <a href="/admin/discord"><strong>Discord bot</strong><span>Bot configuration, channel connections and tools</span></a>
          <a href="/admin/staff"><strong>System access</strong><span>Staff approvals, permissions and database health</span></a>
        </div></div>
      ) : !permissions.length ? (
        <div className="con-surface con-tool-empty">
          Your account is approved, but no tools have been enabled. Ask an
          administrator to update your permissions.
        </div>
      ) : !allowed(tab) ? (
        <div className="con-tool-empty">
          This tool is not enabled for your account.
        </div>
      ) : tab === "approvals" ? (
        <ProjectApprovals />
      ) : tab === "categories" ? (
        <ProjectCategories />
      ) : tab === "font" ? (
        <DiscordFontTool />
      ) : tab === "audit" ? (
        <ContentAudit />
      ) : tab === "discord" ? (
        <DiscordExplorer />
      ) : tab === "games" ? (
        <div className="con-database-panel"><h2>The Compound</h2><p>Game administration has a dedicated application and data model.</p><a className="con-primary" href="https://thecompound.cultofnixon.com/">Open Compound administration</a><p>Legacy facility controls remain available at <a href="/facility/control">Facility controls</a>.</p></div>
      ) : tab === "navigation" ? (
        <NavigationEditor />
      ) : tab === "database" || !status?.initialized || status.needs_upgrade ? (
        <div className="con-database-panel">
          <span className="con-label">STORAGE STATUS</span>
          <h2>
            {status?.needs_upgrade
              ? "An update is ready."
              : status?.initialized
                ? "Database connected."
                : "Connect your publishing tools."}
          </h2>
          <p>
            {status?.needs_upgrade
              ? "Apply the update to enable pending-account approvals and individual permission checkboxes. Existing posts and channels are preserved."
              : "Check the connection and initialize CoN storage if needed."}
          </p>
          <dl>
            <div>
              <dt>Connection</dt>
              <dd>{status?.connected ? "CONNECTED" : "NOT VERIFIED"}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>
                {status?.needs_upgrade
                  ? "UPDATE AVAILABLE"
                  : status?.initialized
                    ? "READY"
                    : "NOT INITIALIZED"}
              </dd>
            </div>
          </dl>
          <div className="con-button-row">
            <button disabled={busy} onClick={() => void storage()}>
              Check connection
            </button>
            {permissions.includes("database.manage") &&
              (!status?.initialized || status.needs_upgrade) && (
                <button
                  className="con-primary"
                  disabled={busy || !status?.connected}
                  onClick={() => void storage(true)}
                >
                  {busy
                    ? "Working…"
                    : status?.initialized
                      ? "Apply storage update"
                      : "Initialize CoN storage"}
                </button>
              )}
          </div>
          {!permissions.includes("database.manage") && (
            <p>Ask an administrator to initialize or update storage.</p>
          )}
        </div>
      ) : tab === "staff" ? (
        <Staff
          currentId={currentId}
          permissions={permissions}
          allChannels={allChannels}
          channelIds={channelIds}
        />
      ) : tab === "projectReports" ? (
        <ProjectReports />
      ) : tab === "reports" ? (
        <Reports />
      ) : tab === "webhooks" ? (
        <Channels />
      ) : (
        <Posts
          key={tab}
          kind={tab === "project" ? "project" : "update"}
          permissions={permissions}
          authorName={authorName}
          owner={owner}
          onDirty={setDirty}
        />
      )}
    </section>
  );
}
