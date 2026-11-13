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
} from "lucide-react";
import { adminApi as api } from "./adminApi";
import type { StorageStatus } from "./adminApi";
import DiscordExplorer from "./DiscordExplorer";
import DiscordFontTool from "./DiscordFontTool";
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
  | "update"
  | "project"
  | "webhooks"
  | "staff"
  | "reports"
  | "database"
  | "discord"
  | "audit"
  | "projectReports"
  | "font";
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
    ({
      projectReports:
        owner ||
        (permissions.includes("projects.publish") &&
          permissions.includes("website.publish")),
      discord: owner,
      font: owner,
      audit: owner,
      update: permissions.includes("updates.view"),
      project: permissions.includes("projects.view"),
      webhooks: permissions.includes("channels.manage"),
      staff: permissions.includes("staff.manage"),
      reports: permissions.includes("reports.view"),
      database: permissions.includes("database.manage"),
    })[tab];
  const [tab, setTab] = useState<Tab>(
    (
      ["update", "project", "reports", "webhooks", "staff", "database"] as Tab[]
    ).find((t) => allowed(t)) || "reports",
  );
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
    setTab(next);
    setDirty(false);
    setNotice("");
    setError("");
  }
  const items: [Tab, string, typeof Radio][] = [
    ["update", "Updates", Radio],
    ["project", "Featured projects", Terminal],
    ["reports", "Publishing reports", BarChart3],
    ["projectReports", "Reported projects", BarChart3],
    ["webhooks", "Publishing webhooks", Hash],
    ["staff", "Staff approval", Users],
    ["database", "Database", Database],
    ["discord", "Discord bot", Radio],
    ["font", "Discord text generator", Type],
    ["audit", "Content audit & restore", History],
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
        <span className="con-sidebar-label">WORKSPACE</span>
        {items
          .filter(([key]) => allowed(key))
          .map(([key, label, Icon]) => (
            <button
              title={label}
              key={key}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => choose(key)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
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
      {!permissions.length ? (
        <div className="con-surface con-tool-empty">
          Your account is approved, but no tools have been enabled. Ask an
          administrator to update your permissions.
        </div>
      ) : !allowed(tab) ? (
        <div className="con-tool-empty">
          This tool is not enabled for your account.
        </div>
      ) : tab === "font" ? (
        <DiscordFontTool />
      ) : tab === "audit" ? (
        <ContentAudit />
      ) : tab === "discord" ? (
        <DiscordExplorer />
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
